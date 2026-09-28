'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { tier, tierColour } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { formatMasterBand, formatMasterCollected, masterCountLabel, masterFilterSummary } from '@/lib/format'
import { Icon } from '@/components/icon'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { EmptyState, InlineError } from '@/components/states'
import { loginHref } from '@/gate/session'
import { Button, Chip, FilterBar, StatusPill } from '@/components/r10/primitives-a'
import { Sheet } from '@/components/r10/primitives-b'

export function MasterScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const theme = useDomTheme()
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<MasterRow[]>([])
  /** ACC-162: the unfiltered population, so the screen can say "14 of 612". */
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [visualReady, setVisualReady] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<MasterRow | null>(null)
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
      setTotal(parsed.data.total)
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

  /**
   * ACC-162 — the eight columns a volunteer had to infer.
   *
   * The frozen contract draws no header row, and master is the one v2 screen
   * passing `test:visual`, so these are exposed as an ARIA table rather than as
   * visible headings: `.sr-only` is `position:absolute`, so this row is out of
   * flow and costs zero pixels, while a screen reader gets real row and column
   * semantics instead of a flat list of `div`s. The order MUST match the cells
   * below and `.mrow`'s six grid columns (app/v2.css).
   *
   * A visible header row is the other half of this problem and is NOT solved
   * here — see ADR-023: it would break the passing gate, so it was deliberately
   * left to Vipin rather than taken quietly.
   */
  const COLUMNS = ['Name and company', 'Tier', 'Band serial', 'Vehicle', 'BMS', 'Collected'] as const
  const showTable = !loading && !error && rows.length > 0
  const countLabel = masterCountLabel(rows.length, total)

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
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3)' }}>
            {countLabel}
          </span>
          <Link href="/desk/master" className="btn hov-invert-grn">Show everyone</Link>
        </div>
      )}
      <FilterBar
        className="master-filterbar"
        searchValue={query}
        onSearchChange={setQuery}
        searchLabel="Search the master list"
        searchPlaceholder="Name, phone, company, plate or band"
        activeFilters={[
          ...(orgFilter ? [{ id: 'org', label: `Organisation: ${rows[0]?.orgName ?? 'selected'}`, onRemove: () => router.replace('/desk/master') }] : []),
          ...(bmsFilter !== 'all' ? [{ id: 'bms', label: bmsFilter === 'true' ? 'BMS: In BMS' : 'BMS: Not in BMS', onRemove: () => router.replace(`/desk/master${orgFilter ? `?org=${orgFilter}` : ''}`) }] : []),
        ]}
        onClearAll={() => { setQuery(''); router.replace('/desk/master') }}
        resultCount={<><strong>{rows.length}</strong> of {total}</>}
      >
        <Button variant="ghost" onClick={() => {
          const next = new URLSearchParams(searchParams.toString())
          if (bmsFilter === 'false') next.set('in_bms', 'true')
          else next.set('in_bms', 'false')
          router.replace(`/desk/master?${next.toString()}`)
        }}>
          <Icon name="sort-descending" /> {bmsFilter === 'false' ? 'In BMS' : 'Not in BMS'}
        </Button>
        <a href={exportHref} download className="btn">Export CSV <Icon name="download-simple" /></a>
      </FilterBar>
      <div className="master-presets" aria-label="Roster presets">
        <Chip preset onActivate={() => router.replace('/desk/master?in_bms=false')} count={rows.filter((row) => !row.inBms).length}>Not in BMS</Chip>
        <Chip preset onActivate={() => router.replace('/desk/master?in_bms=true')} count={rows.filter((row) => row.inBms).length}>In BMS</Chip>
        <Chip preset onActivate={() => setQuery('vehicle')} count={rows.filter((row) => row.vehicleReg).length}>Has a vehicle</Chip>
        <Chip preset onActivate={() => setQuery('')} count={rows.filter((row) => !row.bandSerial).length}>Not collected</Chip>
      </div>
      <div className="bz rv section" style={{ ['--d' as string]: 2 }}>
        <div className="pl" {...(showTable ? { role: 'table', 'aria-label': `Master list. ${countLabel}.` } : {})}>
          {showTable && (
            <div role="row" className="master-thead">
              {COLUMNS.map((column) => <span role="columnheader" key={column}>{column}</span>)}
            </div>
          )}
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
              <div key={row.id} className="mrow" role="row" tabIndex={0} onClick={() => setSelectedPerson(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedPerson(row) } }}>
                <div role="cell">
                  <div className="nm">{row.fullName}</div>
                  <div className="sub">{row.orgName}, {row.phone}</div>
                </div>
                <span role="cell" className="band" style={{ ['--c' as string]: typeColor }}>{type?.label ?? '—'}</span>
                <span role="cell" className={bandClass}>{formatMasterBand(row)}</span>
                <span role="cell" className="plate">{row.vehicleReg ?? <span style={{ color: 'var(--ink3)' }}>No vehicle</span>}</span>
                <span role="cell" className="bms"><span className={`st ${row.inBms ? 'ok' : 'wait'}`}>{row.inBms ? 'In BMS' : 'Not in BMS'}</span></span>
                <span role="cell" className={collectedClass}>{formatMasterCollected(row)}</span>
              </div>
            )
          })}
        </div>
      </div>
      <PersonSheet person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      <style jsx global>{`
        .r10 .master-screen { padding-block: var(--s-10) var(--s-20); }
        .r10 .master-screen .head { margin-bottom: var(--s-8); }
        .r10 .master-filterbar { margin-bottom: var(--s-3); }
        .r10 .master-presets { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-bottom: var(--s-6); }
        .r10 .master-thead,
        .r10 .master-screen .mrow { display: grid; grid-template-columns: minmax(220px, 2.2fr) minmax(120px, 1fr) 96px minmax(120px, 1fr) 104px minmax(140px, 1.1fr); align-items: center; gap: var(--s-4); padding-inline: var(--s-6); }
        .r10 .master-thead { position: sticky; top: 64px; z-index: 2; min-height: 44px; color: var(--ink-3); background: var(--surface); box-shadow: inset 0 -1px 0 var(--hair); font: 600 var(--t-label)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .r10 .master-screen .mrow { min-height: 64px; padding-block: var(--s-3); cursor: pointer; }
        .r10 .master-screen .mrow:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
        .r10 .master-screen .band { color: var(--c); }
        .r10 .person-detail { display: grid; gap: var(--s-5); }
        .r10 .person-detail dl { display: grid; grid-template-columns: 1fr 1.5fr; gap: var(--s-3) var(--s-4); margin: 0; }
        .r10 .person-detail dt { color: var(--ink-3); }
        .r10 .person-detail dd { margin: 0; text-align: right; }
        @media (max-width: 700px) {
          .r10 .master-screen { padding-top: var(--s-6); }
          .r10 .master-thead { display: none; }
          .r10 .master-screen .mrow { grid-template-columns: 1fr; gap: var(--s-2); padding-inline: var(--s-5); }
          .r10 .master-screen .mrow > .hide-s { display: none; }
        }
        @media (prefers-reduced-transparency: reduce) {
          .r10 .person-sheet, .r10 .master-thead { background: var(--surface-solid); backdrop-filter: none; }
        }
      `}</style>
    </main>
  )
}

function PersonSheet({ person, onClose }: { person: MasterRow | null; onClose: () => void }) {
  return (
    <Sheet open={person !== null} onClose={onClose} title={person?.fullName ?? 'Person details'} className="person-sheet">
      {person && (
        <div className="person-detail">
          <div>
            <p className="label gold">{person.orgName}</p>
            <p className="body-sm ink-2">{person.phone}</p>
          </div>
          <dl>
            <dt>Tier</dt><dd>{person.typeCode ? tier(person.typeCode).label : 'Not assigned'}</dd>
            <dt>Pass</dt><dd className="mono">{person.passRef ?? 'Not issued'}</dd>
            <dt>Band</dt><dd className="mono">{formatMasterBand(person)}</dd>
            <dt>Vehicle</dt><dd className="mono">{person.vehicleReg ?? 'None'}</dd>
            <dt>BMS</dt><dd><StatusPill status={person.inBms ? 'ok' : 'wait'}>{person.inBms ? 'In BMS' : 'Not in BMS'}</StatusPill></dd>
            <dt>Collected</dt><dd>{formatMasterCollected(person)}</dd>
          </dl>
          <p className="body-sm ink-3">The history only grows. A reissue or a void adds a line; nothing above it changes.</p>
        </div>
      )}
    </Sheet>
  )
}
