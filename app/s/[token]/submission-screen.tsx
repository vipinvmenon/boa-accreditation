'use client'

import { useEffect, useRef, useState } from 'react'
import { submissionSchema, submitResultSchema, type RosterRow, type SubmissionInput } from '@/lib/schemas/submission'
import type { OrgView } from '@/lib/schemas/org-view'
import { z } from 'zod'

/**
 * Transcribed from design/source/boa_design_body.html lines 246-317 and the
 * shared footer at 556-559 (docs/DESIGN-SYSTEM.md). The persistent desk nav /
 * BMS status bar that wraps every screen in the design bundle is NOT included
 * here: it is review-bundle furniture, the same category as the WEB/MOB/LIGHT
 * toggle DESIGN-SYSTEM.md already excludes, and this is a public,
 * unauthenticated surface (docs/ARCHITECTURE.md) that must not show desk
 * navigation or live ops numbers it has no business seeing. Decided 12 Sep
 * 2026 — see docs/CURRENT-STATE.md, ACC-025. scripts/capture-design-reference.mjs
 * hides that same chrome when capturing this screen's reference.
 *
 * The design's mock shows a two-button flow ("Add to list" then "Submit N for
 * approval") implying a local draft before one batch submit — this is that
 * flow, for real, superseding the earlier ACC-032 single-shot version this
 * comment used to describe. "Add to list" only stages a draft in local
 * React state (`handleAdd`); nothing reaches the server until "Submit N for
 * approval →" (`handleSubmitDrafts`) posts each draft to the real
 * `boa_acc_submit` RPC in turn, one call per person.
 *
 * "Your list" merges the token's real roster (`boa_acc_org_roster`, ACC-091)
 * with drafts not yet submitted — it is not session-only any more; a reload
 * shows the org's real submitted/approved/rejected people, not just what
 * this browser session added.
 */

const FORM_FIELDS = [
  { key: 'fullName', label: 'Full name', placeholder: 'As it appears on their ID', hint: 'Exactly as on their photo ID. No initials.' },
  { key: 'phone', label: 'Mobile', placeholder: '+91', hint: 'Used only to resend their pass.' },
  { key: 'roleText', label: 'Role at the festival', placeholder: 'Rigger, FOH engineer, loader', hint: 'Free text is fine.' },
] as const

type FieldKey = (typeof FORM_FIELDS)[number]['key']

type Draft = SubmissionInput & { id: string }
type ListEntry = { name: string; role: string; state: string; statusClass: 'ok' | 'wait' | 'no' | 'mute' }
const draftSchema = submissionSchema.extend({ id: z.string().min(1) })

const ERROR_COPY: Record<string, string> = {
  not_found: 'This link is no longer valid.',
  org_closed: 'Registration for this organisation is closed. Nobody else can be added — contact the accreditation desk.',
  quota_exceeded: "This organisation's quota is full. Contact the accreditation desk to raise it.",
  rate_limited: 'Too many attempts from this link — wait a moment and try again.',
  invalid_body: 'Check what you typed and try again.',
  internal: "That didn't go through. Try again.",
}

/**
 * Duplicate phone is not a mistake to fix by inventing a different number —
 * the person is already registered. Named separately from ERROR_COPY because
 * it needs the phone the coordinator just typed, not a generic sentence.
 */
function duplicatePhoneCopy(phone: string): string {
  return `${phone} is already registered for this organisation. No action needed — they are already on the list.`
}

function errorMessage(code: string | null, phone: string): string {
  if (code === 'duplicate_phone') return duplicatePhoneCopy(phone)
  return (code && ERROR_COPY[code]) ?? ERROR_COPY['internal']!
}

export function SubmissionScreen({
  token,
  initialOrg,
  initialRoster,
}: {
  token: string
  initialOrg: OrgView
  initialRoster: RosterRow[]
}) {
  const [org, setOrg] = useState(initialOrg)
  const [roster, setRoster] = useState(initialRoster)
  const storageKey = `boa-submission-drafts:${token}`
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [fields, setFields] = useState<Record<FieldKey, string>>({ fullName: '', phone: '', roleText: '' })
  const [vehicleOn, setVehicleOn] = useState(false)
  const [vehicleReg, setVehicleReg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ code: string | null; message: string } | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const didHydrateDrafts = useRef(false)
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return
    try {
      const parsed: unknown = JSON.parse(stored)
      if (!Array.isArray(parsed)) return
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDrafts(parsed.flatMap((value) => {
        const result = draftSchema.safeParse(value)
        return result.success ? [result.data] : []
      }))
    } catch {
      window.localStorage.removeItem(storageKey)
    }
  }, [storageKey])

  useEffect(() => {
    if (!didHydrateDrafts.current) {
      didHydrateDrafts.current = true
      return
    }
    window.localStorage.setItem(storageKey, JSON.stringify(drafts))
  }, [drafts, storageKey])

  useEffect(() => {
    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in')
          reveal.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12 })
    document.querySelectorAll<HTMLElement>('.screen.on .rv').forEach((element) => reveal.observe(element))
    return () => reveal.disconnect()
  }, [])

  const pct = org.quota > 0 ? Math.min(100, (org.used / org.quota) * 100) : 0
  const closed = org.status !== 'open'
  const full = org.remaining <= 0

  function handleAdd() {
    if (submitting || closed || full) return
    setError(null)
    setConfirmation(null)

    const parsed = submissionSchema.safeParse({
      fullName: fields.fullName,
      phone: fields.phone,
      roleText: fields.roleText,
      vehicleReg: vehicleOn ? vehicleReg : undefined,
    })
    if (!parsed.success) {
      setError({ code: 'invalid_body', message: ERROR_COPY['invalid_body'] ?? 'Check what you typed and try again.' })
      return
    }

    setDrafts((current) => [...current, { ...parsed.data, id: crypto.randomUUID() }])
    setConfirmation(`${parsed.data.fullName} saved as a draft. Submit the list when you're ready.`)
    setFields({ fullName: '', phone: '', roleText: '' })
    setVehicleOn(false)
    setVehicleReg('')
  }

  async function handleSubmitDrafts() {
    if (submitting || closed || drafts.length === 0) return
    setSubmitting(true)
    setError(null)
    setConfirmation(null)
    let remainingDrafts = drafts
    let duplicateMessage: string | null = null
    let stoppedOnFailure = false
    try {
      for (const draft of drafts) {
        const payload: SubmissionInput = {
          fullName: draft.fullName,
          phone: draft.phone,
          roleText: draft.roleText,
          vehicleReg: draft.vehicleReg,
        }
        const res = await fetch(`/api/s/${encodeURIComponent(token)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body: unknown = await res.json().catch(() => null)
        if (!res.ok) {
          const code = body && typeof body === 'object' && 'error' in body ? String(body.error) : null
          if (code === 'duplicate_phone') {
            remainingDrafts = remainingDrafts.filter((item) => item.id !== draft.id)
            duplicateMessage = `${draft.fullName} is already registered. That draft was removed.`
            continue
          }
          setError({ code, message: errorMessage(code, draft.phone) })
          stoppedOnFailure = true
          break
        }
        const parsedResult = submitResultSchema.safeParse(body)
        if (!parsedResult.success) {
          setError({ code: 'internal', message: ERROR_COPY['internal'] ?? "That didn't go through. Try again." })
          stoppedOnFailure = true
          break
        }
        remainingDrafts = remainingDrafts.filter((item) => item.id !== draft.id)
        setRoster((current) => [...current, { fullName: draft.fullName, roleText: draft.roleText, status: 'submitted' }])
        setOrg((current) => ({ ...current, used: current.used + 1, remaining: Math.max(0, current.remaining - 1) }))
      }
      setDrafts(remainingDrafts)
      if (!stoppedOnFailure) {
        setConfirmation(duplicateMessage ?? 'Your list was submitted for approval.')
      }
    } catch {
      setDrafts(remainingDrafts)
      setError({ code: 'internal', message: ERROR_COPY['internal'] ?? "That didn't go through. Try again." })
    } finally {
      setSubmitting(false)
    }
  }

  const disableAdd = submitting || closed || full
  const statusEntry = (row: RosterRow): ListEntry => ({
    name: row.fullName,
    role: row.roleText,
    state: row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Submitted',
    statusClass: row.status === 'approved' ? 'ok' : row.status === 'rejected' ? 'no' : 'wait',
  })
  const yourList = [
    ...roster.map(statusEntry),
    ...drafts.map((draft): ListEntry => ({ name: draft.fullName, role: draft.roleText, state: 'Draft', statusClass: 'mute' })),
  ]

  return (
    <div className="frame">
      <main>
        <section className="screen on">
          <div className="head rv">
            <div>
              <span className="tag">Your organisation&apos;s link</span>
              <h1 className="h1">Register your crew</h1>
              <p className="lede">Add everyone who will work the festival. Each person gets their own pass and collects their own wristband. We only ask for name, phone, role and vehicle.</p>
            </div>
          </div>
          <div className="sub-grid">
            <div style={{ display: 'grid', gap: '16px' }}>
              <div className="bz rv" style={{ '--d': 1 } as React.CSSProperties}>
                <div className="pl pad quota">
                  <span className="mono">Registering for</span>
                  <h2 className="h2" style={{ margin: '10px 0 26px' }}>{org.name}</h2>
                  <div className="v num"><span className="s-seat-count">{org.used}</span><small>of {org.quota} places used</small></div>
                  <div className="meter s-seat-bar"><i style={{ '--w': `${pct / 100}` } as React.CSSProperties} /></div>
                  <span className="mono">{org.remaining} places left</span>
                </div>
              </div>
              <div className="bz rv" style={{ '--d': 3 } as React.CSSProperties}>
                <div className="pl plist">
                  <div className="list-head"><span className="mono">Your list</span><span className="mono">{yourList.length} people</span></div>
                  {yourList.map((x, i) => (
                    <div className="li" key={`${x.name}-${i}`}>
                      <div><div className="who">{x.name}</div><div className="why">{x.role}</div></div>
                      <span className={`st ${x.statusClass}`}>{x.state}</span>
                    </div>
                  ))}
                  {yourList.length === 0 && <p className="why" style={{ padding: '15px 22px' }}>Nobody added yet in this session.</p>}
                </div>
              </div>
            </div>
            <div className="bz rv" style={{ '--d': 2 } as React.CSSProperties}>
              <div className="pl pad">
                <form className="form" onSubmit={(event) => { event.preventDefault(); handleAdd() }} noValidate>
                  {FORM_FIELDS.map((f) => (
                    <div className="field" key={f.key}>
                      <label htmlFor={`submission-${f.key}`}>{f.label}</label>
                      <input
                        id={`submission-${f.key}`}
                        value={fields[f.key]}
                        onChange={(e) => { setFields((v) => ({ ...v, [f.key]: e.target.value })); setConfirmation(null) }}
                        placeholder={f.placeholder}
                        inputMode={f.key === 'phone' ? 'tel' : undefined}
                        disabled={closed}
                      />
                      <span className="hint">{f.hint}</span>
                    </div>
                  ))}
                  <div className="toggle">
                    <button type="button" className="sw" role="switch" aria-checked={vehicleOn} aria-label="Bringing a vehicle" disabled={closed} onClick={() => setVehicleOn((v) => !v)} />
                    <div><b>Bringing a vehicle</b><span>A sticker is issued at check-in, tied to this plate only.</span></div>
                  </div>
                  <div className={`reveal${vehicleOn ? ' open' : ''}`} aria-hidden={!vehicleOn} inert={!vehicleOn}><div><div className="field plate"><label htmlFor="submission-vehicle">Vehicle registration</label><input id="submission-vehicle" value={vehicleReg} onChange={(e) => { setVehicleReg(e.target.value.toUpperCase()); setConfirmation(null) }} placeholder="KA 05 MJ 8871" disabled={closed} /></div></div></div>
                  <button type="submit" className="btn go big" disabled={disableAdd}>Add to list<span className="ic" aria-hidden="true">＋</span></button>
                  {drafts.length > 0 && <button type="button" className="btn gold solo" disabled={submitting || closed} onClick={handleSubmitDrafts}>Submit {drafts.length} for approval →</button>}
                  {error && <p role={error.code === 'duplicate_phone' ? 'status' : 'alert'} className="s-anim-in" style={{ color: error.code === 'duplicate_phone' ? 'var(--gold)' : 'var(--bad)' }}>{error.message}</p>}
                  {!error && confirmation && <p role="status" className="s-anim-in-strong" style={{ color: 'var(--grn)' }}>{confirmation}</p>}
                  {!error && closed && <p className="why">This organisation is closed. Registration will not reopen by retrying — contact the accreditation desk if this is wrong.</p>}
                  {!error && !closed && full && <p className="why">This organisation&apos;s quota is full. Contact the accreditation desk to raise it.</p>}
                </form>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <span>Not registered, not approved, not verified. Not inside.</span><span>Artists handled at the hotel</span>
      </footer>
    </div>
  )
}
