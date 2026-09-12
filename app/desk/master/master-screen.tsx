'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { passType, PROP, type PassTypeCode } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'

type BmsFilter = 'all' | 'true' | 'false'

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

function collectedLabel(row: MasterRow): string {
  if (row.collectedAt) {
    return `Issued ${new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(row.collectedAt))}`
  }
  if (row.status === 'rejected') return 'Rejected'
  return 'Not collected'
}

export function MasterScreen() {
  const router = useRouter()
  const theme = useDomTheme()
  const [query, setQuery] = useState('')
  const [bmsFilter, setBmsFilter] = useState<BmsFilter>('all')
  const [rows, setRows] = useState<MasterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const p = PROP[theme]

  async function load(nextQuery: string, nextBmsFilter: BmsFilter) {
    setLoading(true)
    const params = new URLSearchParams()
    if (nextQuery) params.set('q', nextQuery)
    if (nextBmsFilter !== 'all') params.set('in_bms', nextBmsFilter)
    const response = await fetch(`/api/desk/master?${params.toString()}`)
    if (response.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!response.ok) {
      setError('Unable to load the master list.')
      setLoading(false)
      return
    }
    const parsed = masterResponseSchema.safeParse(await response.json())
    if (!parsed.success) {
      setError('Unable to load the master list.')
      setLoading(false)
      return
    }
    setRows(parsed.data.rows)
    setError(null)
    setLoading(false)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query, bmsFilter), 180)
    return () => window.clearTimeout(timer)
    // The query and filter are the intended inputs; load is stable for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, bmsFilter])

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'csv' })
    if (query) params.set('q', query)
    if (bmsFilter !== 'all') params.set('in_bms', bmsFilter)
    return `/api/desk/master?${params.toString()}`
  }, [query, bmsFilter])

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)', color: 'var(--ink,#F2EFE2)', paddingBottom: '64px' }}>
      <div className="d-shell">
        <header style={{ padding: '40px 18px 24px', borderBottom: `1px solid ${p.rule}` }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--grn,#00F5A5)', marginBottom: '16px' }}>
            Master list
          </div>
          <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(42px,7vw,68px)', lineHeight: 0.94, textTransform: 'uppercase', color: 'var(--ink,#F2EFE2)', margin: '0 0 14px' }}>
            Everyone accredited
          </h1>
          <p style={{ fontSize: '14.5px', lineHeight: 1.55, color: 'var(--ink3,rgba(242,239,226,0.42))', margin: 0, maxWidth: '62ch' }}>
            Append-only. A reissue adds a row, it never overwrites the first. BMS entry is manual — the flag tracks who is still to be added.
          </p>
        </header>

        <div style={{ display: 'flex', borderBottom: `1px solid ${p.rule}` }}>
          <input
            aria-label="Search master list"
            placeholder="SEARCH NAME, PHONE, COMPANY, BAND SERIAL"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            style={{ flex: '1 1 auto', minWidth: 0, border: 0, borderRight: `1px solid ${p.rule}`, background: 'transparent', color: 'var(--ink,#F2EFE2)', padding: '16px 18px', fontFamily: "'Oswald',sans-serif", fontSize: '11.5px', letterSpacing: '0.1em', textTransform: 'uppercase', outline: 'none' }}
          />
          <a href={exportHref} download className="hov-text-grn" style={{ ...buttonStyle, display: 'flex', alignItems: 'center', border: 0, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Export CSV
          </a>
        </div>

        <nav aria-label="BMS filter" style={{ display: 'flex', overflowX: 'auto', borderBottom: `1px solid ${p.rule}` }}>
          {([
            ['all', 'All'],
            ['false', 'Not in BMS'],
            ['true', 'In BMS'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setBmsFilter(value)}
              style={{ ...buttonStyle, border: 0, borderRight: `1px solid ${p.rule}`, background: bmsFilter === value ? 'var(--grn,#00F5A5)' : 'transparent', color: bmsFilter === value ? 'var(--on,#0A0A0A)' : undefined }}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && <p style={{ margin: '18px', color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{error}</p>}
        {loading && !error && <p style={{ margin: '18px', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>Loading…</p>}
        {!loading && !error && rows.length === 0 && <p style={{ margin: '18px', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>No accredited people match this view.</p>}

        {rows.map((row) => {
          const type = row.typeCode ? passType(row.typeCode as PassTypeCode) : null
          const bandColour = row.bandSerial ? p.grn : row.status === 'rejected' ? p.bad : p.ink3
          return (
            <div key={row.id} className="d-master-cols" style={{ display: 'grid', gap: '16px', padding: '15px 18px', borderBottom: `1px solid ${p.rule}`, alignItems: 'center' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '16px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--ink,#F2EFE2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.fullName}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.orgName} · {row.phone}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '18px', background: type?.colour ?? p.ink3, flex: '0 0 auto' }} />
                <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink2,rgba(242,239,226,0.72))' }}>
                  {type?.label ?? row.status}
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: bandColour }}>
                {row.bandSerial ?? 'Not issued'}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: row.vehicleReg ? p.gold : p.ink3 }}>
                {row.vehicleReg ?? '—'}
              </div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: row.inBms ? p.grn : p.gold }}>
                {row.inBms ? 'In BMS' : 'Not in BMS'}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: row.collectedAt ? p.ink2 : p.ink3, textAlign: 'right' }}>
                {collectedLabel(row)}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
