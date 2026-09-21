'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUEUE_FILTERS,
  queueResponseSchema,
  type QueueFilter,
  type QueueRow,
} from '@/lib/schemas/queue'
import { tier, tierColour, type TierCode } from '@/lib/design'
import { DECIDABLE_TIERS, isRequestable } from '@/lib/desk-tiers'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'

const inputStyle: React.CSSProperties = {
  minHeight: '44px',
  border: '1px solid var(--rule2,rgba(242,239,226,0.32))',
  background: 'var(--panel,#101012)',
  color: 'var(--ink,#F2EFE2)',
  padding: '8px 10px',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '14px',
}

const filterLabels: Record<QueueFilter, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  aaa: 'AAA flagged',
}

const orgKindLabels: Record<string, string> = {
  vendor: 'Vendor',
  security: 'Security',
  crew: 'Crew',
  sponsor: 'Sponsor',
  media: 'Media',
  contractor: 'Contractor',
}

const statusLabels: Record<Extract<QueueRow['status'], 'submitted' | 'approved' | 'rejected'>, string> = {
  submitted: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const errorCopy: Record<string, string> = {
  not_authorized: 'Only an active operator can use the queue.',
  reason_required: 'A rejection reason is required.',
  decision_rejected: 'That row has already been decided, or AAA needs its named nomination.',
  not_found: 'That person is no longer on the queue.',
  internal: "That didn't go through. Try again.",
}

export function QueueScreen() {
  const router = useRouter()
  const theme = useDomTheme()
  const [filter, setFilter] = useState<QueueFilter>('pending')
  const [rows, setRows] = useState<QueueRow[]>([])
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, aaa: 0 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [queueOrgs, setQueueOrgs] = useState<ReturnType<typeof queueResponseSchema.parse>['orgs']>([])
  const [nextOrg, setNextOrg] = useState<ReturnType<typeof queueResponseSchema.parse>['nextOrg']>(null)
  const [type, setType] = useState<TierCode>('crew')
  const [dayValidity] = useState<'build' | 'show' | 'build_show'>('build_show')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectingOrg, setRejectingOrg] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [orgReason, setOrgReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const segRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState({ left: 0, width: 0 })

  async function load(nextFilter = filter) {
    const response = await fetch(`/api/desk/queue?filter=${nextFilter}`)
    if (response.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!response.ok) {
      setError(errorCopy[(await response.json().catch(() => null))?.error] ?? errorCopy['internal']!)
      return
    }
    const parsed = queueResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      setError(errorCopy['internal']!)
      return
    }
    setRows(parsed.data.rows)
    setCounts(parsed.data.counts)
    setQueueOrgs(parsed.data.orgs)
    setNextOrg(parsed.data.nextOrg)
    setSelected(new Set())
    setError(null)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    // The filter is changed through setFilterAndLoad, not this effect.
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function setFilterAndLoad(next: QueueFilter) {
    setFilter(next)
    await load(next)
  }

  async function post(body: unknown) {
    setBusy(true)
    const response = await fetch('/api/desk/queue', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (response.status === 401) {
      router.replace('/desk/login')
      return false
    }
    if (!response.ok) {
      const code = (await response.json().catch(() => null))?.error
      setError(errorCopy[code] ?? errorCopy['internal']!)
      return false
    }
    return true
  }

  async function decide(personId: string, approve: boolean, rejectReason?: string) {
    const ok = await post({
      action: 'decide',
      personId,
      approve,
      typeCode: approve ? type : null,
      dayValidity: approve ? dayValidity : null,
      reason: approve ? null : rejectReason ?? null,
    })
    if (ok) {
      setRejecting(null)
      setReason('')
      await load()
    }
  }

  async function approveSelected() {
    const ids = [...selected]
    for (const id of ids) {
      const ok = await post({ action: 'decide', personId: id, approve: true, typeCode: type, dayValidity })
      if (!ok) return
    }
    await load()
  }

  async function approveOrg(orgId: string) {
    // Org-level approve offers requestable tiers only (ADR-018); the button is
    // disabled otherwise, so this guard is belt and braces, not a fallback.
    if (!isRequestable(type)) return
    const ok = await post({ action: 'approve_org', orgId, typeCode: type, dayValidity })
    if (ok) await load()
  }

  async function rejectOrg(orgId: string) {
    const trimmedReason = orgReason.trim()
    if (trimmedReason.length === 0) return
    const ok = await post({ action: 'reject_org', orgId, reason: trimmedReason })
    if (ok) {
      setRejectingOrg(null)
      setOrgReason('')
      await load()
    }
  }

  const orgs = useMemo(() => {
    const grouped = new Map<string, { name: string; kind: string; rows: QueueRow[] }>()
    for (const row of rows) {
      const current = grouped.get(row.org_id) ?? { name: row.org_name, kind: row.org_kind, rows: [] }
      current.rows.push(row)
      grouped.set(row.org_id, current)
    }
    return [...grouped.entries()]
  }, [rows])

  useLayoutEffect(() => {
    const active = segRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]')
    const parent = segRef.current?.getBoundingClientRect()
    if (active && parent) {
      const rect = active.getBoundingClientRect()
      setThumb({ left: rect.left - parent.left, width: rect.width })
    }
  }, [filter, counts])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const revealables = root.querySelectorAll<HTMLElement>('.rv')
    revealables.forEach((element) => element.classList.remove('in'))
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealables.forEach((element) => element.classList.add('in'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }),
      { threshold: 0.12 },
    )
    revealables.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [rows, orgs.length])

  return (
    <main ref={rootRef}>
      <section className="head rv">
        <div><span className="tag">Allocation desk</span><h1 className="h1">Approval queue</h1><p className="lede">Approve a row, a whole organisation, or reject with a reason. Pass tokens are created on approval, never before.</p></div>
      </section>
      <div className="rv" style={{ ['--d' as string]: 1 }}>
        <div className="seg" ref={segRef}>
          <span className="thumb" style={{ width: thumb.width || undefined, transform: `translateX(${thumb.left}px)` }} />
          {QUEUE_FILTERS.map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => void setFilterAndLoad(item)}>{filterLabels[item]}<b>{counts[item]}</b></button>)}
        </div>
      </div>
      <div className="selbar rv" style={{ ['--d' as string]: 2 }}>
        <button className="ck" type="button" role="checkbox" aria-checked={selected.size === rows.length && rows.length > 0} aria-label="Select all people in this view" onClick={() => setSelected((old) => old.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)))}><Icon name="check" /></button>
        <span className="mono">{selected.size} of {rows.length} selected</span>
        <button className="btn solo hide-s" type="button" onClick={() => setType((old) => { const i = DECIDABLE_TIERS.findIndex((t) => t.code === old); return DECIDABLE_TIERS[(i + 1) % DECIDABLE_TIERS.length]!.code })}>Set type</button>
        <button className="btn bad solo hide-s" type="button" disabled={busy || selected.size === 0} onClick={() => { const first = rows.find((row) => selected.has(row.id) && row.status === 'submitted'); if (first) { setRejecting(first.id); setReason('') } }}>Reject</button>
        <button className="btn go" type="button" disabled={busy || selected.size === 0 || type === 'aaa'} onClick={() => void approveSelected()}>Approve<span className="ic"><Icon name="check" /></span></button>
      </div>
      {error && <p style={{ color: 'var(--bad)' }}>{error}</p>}
      {orgs.map(([orgId, org], orgIndex) => (
          <section key={orgId} className="bz rv section" style={{ ['--d' as string]: 3 }}>
            <div className="pl">
            {(() => {
              const orgMeta = queueOrgs.find((item) => item.id === orgId)
              return (
            <div className="org-h">
              <div>
                <span className="mono">Org {orgIndex + 1} of {queueOrgs.length} pending</span>
                <h2 className="h2">{org.name}</h2>
                <div aria-label={`Contact ${orgMeta?.contactName ?? 'unknown'} ${orgMeta?.contactPhone ?? ''}; ${orgMeta?.used ?? 0} of ${orgMeta?.quota ?? 0} used; ${orgMeta?.status ?? 'unknown'}; default ${orgMeta?.defaultType ?? 'unknown'}`} className="sub">{orgKindLabels[orgMeta?.kind ?? org.kind] ?? orgMeta?.kind ?? org.kind}, quota {orgMeta?.quota ?? '—'}, submitted {org.rows[0]?.submitted_at ? new Date(org.rows[0].submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'} by {orgMeta?.contactName ?? '—'}</div>
              </div>
              {filter === 'pending' && (
                <div className="row">
                  {rejectingOrg === orgId ? (
                    <>
                      <input aria-label={`Reason for rejecting ${org.name}`} value={orgReason} onChange={(e) => setOrgReason(e.target.value)} placeholder="Reason" style={{ ...inputStyle, minWidth: '150px' }} />
                      <button type="button" disabled={busy || orgReason.trim().length === 0} onClick={() => void rejectOrg(orgId)} className="btn bad solo">Confirm reject</button>
                    </>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => { setRejectingOrg(orgId); setOrgReason('') }} className="btn bad solo">Reject</button>
                  )}
                  <button type="button" disabled={busy || !isRequestable(type)} onClick={() => void approveOrg(orgId)} className="btn go">Approve all<span className="ic"><Icon name="arrow-right" /></span></button>
                </div>
              )}
            </div>
              )
            })()}
            {org.rows.map((row) => {
              const selectedRow = selected.has(row.id)
              const rowColour = tierColour(row.type_code ?? type, theme)
              return (
                <div key={row.id} className={`qrow${row.status === 'rejected' ? ' rej' : ''}`}>
                  <button className="ck" type="button" role="checkbox" aria-checked={selectedRow} aria-label={`${selectedRow ? 'Deselect' : 'Select'} ${row.full_name}`} onClick={() => setSelected((old) => { const next = new Set(old); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })}><Icon name="check" /></button>
                  <div>
                    <div className="nm">{row.full_name}</div>
                    <div className="sub">{row.role_text}, {row.phone}{row.vehicle_reg ? `, ${row.vehicle_reg}` : ''}</div>
                  </div>
                  <label className="pick" style={{ ['--c' as string]: rowColour }}>
                    <select aria-label={`Band type for ${row.full_name}`} value={row.type_code ?? type} onChange={(e) => { setType(e.target.value as TierCode); setSelected(new Set([row.id])) }}>
                      {DECIDABLE_TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                      {row.type_code && !DECIDABLE_TIERS.some((t) => t.code === row.type_code) && <option value={row.type_code}>{tier(row.type_code).label}</option>}
                    </select><i><Icon name="caret-down" /></i>
                  </label>
                  <span className={`st ${row.status === 'approved' ? 'ok' : row.status === 'rejected' ? 'no' : 'wait'}`}>{statusLabels[row.status as keyof typeof statusLabels] ?? row.status}</span>
                  <div className="q-actions row">
                    {row.status === 'submitted' && <button type="button" disabled={busy} onClick={() => void decide(row.id, true)} className="btn go solo">Approve</button>}
                    {row.status === 'submitted' && (rejecting === row.id ? <><input aria-label={`Reason for rejecting ${row.full_name}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" style={{ ...inputStyle, maxWidth: '150px' }} /><button type="button" disabled={busy || reason.trim().length === 0} onClick={() => void decide(row.id, false, reason)} className="btn bad solo">Confirm reject</button></> : <button type="button" disabled={busy} onClick={() => { setRejecting(row.id); setReason('') }} className="btn bad solo">Reject</button>)}
                  </div>
                  {row.status === 'rejected' && row.decision_reason && <div style={{ gridColumn: '2 / -1', color: 'var(--bad)', fontSize: '13px' }}>Reason: {row.decision_reason}</div>}
                </div>
              )
            })}
            <div className="q-foot"><div className="sums"><span style={{ color: 'var(--grn)' }}>{org.rows.filter((row) => row.status === 'approved').length} Approved</span><span>{org.rows.filter((row) => row.status === 'submitted').length} Pending</span><span style={{ color: 'var(--bad)' }}>{org.rows.filter((row) => row.status === 'rejected').length} Rejected</span></div><button className="linkbtn" type="button">Next org: {nextOrg?.name ?? '—'} <Icon name="arrow-right" /></button></div>
            </div>
          </section>
        ))}
        {orgs.length === 0 && !error && <p className="pad">No people in this view.</p>}
      <style jsx>{`
        .qrow { position: relative; }
        .q-actions { position: absolute; right: 26px; bottom: 10px; justify-content: flex-end; opacity: 0; pointer-events: none; transition: opacity .3s var(--ease); }
        .qrow:hover .q-actions, .qrow:focus-within .q-actions { opacity: 1; pointer-events: auto; }
        @container app (max-width: 1100px) {
          .q-actions { position: static; display: none; grid-column: 3 / -1; grid-row: 2; justify-content: flex-end; opacity: 1; }
          .qrow:hover .q-actions, .qrow:focus-within .q-actions { display: flex; }
        }
        @container app (max-width: 700px) {
          /* The contract's mobile row is two grid rows: "ck nm st" / ". pk pk"
             (boa_design_v2.html, @container app (max-width: 700px)). Declaring a
             third ". act act" row for these hover-revealed buttons added a 12px
             row gap to EVERY row even while they are display:none, which is a
             real 12px-per-row layout defect, not a rendering artefact. They are
             an overlay on desktop; keep them an overlay here so they cost no
             layout height and the row geometry stays the contract's. */
          .qrow > .q-actions { position: absolute; right: 18px; bottom: 9px; grid-column: auto; grid-row: auto; }
        }
      `}</style>
    </main>
  )
}
