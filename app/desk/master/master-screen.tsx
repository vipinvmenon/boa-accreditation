'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { passType, PROP, type PassTypeCode } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { formatMasterBand, formatMasterCollected } from '@/lib/format'

export function MasterScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const theme = useDomTheme()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<MasterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const p = PROP[theme]
  const bmsParam = searchParams.get('in_bms')
  const bmsFilter = bmsParam === 'true' || bmsParam === 'false' ? bmsParam : 'all'

  async function load(nextQuery: string, nextBmsFilter: 'all' | 'true' | 'false') {
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
    <main style={{ background: 'var(--bg,#0A0A0A)', color: 'var(--ink,#F2EFE2)' }}>
      <div className="d-shell">
        <header className="d-pad-sec" style={{ borderBottom: `1px solid ${p.rule}` }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--grn,#00F5A5)', marginBottom: '16px' }}>
            Master list
          </div>
          <h1 className="d-h1b" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 0.94, textTransform: 'uppercase', color: 'var(--ink,#F2EFE2)', margin: '0 0 14px' }}>
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
            className="foc-bg-panel"
            style={{ flex: '1 1 auto', minWidth: 0, border: 0, borderRight: `1px solid ${p.rule}`, background: 'transparent', color: 'var(--ink,#F2EFE2)', padding: '16px 18px', fontFamily: "'Oswald',sans-serif", fontSize: '11.5px', letterSpacing: '0.1em', textTransform: 'uppercase', outline: 'none' }}
          />
          <a href={exportHref} download className="hov-text-grn" style={{ display: 'flex', alignItems: 'center', padding: '16px 18px', color: 'var(--ink2,rgba(242,239,226,0.72))', fontFamily: "'Oswald',sans-serif", fontSize: '12px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', textDecoration: 'none', whiteSpace: 'nowrap' }}>
            Export CSV
          </a>
        </div>

        {error && <div role="alert" style={{ padding: '15px 18px', color: 'var(--ink3,rgba(242,239,226,0.42))', fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>{error}</div>}
        {loading && !error && <div style={{ padding: '15px 18px', color: 'var(--ink3,rgba(242,239,226,0.42))', fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Loading…</div>}
        {!loading && !error && rows.length === 0 && <div style={{ padding: '15px 18px', color: 'var(--ink3,rgba(242,239,226,0.42))', fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>No accredited people match this view.</div>}

        {rows.map((row) => {
          const type = row.typeCode ? passType(row.typeCode as PassTypeCode) : null
          const bandColour = row.status === 'rejected' || row.status === 'voided' ? p.bad : row.bandSerial ? p.grn : p.ink3
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                <span style={{ width: '8px', height: '18px', background: type?.colour ?? p.ink3, flex: '0 0 auto' }} />
                <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink2,rgba(242,239,226,0.72))' }}>
                  {type?.label ?? '—'}
                </span>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: bandColour }}>
                {formatMasterBand(row)}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: row.vehicleReg ? p.gold : p.ink3 }}>
                {row.vehicleReg ?? '—'}
              </div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: row.inBms ? p.grn : p.gold }}>
                {row.inBms ? 'In BMS' : 'Not in BMS'}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: row.status === 'rejected' ? p.bad : row.collectedAt ? p.ink2 : p.ink3, textAlign: 'right' }}>
                {formatMasterCollected(row)}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
