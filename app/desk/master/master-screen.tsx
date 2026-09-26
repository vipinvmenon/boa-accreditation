'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { tier, tierColour } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { formatMasterBand, formatMasterCollected, masterFilterSummary } from '@/lib/format'
import { Icon } from '@/components/icon'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { EmptyState, InlineError } from '@/components/states'
import { loginHref } from '@/gate/session'

export function MasterScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const theme = useDomTheme()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<MasterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visualReady, setVisualReady] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const bmsParam = searchParams.get('in_bms')
  const bmsFilter = bmsParam === 'true' || bmsParam === 'false' ? bmsParam : 'all'
  /**
   * ADR-021: Organisations links here instead of listing people itself, so
   * this screen is the ONE place people are listed. An exact org id, not the
   * free-text search — clicking "Sound" must not also return "Soundcheck".
   */
  const orgFilter = searchParams.get('org') ?? ''

  async function load(nextQuery: string, nextBmsFilter: 'all' | 'true' | 'false', nextOrg: string) {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (nextQuery) params.set('q', nextQuery)
      if (nextBmsFilter !== 'all') params.set('in_bms', nextBmsFilter)
      if (nextOrg) params.set('org', nextOrg)
      const response = await fetch(`/api/desk/master?${params.toString()}`)
      if (response.status === 401) {
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      if (!response.ok) {
        setError('Unable to load the master list.')
        return
      }
      const parsed = masterResponseSchema.safeParse(await response.json())
      if (!parsed.success) {
        setError('Unable to load the master list.')
        return
      }
      setRows(parsed.data.rows)
      setError(null)
    } catch {
      // A thrown fetch (network down) must still clear the spinner and tell
      // the operator, not leave the skeleton spinning forever.
      setError('Unable to load the master list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(query, bmsFilter, orgFilter), 180)
    return () => window.clearTimeout(timer)
    // The query and filters are the intended inputs; load is stable for this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, bmsFilter, orgFilter])

  const filterSummary = masterFilterSummary({
    orgFiltered: Boolean(orgFilter),
    orgName: rows[0]?.orgName ?? null,
    inBms: bmsFilter,
    loading,
    empty: rows.length === 0,
  })

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'csv' })
    if (query) params.set('q', query)
    if (bmsFilter !== 'all') params.set('in_bms', bmsFilter)
    // The export must be what is on screen. Leaving the org out here would
    // hand someone a CSV of everybody while the table showed one company.
    if (orgFilter) params.set('org', orgFilter)
    return `/api/desk/master?${params.toString()}`
  }, [query, bmsFilter, orgFilter])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    setVisualReady(false)
    const revealables = root.querySelectorAll<HTMLElement>('.rv')
    const timer = window.setTimeout(() => setVisualReady(true), 1100)
    if (!('IntersectionObserver' in window)) {
      revealables.forEach((element) => element.classList.add('in'))
    } else {
      const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }), { threshold: 0.12 })
      revealables.forEach((element) => observer.observe(element))
      return () => {
        observer.disconnect()
        window.clearTimeout(timer)
      }
    }
    return () => window.clearTimeout(timer)
  }, [rows.length, loading, error])

  return (
    <main id="main-content" tabIndex={-1} ref={rootRef} data-v2-ready={visualReady ? 'true' : 'false'}>
      <section className="head rv">
        <div>
          <span className="tag">Master list</span>
          <h1 className="h1">Everyone accredited</h1>
          <p className="lede">Append-only. A reissue adds a row, it never overwrites the first. BMS entry is manual, and the flag tracks who is still to be added.</p>
        </div>
      </section>
      {filterSummary && (
        /**
         * A filter the operator cannot see is a bug: they arrive from
         * Organisations, count three people, and conclude the roster lost
         * twenty-two. It names the company and offers the way out.
         *
         * ACC-154: `?in_bms=` is reached from the "N not in BMS" badge in the
         * chrome of every desk screen and had neither the name nor the way
         * out, so the list silently showed 14 of 612. One banner now covers
         * both filters, and "Show everyone" clears both (lib/format.ts).
         */
        <div
          className="rv"
          role="status"
          style={{
            ['--d' as string]: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            margin: '0 0 18px',
          }}
        >
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink2,rgba(242,239,226,0.72))' }}>
            {filterSummary}
          </span>
          <Link href="/desk/master" className="btn hov-invert-grn">Show everyone</Link>
        </div>
      )}
      <div className="row rv" style={{ ['--d' as string]: 1, alignItems: 'center' }}>
        <label className="search" style={{ flex: 1 }}>
          <Icon name="magnifying-glass" />
          <input aria-label="Search master list" placeholder="Search name, phone, company or band serial" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <a href={exportHref} download className="btn">
          Export CSV<span className="ic"><Icon name="download-simple" /></span>
        </a>
      </div>
      <div className="bz rv section" style={{ ['--d' as string]: 2 }}>
        <div className="pl">
          {error && (
            <div className="mrow">
              <InlineError message={error} onRetry={() => void load(query, bmsFilter, orgFilter)} />
            </div>
          )}
          {loading && !error && (
            <div className="table-skeleton" role="status" aria-label="Loading master list">
              {Array.from({ length: 5 }, (_, index) => (
                <div className="mrow" key={index}>
                  <LoadingSkeleton width="42%" />
                  <LoadingSkeleton width="68px" />
                  <LoadingSkeleton width="56px" />
                  <LoadingSkeleton width="76px" />
                  <LoadingSkeleton width="82px" />
                  <LoadingSkeleton width="92px" />
                </div>
              ))}
            </div>
          )}
          {/* ACC-134: the in-app queue this empty state used to name was retired
              (ADR-019, 22 Sep) — approval now happens from the response sheet,
              not a screen here. */}
          {!loading && !error && rows.length === 0 && (
            /* ACC-154: "Try a phone number or a band serial" is the frozen
               design's own string (boa_design_v2.html:778) and stays for the
               search. It is the wrong advice when a filter, not the query, is
               why the list is empty — the banner above says which. */
            <EmptyState message={
              query
                ? 'Nobody matches that. Try a phone number or a band serial.'
                : orgFilter || bmsFilter !== 'all'
                  ? 'Nobody matches this filter. Show everyone to see the full list.'
                  : 'Nobody accredited yet. This list fills in once people are approved.'
            } />
          )}
          {!loading && !error && rows.map((row) => {
            const type = row.typeCode ? tier(row.typeCode) : null
            const typeColor = type ? tierColour(type.code, theme) : 'var(--ink3)'
            const bandClass = row.status === 'rejected' || row.status === 'voided'
              ? 'ser void'
              : row.bandSerial ? 'ser' : 'ser none'
            const collectedClass = row.status === 'rejected' ? 'when bad' : row.collectedAt ? 'when' : 'when mute'
            return (
              <div key={row.id} className="mrow">
                <div>
                  <div className="nm">{row.fullName}</div>
                  <div className="sub">{row.orgName}, {row.phone}</div>
                </div>
                <span className="band" style={{ ['--c' as string]: typeColor }}>{type?.label ?? '—'}</span>
                <span className={bandClass}>{formatMasterBand(row)}</span>
                <span className="plate">{row.vehicleReg ?? <span style={{ color: 'var(--ink3)' }}>No vehicle</span>}</span>
                <span className="bms"><span className={`st ${row.inBms ? 'ok' : 'wait'}`}>{row.inBms ? 'In BMS' : 'Not in BMS'}</span></span>
                <span className={collectedClass}>{formatMasterCollected(row)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
