'use client'

import { useState } from 'react'
import { submissionSchema } from '@/lib/schemas/submission'
import type { OrgView } from '@/lib/schemas/org-view'
import { PROP } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'

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
 * approval") implying a local draft before one batch submit. The real
 * boa_acc_submit RPC (ACC-023/024) has no draft or batch concept — every call
 * inserts one person immediately, status 'submitted'. ACC-032 made this
 * honest rather than quietly wiring both buttons to the same action: the
 * second slot is no longer a button. It is a live, non-interactive readout of
 * how many people this token has submitted so far — there is nothing left to
 * "submit", each add is already final and the desk approves later.
 *
 * "Your list" reflects only what THIS browser session has submitted (plain
 * React state, resets on reload) — boa_acc_org_view deliberately returns
 * counts only, never other people's names or phones, and no RPC exists to
 * fetch an org's roster back to an anonymous token holder.
 */

const FORM_FIELDS = [
  { key: 'fullName', label: 'Full name', placeholder: 'As it appears on their ID', hint: 'Exactly as on their ID. No initials.' },
  { key: 'phone', label: 'Mobile', placeholder: '+91', hint: 'Used only to resend their pass.' },
  { key: 'roleText', label: 'Role at the festival', placeholder: 'Rigger, FOH engineer, loader', hint: 'Free text is fine.' },
] as const

type FieldKey = (typeof FORM_FIELDS)[number]['key']

type ListEntry = { name: string; role: string; state: 'Submitted'; dot: string }

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

const ruleVar = 'var(--rule,rgba(242,239,226,0.16))'
const rule2Var = 'var(--rule2,rgba(242,239,226,0.32))'
const inkVar = 'var(--ink,#F2EFE2)'
const ink3Var = 'var(--ink3,rgba(242,239,226,0.42))'
const grnVar = 'var(--grn,#00F5A5)'
const goldVar = 'var(--gold,#E3BB72)'
const onVar = 'var(--on,#0A0A0A)'

export function SubmissionScreen({ token, initialOrg }: { token: string; initialOrg: OrgView }) {
  const theme = useDomTheme()
  const [org, setOrg] = useState(initialOrg)
  const [fields, setFields] = useState<Record<FieldKey, string>>({ fullName: '', phone: '', roleText: '' })
  const [vehicleOn, setVehicleOn] = useState(false)
  const [vehicleReg, setVehicleReg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ code: string | null; message: string } | null>(null)
  const [confirmation, setConfirmation] = useState<string | null>(null)
  const [yourList, setYourList] = useState<ListEntry[]>([])
  const [addHover, setAddHover] = useState(false)

  const pct = org.quota > 0 ? Math.min(100, (org.used / org.quota) * 100) : 0
  const closed = org.status !== 'open'
  const full = org.remaining <= 0

  async function handleAdd() {
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

    setSubmitting(true)
    try {
      const res = await fetch(`/api/s/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null)
        const code = body && typeof body === 'object' && 'error' in body ? String(body.error) : null
        setError({ code, message: errorMessage(code, parsed.data.phone) })
        return
      }

      setYourList((list) => [
        ...list,
        { name: parsed.data.fullName, role: parsed.data.roleText, state: 'Submitted', dot: PROP[theme].gold },
      ])
      setOrg((o) => ({ ...o, used: o.used + 1, remaining: Math.max(0, o.remaining - 1) }))
      setConfirmation(`${parsed.data.fullName} added. Nothing else to do — the desk approves at check-in.`)
      setFields({ fullName: '', phone: '', roleText: '' })
      setVehicleOn(false)
      setVehicleReg('')
    } catch {
      setError({ code: 'internal', message: ERROR_COPY['internal'] ?? "That didn't go through. Try again." })
    } finally {
      setSubmitting(false)
    }
  }

  const disableAdd = submitting || closed || full

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg,#0A0A0A)',
        fontFamily: "'Archivo',system-ui,sans-serif",
        color: 'var(--ink2,rgba(242,239,226,0.72))',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <div className="s-shell">
          <div className="s-pad-sec" style={{ borderBottom: `1px solid ${ruleVar}` }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: grnVar,
                marginBottom: '16px',
              }}
            >
              Public · token link
            </div>
            <h1
              className="s-h1"
              style={{
                fontFamily: "'Anton',sans-serif",
                lineHeight: 0.94,
                textTransform: 'uppercase',
                color: inkVar,
                margin: '0 0 14px',
              }}
            >
              Register your crew
            </h1>
            <p style={{ fontSize: '14.5px', lineHeight: 1.55, color: ink3Var, margin: 0, maxWidth: '62ch' }}>
              No account, no login. The token in the link is the credential and scopes to one
              organisation. Name, phone, role, vehicle — nothing else is collected.
            </p>
          </div>

          <div
            style={{
              padding: '22px 18px',
              borderBottom: `1px solid ${rule2Var}`,
              background: 'var(--panel,#101012)',
              display: 'flex',
              gap: '26px',
              flexWrap: 'wrap',
              alignItems: 'flex-end',
            }}
          >
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: '9.5px',
                  fontWeight: 700,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: ink3Var,
                }}
              >
                Registering for
              </div>
              <div
                style={{
                  fontFamily: "'Anton',sans-serif",
                  fontSize: '28px',
                  lineHeight: 1.05,
                  textTransform: 'uppercase',
                  color: inkVar,
                  marginTop: '8px',
                }}
              >
                {org.name}
              </div>
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  fontFamily: "'Oswald',sans-serif",
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                <span style={{ fontSize: '26px', fontWeight: 700, color: grnVar }}>{org.used}</span>
                <span style={{ fontSize: '12px', color: ink3Var }}>/ {org.quota} SEATS USED</span>
              </div>
              <div style={{ height: '6px', background: ruleVar, marginTop: '10px' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: grnVar }} />
              </div>
            </div>
          </div>

          <div className="s-pad-sec" style={{ borderBottom: `1px solid ${ruleVar}` }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: ink3Var,
                marginBottom: '18px',
              }}
            >
              Add a person
            </div>

            <div
              className="s-form-grid"
              style={{ display: 'grid', gap: '1px', background: ruleVar, border: `1px solid ${ruleVar}` }}
            >
              {FORM_FIELDS.map((f) => (
                <label
                  key={f.key}
                  style={{
                    background: 'var(--bg,#0A0A0A)',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: '9.5px',
                      fontWeight: 700,
                      letterSpacing: '0.13em',
                      textTransform: 'uppercase',
                      color: ink3Var,
                    }}
                  >
                    {f.label}
                  </span>
                  <input
                    value={fields[f.key]}
                    onChange={(e) => {
                      setFields((v) => ({ ...v, [f.key]: e.target.value }))
                      setConfirmation(null)
                    }}
                    placeholder={f.placeholder}
                    disabled={closed}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: inkVar,
                      fontFamily: "'Oswald',sans-serif",
                      fontSize: '17px',
                      fontWeight: 500,
                      letterSpacing: '0.02em',
                      outline: 'none',
                      width: '100%',
                      minHeight: '30px',
                      opacity: closed ? 0.5 : 1,
                    }}
                  />
                  <span style={{ fontSize: '11.5px', lineHeight: 1.4, color: ink3Var }}>{f.hint}</span>
                </label>
              ))}
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={vehicleOn}
              disabled={closed}
              onClick={() => setVehicleOn((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                border: `1px solid ${ruleVar}`,
                borderTop: 'none',
                padding: '16px',
                flexWrap: 'wrap',
                width: '100%',
                minHeight: '44px',
                background: 'transparent',
                textAlign: 'left',
                font: 'inherit',
                cursor: closed ? 'not-allowed' : 'pointer',
                opacity: closed ? 0.5 : 1,
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '24px',
                  background: vehicleOn ? grnVar : ruleVar,
                  position: 'relative',
                  flex: '0 0 auto',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '3px',
                    left: vehicleOn ? '23px' : '3px',
                    width: '18px',
                    height: '18px',
                    background: vehicleOn ? onVar : 'var(--panel2,#16161a)',
                  }}
                />
              </div>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Oswald',sans-serif",
                    fontSize: '15px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: inkVar,
                  }}
                >
                  Bringing a vehicle
                </div>
                <div style={{ fontSize: '12.5px', color: ink3Var, marginTop: '3px' }}>
                  A sticker is issued at check-in, tied to this number only.
                </div>
              </div>
            </button>

            {vehicleOn && (
              <label
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  border: `1px solid ${grnVar}`,
                  borderTop: 'none',
                  padding: '14px 16px',
                }}
              >
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: '9.5px',
                    fontWeight: 700,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    color: grnVar,
                  }}
                >
                  Vehicle registration
                </span>
                <input
                  value={vehicleReg}
                  onChange={(e) => {
                    setVehicleReg(e.target.value.toUpperCase())
                    setConfirmation(null)
                  }}
                  placeholder="KA 05 MJ 8871"
                  disabled={closed}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: inkVar,
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: '20px',
                    fontWeight: 700,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    outline: 'none',
                    width: '100%',
                    minHeight: '34px',
                    opacity: closed ? 0.5 : 1,
                  }}
                />
              </label>
            )}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '20px' }}>
              <button
                type="button"
                disabled={disableAdd}
                onClick={handleAdd}
                onMouseEnter={() => setAddHover(true)}
                onMouseLeave={() => setAddHover(false)}
                style={{
                  cursor: disableAdd ? 'not-allowed' : 'pointer',
                  flex: '1 1 200px',
                  border: `1px solid ${grnVar}`,
                  background: addHover && !disableAdd ? 'transparent' : grnVar,
                  color: addHover && !disableAdd ? grnVar : onVar,
                  opacity: disableAdd ? 0.5 : 1,
                  padding: '17px 22px',
                  fontFamily: "'Oswald',sans-serif",
                  fontSize: '14px',
                  fontWeight: 600,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  minHeight: '52px',
                }}
              >
                Add to list
              </button>
              <div
                role="status"
                aria-live="polite"
                style={{
                  flex: '1 1 200px',
                  border: `1px solid ${goldVar}`,
                  background: 'transparent',
                  color: goldVar,
                  padding: '17px 22px',
                  fontFamily: "'Oswald',sans-serif",
                  fontSize: '13.5px',
                  fontWeight: 600,
                  letterSpacing: '0.13em',
                  textTransform: 'uppercase',
                  minHeight: '52px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                }}
              >
                {org.used} added so far — the desk approves later
              </div>
            </div>

            {error && (
              <p
                role={error.code === 'duplicate_phone' ? 'status' : 'alert'}
                style={{
                  marginTop: '14px',
                  fontSize: '13px',
                  color: error.code === 'duplicate_phone' ? goldVar : 'var(--bad,#FF6B5A)',
                }}
              >
                {error.message}
              </p>
            )}
            {!error && confirmation && (
              <p role="status" style={{ marginTop: '14px', fontSize: '13px', color: grnVar }}>
                {confirmation}
              </p>
            )}
            {!error && closed && (
              <p style={{ marginTop: '14px', fontSize: '13px', color: ink3Var }}>
                This organisation is closed. Registration will not reopen by retrying — contact the
                accreditation desk if this is wrong.
              </p>
            )}
            {!error && !closed && full && (
              <p style={{ marginTop: '14px', fontSize: '13px', color: ink3Var }}>
                This organisation&rsquo;s quota is full. Contact the accreditation desk to raise it.
              </p>
            )}
          </div>

          <div className="s-pad-sec">
            <div
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '9.5px',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: ink3Var,
                marginBottom: '14px',
              }}
            >
              Your list
            </div>
            <div style={{ borderTop: `1px solid ${rule2Var}` }}>
              {yourList.map((x, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '14px 0',
                    borderBottom: `1px solid ${ruleVar}`,
                  }}
                >
                  <span style={{ width: '8px', height: '18px', background: x.dot, flex: '0 0 auto' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "'Oswald',sans-serif",
                        fontSize: '15.5px',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        textTransform: 'uppercase',
                        color: inkVar,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {x.name}
                    </div>
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: '10.5px',
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        color: ink3Var,
                        marginTop: '3px',
                      }}
                    >
                      {x.role}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: '10px',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: x.dot,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {x.state}
                  </div>
                </div>
              ))}
              {yourList.length === 0 && (
                <p style={{ padding: '14px 0', fontSize: '13px', color: ink3Var }}>
                  Nobody added yet in this session.
                </p>
              )}
            </div>
          </div>
        </div>
      </main>

      <footer
        style={{
          borderTop: `1px solid ${ruleVar}`,
          padding: '22px 18px 30px',
          display: 'flex',
          gap: '20px',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          fontFamily: "'Oswald',sans-serif",
          fontSize: '10.5px',
          fontWeight: 500,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: ink3Var,
        }}
      >
        <span>Not registered, not approved, not verified — not inside.</span>
        <span style={{ color: goldVar }}>Artists handled at the hotel</span>
      </footer>
    </div>
  )
}
