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
  // Only pending ('submitted') rows are ever selectable: the mock's ticked
  // boxes on approved rows are status marks, not a selection.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Each pending row's chosen tier. One screen-wide type re-typed every
  // untyped row when any one dropdown changed, and "Set type" cycled it blind.
  const [rowTypes, setRowTypes] = useState<Map<string, TierCode>>(new Map())
  const [bulkRejecting, setBulkRejecting] = useState(false)
  const [bulkReason, setBulkReason] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [queueOrgs, setQueueOrgs] = useState<ReturnType<typeof queueResponseSchema.parse>['orgs']>([])
  const [nextOrg, setNextOrg] = useState<ReturnType<typeof queueResponseSchema.parse>['nextOrg']>(null)
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
    const pendingIds = new Set(parsed.data.rows.filter((row) => row.status === 'submitted').map((row) => row.id))
    setSelected((old) => new Set([...old].filter((id) => pendingIds.has(id))))
    setBulkRejecting(false)
    setBulkReason('')
    setLoaded(true)
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
    let response: Response
    try {
      response = await fetch('/api/desk/queue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      setError('No connection. Nothing was changed. Try again.')
      return false
    } finally {
      setBusy(false)
    }
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

  // Untyped rows default to Crew, the standard band. The org's defaultType is
  // deliberately not used: that would change what "Approve all" stamps.
  function typeFor(row: QueueRow): TierCode {
    return rowTypes.get(row.id) ?? row.type_code ?? 'crew'
  }

  async function decide(personId: string, approve: boolean, rejectReason?: string) {
    const row = rows.find((candidate) => candidate.id === personId)
    setNotice(null)
    const ok = await post({
      action: 'decide',
      personId,
      approve,
      typeCode: approve && row ? typeFor(row) : null,
      dayValidity: approve ? dayValidity : null,
      reason: approve ? null : rejectReason ?? null,
    })
    if (ok) {
      setRejecting(null)
      setReason('')
      await load()
    }
  }

  /**
   * One request per person, each with that row's own tier. Reports partial
   * failure instead of stopping silently; the rows that failed stay selected
   * so the operator can see and retry exactly those.
   */
  async function decideMany(ids: string[], approve: boolean, rejectReason?: string) {
    setNotice(null)
    const failed: string[] = []
    for (const id of ids) {
      const row = rows.find((candidate) => candidate.id === id)
      if (!row || row.status !== 'submitted') continue
      const ok = await post({
        action: 'decide',
        personId: id,
        approve,
        typeCode: approve ? typeFor(row) : null,
        dayValidity: approve ? dayValidity : null,
        reason: approve ? null : rejectReason ?? null,
      })
      if (!ok) failed.push(id)
    }
    const done = ids.length - failed.length
    const verb = approve ? 'Approved' : 'Rejected'
    setNotice(failed.length === 0 ? `${verb} ${done}.` : `${verb} ${done} of ${ids.length}. ${failed.length} did not go through and are still selected.`)
    await load()
    setSelected(new Set(failed))
  }

  async function approveOrg(orgId: string) {
    const pending = rows.filter((row) => row.org_id === orgId && row.status === 'submitted')
    const types = new Set(pending.map(typeFor))
    const [only] = [...types]
    // The org RPC stamps ONE tier on every pending row and takes requestable
    // tiers only (ADR-018). Use it only when that is exactly what the screen
    // shows; otherwise approve row by row so each person gets their own tier.
    if (types.size === 1 && only && isRequestable(only)) {
      setNotice(null)
      const ok = await post({ action: 'approve_org', orgId, typeCode: only, dayValidity })
      if (ok) await load()
      return
    }
    await decideMany(pending.map((row) => row.id), true)
  }

  function setTypeForSelected(next: TierCode) {
    setRowTypes((old) => {
      const map = new Map(old)
      for (const id of selected) map.set(id, next)
      return map
    })
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

  const selectable = useMemo(() => rows.filter((row) => row.status === 'submitted'), [rows])
  const pendingTab = filter === 'pending'
  const selectedLabel = !loaded
    ? 'Loading…'
    : selectable.length === 0
      ? 'Nothing pending in this view'
      : `${selected.size} of ${selectable.length} selected`

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
      {/* Decided tabs have nothing selectable, so no bulk bar. */}
      {pendingTab && (
      <div className="selbar rv" style={{ ['--d' as string]: 2 }}>
        <button className="ck" type="button" role="checkbox" aria-checked={selected.size > 0 && selected.size === selectable.length} aria-label={selected.size === selectable.length && selectable.length > 0 ? 'Deselect all pending people' : 'Select all pending people'} disabled={selectable.length === 0} onClick={() => setSelected((old) => old.size === selectable.length ? new Set() : new Set(selectable.map((row) => row.id)))}><Icon name="check" /></button>
        <span className="mono" aria-live="polite">{selectedLabel}</span>
        {bulkRejecting ? (
          <>
            <input aria-label="Reason for rejecting the selected people" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="Reason" style={{ ...inputStyle, minWidth: '150px' }} />
            <button className="btn solo" type="button" onClick={() => { setBulkRejecting(false); setBulkReason('') }}>Cancel</button>
            <button className="btn bad solo" type="button" disabled={busy || bulkReason.trim().length === 0} onClick={() => void decideMany([...selected], false, bulkReason.trim())}>Reject {selected.size}</button>
          </>
        ) : (
          <>
            {/* "Set type" keeps the design's label and footprint; an invisible
                native <select> over it applies one tier to the selected rows. */}
            <label className="btn solo hide-s" aria-disabled={selected.size === 0} style={{ position: 'relative' }}>
              Set type
              <select aria-label="Set type for the selected people" disabled={selected.size === 0} value="" onChange={(e) => { if (e.target.value) setTypeForSelected(e.target.value as TierCode) }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}>
                <option value="" disabled>Set type</option>
                {DECIDABLE_TIERS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
              </select>
            </label>
            <button className="btn bad solo hide-s" type="button" aria-label="Reject selected" disabled={busy || selected.size === 0} onClick={() => { setBulkRejecting(true); setBulkReason('') }}>Reject</button>
            <button className="btn go" type="button" aria-label="Approve selected" disabled={busy || selected.size === 0} onClick={() => void decideMany([...selected], true)}>{busy ? 'Working…' : 'Approve'}<span className="ic"><Icon name="check" /></span></button>
          </>
        )}
      </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--bad)' }}>{error}</p>}
      {notice && <p role="status" className="mono">{notice}</p>}
      {orgs.map(([orgId, org]) => (
          <section key={orgId} id={`org-${orgId}`} className="bz rv section" style={{ ['--d' as string]: 3, scrollMarginTop: '120px' }}>
            <div className="pl">
            {(() => {
              const orgMeta = queueOrgs.find((item) => item.id === orgId)
              const pendingPosition = queueOrgs.findIndex((item) => item.id === orgId)
              return (
            <div className="org-h">
              <div>
                <span className="mono">{pendingTab && pendingPosition >= 0 ? `Org ${pendingPosition + 1} of ${queueOrgs.length} pending` : orgKindLabels[orgMeta?.kind ?? org.kind] ?? org.kind}</span>
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
                  <button type="button" disabled={busy || !org.rows.some((row) => row.status === 'submitted')} onClick={() => void approveOrg(orgId)} className="btn go">Approve all<span className="ic"><Icon name="arrow-right" /></span></button>
                </div>
              )}
            </div>
              )
            })()}
            {org.rows.map((row) => {
              const selectedRow = selected.has(row.id)
              const pendingRow = row.status === 'submitted'
              const rowTier = pendingRow ? typeFor(row) : row.type_code ?? 'crew'
              const rowColour = tierColour(rowTier, theme)
              return (
                <div key={row.id} className={`qrow${row.status === 'rejected' ? ' rej' : ''}`}>
                  {/* A decided row is not selectable; an approved row keeps the
                      design's tick as a status mark, not a control. */}
                  {pendingRow ? <button className="ck" type="button" role="checkbox" aria-checked={selectedRow} aria-label={`${selectedRow ? 'Deselect' : 'Select'} ${row.full_name}`} onClick={() => setSelected((old) => { const next = new Set(old); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })}><Icon name="check" /></button>
                  : <button className="ck" type="button" role="checkbox" aria-checked={row.status === 'approved'} disabled aria-label={statusLabels[row.status as keyof typeof statusLabels] ?? row.status}><Icon name="check" /></button>}
                  <div>
                    <div className="nm">{row.full_name}</div>
                    <div className="sub">{row.role_text}, {row.phone}{row.vehicle_reg ? `, ${row.vehicle_reg}` : ''}</div>
                  </div>
                  <label className="pick" style={{ ['--c' as string]: rowColour }}>
                    <select aria-label={`Band type for ${row.full_name}`} disabled={!pendingRow} value={rowTier} onChange={(e) => { const next = e.target.value as TierCode; setRowTypes((old) => new Map(old).set(row.id, next)) }}>
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
            <div className="q-foot"><div className="sums"><span style={{ color: 'var(--grn)' }}>{org.rows.filter((row) => row.status === 'approved').length} Approved</span><span>{org.rows.filter((row) => row.status === 'submitted').length} Pending</span><span style={{ color: 'var(--bad)' }}>{org.rows.filter((row) => row.status === 'rejected').length} Rejected</span></div>{pendingTab && nextOrg && <button className="linkbtn" type="button" onClick={() => document.getElementById(`org-${nextOrg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>Next org: {nextOrg.name} <Icon name="arrow-right" /></button>}</div>
            </div>
          </section>
        ))}
        {!loaded && !error && <p className="pad mono">Loading the queue…</p>}
        {loaded && orgs.length === 0 && !error && <p className="pad">{pendingTab ? 'Nobody is waiting for a decision.' : 'No people in this view.'}</p>}
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
