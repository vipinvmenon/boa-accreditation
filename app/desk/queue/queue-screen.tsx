'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  QUEUE_FILTERS,
  queueResponseSchema,
  type QueueFilter,
  type QueueRow,
} from '@/lib/schemas/queue'
import { passType, type PassTypeCode, PROP } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'

const buttonStyle: React.CSSProperties = {
  minHeight: '44px',
  padding: '10px 16px',
  border: '1px solid var(--rule2,rgba(242,239,226,0.32))',
  background: 'transparent',
  color: 'var(--ink2,rgba(242,239,226,0.72))',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

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
  const [selectedLabel, setSelectedLabel] = useState('Select people')
  const [approvedCount, setApprovedCount] = useState(0)
  const [queueOrgs, setQueueOrgs] = useState<ReturnType<typeof queueResponseSchema.parse>['orgs']>([])
  const [nextOrg, setNextOrg] = useState<ReturnType<typeof queueResponseSchema.parse>['nextOrg']>(null)
  const [type, setType] = useState<PassTypeCode>('crew')
  const [dayValidity] = useState<'build' | 'show' | 'build_show'>('build_show')
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [rejectingOrg, setRejectingOrg] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [orgReason, setOrgReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    setSelectedLabel(parsed.data.selectedLabel)
    setApprovedCount(parsed.data.approvedCount)
    setQueueOrgs(parsed.data.orgs)
    setNextOrg(parsed.data.nextOrg)
    setSelected(new Set(parsed.data.rows.filter((row) => row.status === 'approved').map((row) => row.id)))
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
    const ok = await post({ action: 'approve_org', orgId, typeCode: type === 'aaa' ? 'crew' : type, dayValidity })
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

  const p = PROP[theme]
  return (
    <main style={{ background: 'var(--bg,#0A0A0A)', color: 'var(--ink,#F2EFE2)' }}>
      <div className="d-shell" style={{ margin: '0 auto' }}>
        <header className="d-pad-sec" style={{ borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--grn,#00F5A5)', marginBottom: '16px' }}>
            Allocation desk
          </div>
          <h1 className="d-h1b" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 0.94, textTransform: 'uppercase', margin: '0 0 14px' }}>
            Approval queue
          </h1>
          <p style={{ fontSize: '14.5px', lineHeight: 1.55, color: 'var(--ink3,rgba(242,239,226,0.42))', margin: 0, maxWidth: '60ch' }}>
            Approve a row, approve a whole organisation, or reject with a reason. Pass tokens generate on approval — nothing before.
          </p>
        </header>

        <nav style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
          {QUEUE_FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void setFilterAndLoad(item)}
              style={{ ...buttonStyle, border: 0, borderRight: '1px solid var(--rule,rgba(242,239,226,0.16))', background: filter === item ? 'var(--grn,#00F5A5)' : 'transparent', color: filter === item ? 'var(--on,#0A0A0A)' : 'var(--ink3,rgba(242,239,226,0.42))', padding: '13px 18px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}
            >
              {filterLabels[item]} <span style={{ fontSize: '11px', fontWeight: 700, opacity: 0.65 }}>{counts[item]}</span>
            </button>
          ))}
        </nav>

        <section className="d-queue-bulk" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 18px', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))', background: 'var(--panel,#101012)' }}>
          <button type="button" aria-label="Select all people in this view" onClick={() => setSelected((old) => old.size === rows.length ? new Set() : new Set(rows.map((row) => row.id)))} style={{ width: '20px', height: '20px', border: '1px solid var(--grn,#00F5A5)', background: selected.size > 0 ? 'var(--grn,#00F5A5)' : 'transparent', color: 'var(--on,#0A0A0A)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, cursor: 'pointer', flex: '0 0 auto' }}>
            {selected.size > 0 ? '✓' : ''}
          </button>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{selectedLabel}</span>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            <button type="button" onClick={() => setType((old) => old === 'crew' ? 'stage' : old === 'stage' ? 'aaa' : 'crew')} className="hov-text-ink" style={{ ...buttonStyle, padding: '10px 16px', minHeight: '42px' }}>Set type</button>
            <button type="button" disabled={busy || selected.size === 0} onClick={() => { const first = rows.find((row) => selected.has(row.id) && row.status === 'submitted'); if (first) { setRejecting(first.id); setReason('') } }} className="hov-fill-bad" style={{ ...buttonStyle, padding: '10px 16px', minHeight: '42px' }}>Reject</button>
            <button type="button" disabled={busy || selected.size === 0 || type === 'aaa'} onClick={() => void approveSelected()} className="hov-invert-grn" style={{ ...buttonStyle, padding: '10px 18px', minHeight: '42px', borderColor: 'var(--grn,#00F5A5)', background: selected.size > 0 && type !== 'aaa' ? 'var(--grn,#00F5A5)' : 'transparent', color: selected.size > 0 && type !== 'aaa' ? 'var(--on,#0A0A0A)' : undefined }}>
              Approve selected
            </button>
          </div>
        </section>

        {error && <p style={{ margin: '18px', color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{error}</p>}
        {orgs.map(([orgId, org], orgIndex) => (
          <section key={orgId} style={{ background: 'var(--panel,#101012)', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
            {(() => {
              const orgMeta = queueOrgs.find((item) => item.id === orgId)
              return (
            <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '18px', flexWrap: 'wrap', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>Org {orgIndex + 1} of {queueOrgs.length} pending</div>
                <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1.05, textTransform: 'uppercase', marginTop: '8px' }}>{org.name}</div>
                <div aria-label={`Contact ${orgMeta?.contactName ?? 'unknown'} ${orgMeta?.contactPhone ?? ''}; ${orgMeta?.used ?? 0} of ${orgMeta?.quota ?? 0} used; ${orgMeta?.status ?? 'unknown'}; default ${orgMeta?.defaultType ?? 'unknown'}`} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))', marginTop: '6px' }}>{orgMeta?.kind ?? org.kind} · quota {orgMeta?.quota ?? '—'} · submitted {org.rows[0]?.submitted_at ? new Date(org.rows[0].submitted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'} · {orgMeta?.contactName ?? '—'}</div>
              </div>
              {filter === 'pending' && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {rejectingOrg === orgId ? (
                    <>
                      <input aria-label={`Reason for rejecting ${org.name}`} value={orgReason} onChange={(e) => setOrgReason(e.target.value)} placeholder="Reason" style={{ ...inputStyle, minWidth: '150px' }} />
                      <button type="button" disabled={busy || orgReason.trim().length === 0} onClick={() => void rejectOrg(orgId)} className="hov-fill-bad" style={{ ...buttonStyle, padding: '13px 18px', fontSize: '12.5px', borderColor: 'var(--bad,#FF6B5A)', color: 'var(--bad,#FF6B5A)' }}>Confirm reject</button>
                    </>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => { setRejectingOrg(orgId); setOrgReason('') }} className="hov-outline-bad" style={{ ...buttonStyle, padding: '13px 18px', fontSize: '12.5px' }}>Reject</button>
                  )}
                  <button type="button" disabled={busy || type === 'aaa'} onClick={() => void approveOrg(orgId)} className="hov-fill-grn" style={{ ...buttonStyle, padding: '13px 20px', fontSize: '12.5px', borderColor: 'var(--grn,#00F5A5)', background: 'var(--grn,#00F5A5)', color: 'var(--on,#0A0A0A)' }}>Approve all →</button>
                </div>
              )}
            </div>
              )
            })()}
            {org.rows.map((row) => {
              const selectedRow = selected.has(row.id)
              const rowType = row.type_code ? passType(row.type_code) : passType(type)
              const rowColour = theme === 'dark' ? rowType.colour : rowType.colourLight
              return (
                <div key={row.id} className="d-queue-cols" style={{ display: 'grid', gap: '16px', padding: '15px 18px', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))', alignItems: 'center', background: row.status === 'rejected' ? p.badbg : 'transparent' }}>
                  <button type="button" aria-label={`${selectedRow ? 'Deselect' : 'Select'} ${row.full_name}`} onClick={() => setSelected((old) => { const next = new Set(old); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next })} style={{ width: '20px', height: '20px', border: `1px solid ${selectedRow ? 'var(--grn,#00F5A5)' : 'var(--rule2,rgba(242,239,226,0.32))'}`, background: selectedRow ? 'var(--grn,#00F5A5)' : 'transparent', color: 'var(--on,#0A0A0A)', cursor: 'pointer' }}>{selectedRow ? '✓' : ''}</button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '16px', fontWeight: 600, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.full_name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))', marginTop: '3px' }}>{row.role_text} · {row.phone}{row.vehicle_reg ? ` · ${row.vehicle_reg}` : ''}</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '9px', border: '1px solid var(--rule2,rgba(242,239,226,0.32))', padding: '7px 11px', minWidth: 0, position: 'relative' }}>
                    <span aria-hidden="true" style={{ width: '8px', height: '18px', background: rowColour, flex: '0 0 auto' }} />
                    <select aria-label={`Type for ${row.full_name}`} value={row.type_code ?? type} onChange={(e) => { setType(e.target.value as PassTypeCode); setSelected(new Set([row.id])) }} style={{ ...inputStyle, minHeight: 0, height: '18px', border: 0, padding: 0, minWidth: 0, width: '100%', color: 'var(--ink2,rgba(242,239,226,0.72))', background: 'transparent', appearance: 'none', fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase' }}>
                      <option value="crew">Working Crew</option>
                      <option value="stage">Stage</option>
                      <option value="aaa">AAA</option>
                    </select>
                    <span aria-hidden="true" style={{ position: 'absolute', right: '11px', fontFamily: "'Oswald',sans-serif", fontSize: '9px', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>▾</span>
                  </label>
                  <div className="d-queue-actions" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: row.status === 'approved' ? 'var(--grn,#00F5A5)' : row.status === 'rejected' ? 'var(--bad,#FF6B5A)' : 'var(--gold,#E3BB72)', textTransform: 'uppercase' }}>{row.status === 'submitted' ? 'pending' : row.status}</span>
                    {row.status === 'submitted' && <button type="button" disabled={busy} onClick={() => void decide(row.id, true)} className="hov-fill-grn" style={{ ...buttonStyle, borderColor: 'var(--grn,#00F5A5)', color: 'var(--grn,#00F5A5)' }}>Approve</button>}
                    {row.status === 'submitted' && (rejecting === row.id ? <><input aria-label={`Reason for rejecting ${row.full_name}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" style={{ ...inputStyle, maxWidth: '150px' }} /><button type="button" disabled={busy || reason.trim().length === 0} onClick={() => void decide(row.id, false, reason)} className="hov-fill-bad" style={{ ...buttonStyle, borderColor: 'var(--bad,#FF6B5A)', color: 'var(--bad,#FF6B5A)' }}>Confirm reject</button></> : <button type="button" disabled={busy} onClick={() => { setRejecting(row.id); setReason('') }} className="hov-fill-bad" style={{ ...buttonStyle, borderColor: 'var(--bad,#FF6B5A)', color: 'var(--bad,#FF6B5A)' }}>Reject</button>)}
                  </div>
                  {row.status === 'rejected' && row.decision_reason && <div style={{ gridColumn: '2 / -1', color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>Reason: {row.decision_reason}</div>}
                </div>
              )
            })}
          </section>
        ))}
        {orgs.length === 0 && !error && <p style={{ padding: '28px 18px', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>No people in this view.</p>}
        <div style={{ padding: '18px', fontFamily: "'Oswald',sans-serif", fontSize: '10.5px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--grn,#00F5A5)' }}>{approvedCount} approved</span>
          <span>{rows.filter((row) => row.status === 'submitted').length} pending</span>
          <span>{rows.filter((row) => row.status === 'rejected').length} rejected</span>
          <span style={{ marginLeft: 'auto', color: 'var(--ink2,rgba(242,239,226,0.72))' }}>Next org: {nextOrg?.name ?? '—'} →</span>
        </div>
      </div>
    </main>
  )
}
