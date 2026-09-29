'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { dashboardResponseSchema } from '@/lib/schemas/dashboard'
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
  /**
   * The r8-master.html subtitle is "{N} approved people. {M} more are still
   * waiting in the response sheet." Neither number is something this
   * screen's own /api/desk/master read has: that route counts every person
   * regardless of status (ACC-162's "14 of 612" is unfiltered, not
   * approved-only). Both come from the same RPC the Control room already
   * uses (approvedTotal, pendingTotal) rather than being invented here.
   */
  const [dashboardCounts, setDashboardCounts] = useState<{ approvedTotal: number; pendingTotal: number } | null>(null)
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

  useEffect(() => {
    let cancelled = false
    async function loadCounts() {
      try {
        const response = await fetch('/api/desk/dashboard')
        if (cancelled || !response.ok) return
        const parsed = dashboardResponseSchema.safeParse(await response.json())
        if (cancelled || !parsed.success) return
        setDashboardCounts({ approvedTotal: parsed.data.approvedTotal, pendingTotal: parsed.data.pendingTotal })
      } catch {
        // The subtitle just falls back to the roster's own count; the table
        // itself does not depend on this read.
      }
    }
    void loadCounts()
    return () => { cancelled = true }
  }, [])

  const filterSummary = masterFilterSummary({
    orgFiltered: Boolean(orgFilter),
    orgName: rows[0]?.orgName ?? null,
    inBms: bmsFilter,
    loading,
    empty: rows.length === 0,
  })

  const activeFilters = useMemo(() => [
    ...(orgFilter ? [{ id: 'org', label: `Organisation: ${rows[0]?.orgName ?? 'selected'}`, onRemove: () => router.replace('/desk/master') }] : []),
    ...(bmsFilter !== 'all' ? [{ id: 'bms', label: bmsFilter === 'true' ? 'BMS: In BMS' : 'BMS: Not in BMS', onRemove: () => router.replace(`/desk/master${orgFilter ? `?org=${orgFilter}` : ''}`) }] : []),
  ], [orgFilter, bmsFilter, rows, router])
  const hasActiveFilters = activeFilters.length > 0

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
  const COLUMNS = ['Person', 'Tier', 'Band', 'Vehicle', 'BMS', 'Collected'] as const
  const showTable = !loading && !error && rows.length > 0
  const countLabel = masterCountLabel(rows.length, total)

  return (
    <main id="main-content" tabIndex={-1} ref={rootRef} className="master-screen" data-v2-ready={visualReady ? 'true' : 'false'}>
      <section className="master-head rv">
        <div>
          <h1 className="display-lg">Master list</h1>
          <p className="lede">
            {dashboardCounts
              ? <>{dashboardCounts.approvedTotal} approved people. {dashboardCounts.pendingTotal > 0 && <>{dashboardCounts.pendingTotal} more {dashboardCounts.pendingTotal === 1 ? 'is' : 'are'} still waiting in the response sheet.</>}</>
              : <>{total} on the list.</>}
          </p>
        </div>
        <a href={exportHref} download className="btn">Export CSV <Icon name="download-simple" /></a>
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
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
            {filterSummary}
          </span>
          <span style={{ fontFamily: 'var(--f-mono)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
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
        searchPlaceholder="Name, phone, company, plate, band or pass"
        activeFilters={activeFilters}
        onClearAll={() => { setQuery(''); router.replace('/desk/master') }}
        resultCount={hasActiveFilters ? <><strong>{rows.length}</strong> of {total}</> : undefined}
      >
        <Button variant="ghost" onClick={() => {
          const next = new URLSearchParams(searchParams.toString())
          if (bmsFilter === 'false') next.set('in_bms', 'true')
          else next.set('in_bms', 'false')
          router.replace(`/desk/master?${next.toString()}`)
        }}>
          <Icon name="sort-descending" /> {bmsFilter === 'false' ? 'In BMS' : 'Not in BMS'}
        </Button>
      </FilterBar>
      {!hasActiveFilters && (
        <div className="filterbar-row master-presets" aria-label="Roster presets">
          <div className="chips">
            <Chip preset onActivate={() => router.replace('/desk/master?in_bms=false')} count={rows.filter((row) => !row.inBms).length}>Not in BMS</Chip>
            <Chip preset onActivate={() => router.replace('/desk/master?in_bms=true')} count={rows.filter((row) => row.inBms).length}>In BMS</Chip>
            <Chip preset onActivate={() => setQuery('vehicle')} count={rows.filter((row) => row.vehicleReg).length}>Has a vehicle</Chip>
            <Chip preset onActivate={() => setQuery('')} count={rows.filter((row) => !row.bandSerial).length}>Not collected</Chip>
            <span className="count body-sm">
              {query ? <><strong>{rows.length}</strong> of {total}</> : <><strong>{total}</strong> people</>}
            </span>
          </div>
        </div>
      )}
      <div className="table rv" style={{ ['--d' as string]: 2, marginTop: 'var(--s-6)' }} {...(showTable ? { role: 'table', 'aria-label': `Master list. ${countLabel}.` } : {})}>
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
            const typeColor = type ? tierColour(type.code, theme) : 'var(--ink-3)'
            const bandClass = row.status === 'rejected' || row.status === 'voided'
              ? 'ser void'
              : row.bandSerial ? 'ser' : 'ser none'
            const collectedClass = row.status === 'rejected' ? 'when bad' : row.collectedAt ? 'when' : 'when mute'
            return (
              <div key={row.id} className="mrow" role="row" tabIndex={0} onClick={() => setSelectedPerson(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedPerson(row) } }}>
                <div role="cell">
                  <div className="nm">{row.fullName}</div>
                  <div className="sub">{row.orgName} · {row.phone}</div>
                </div>
                <span role="cell" className="band hide-s" style={{ ['--c' as string]: typeColor }}>{type?.label ?? '—'}</span>
                <span role="cell" className={`hide-s ${bandClass}`}>{formatMasterBand(row)}</span>
                <span role="cell" className="hide-s plate">{row.vehicleReg ?? <span className="muted">–</span>}</span>
                <span role="cell" className="hide-s bms"><span className={`st ${row.inBms ? 'ok' : 'wait'}`}>{row.inBms ? 'In BMS' : 'Not in BMS'}</span></span>
                <span role="cell" className={`hide-s ${collectedClass}`}>{row.collectedAt || (row.status === 'rejected' && row.decidedAt) ? formatMasterCollected(row) : <span className="muted">–</span>}</span>
                {/* r8-master's mobile row2: the one summary line a collapsed row keeps
                    — tier, BMS state, and the collected/not-collected status — instead
                    of stacking all six columns full-height on a phone. */}
                <div className="row2">
                  <span className="band" style={{ ['--c' as string]: typeColor }}>{type?.label ?? '—'}</span>
                  <span className={`st ${row.inBms ? 'ok' : 'wait'}`}>{row.inBms ? 'In BMS' : 'Not in BMS'}</span>
                  <span className={collectedClass}>{formatMasterCollected(row)}</span>
                </div>
              </div>
            )
          })}
      </div>
      <PersonSheet person={selectedPerson} onClose={() => setSelectedPerson(null)} />
      <style jsx global>{`
        /* app/v2.css still ships .head, .nm, .sub, .band, .st, .mrow .ser/.plate/.when
           as UNSCOPED rules (no .r10 ancestor). Every selector below re-declares
           what this screen needs at (.r10 .master-screen ...) specificity so the
           v2 rule never wins — see scripts/.design-compare.mjs pitfall (1). */
        /* No padding-block here: this <main> already sits inside desk-chrome's
           .frame.page (app/r10/base.css), which supplies padding-top: var(--s-10)
           and padding-bottom: var(--s-20). A second padding-block here stacked a
           redundant 40px under the nav — the title sat ~48px lower than the mock. */
        .r10 .master-screen .master-head {
          display: flex; align-items: end; justify-content: space-between;
          gap: var(--s-4) var(--s-6); flex-wrap: wrap; margin-bottom: var(--s-8);
          padding: 0;
        }
        .r10 .master-filterbar { margin-bottom: var(--s-3); }
        .r10 .master-screen .master-presets {
          justify-content: space-between; align-items: center; margin-bottom: var(--s-6);
        }
        .r10 .master-screen .master-presets .chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
        .r10 .master-thead,
        .r10 .master-screen .mrow { display: grid; grid-template-columns: minmax(220px, 2.2fr) minmax(120px, 1fr) 96px minmax(120px, 1fr) 104px minmax(140px, 1.1fr); align-items: center; gap: var(--s-4); padding-inline: var(--s-6); }
        /* app/r10/base.css's ".table > :not(.thead)" (0,3,0) — meant to lift table
           BODY rows above the card's ::before layer — also matches our header
           because its class is "master-thead", not "thead": :not(.thead) is
           true for it too. That downgraded position:sticky to the inherited
           position:relative while our top:64px still applied, shifting the
           header 64px down ON TOP of the first row. (0,4,0) beats it cleanly. */
        .r10 .master-screen .table .master-thead { position: sticky; top: 64px; z-index: 2; min-height: 44px; color: var(--ink-3); background: var(--surface); box-shadow: inset 0 -1px 0 var(--hair); font: 600 var(--t-label)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .r10 .master-screen .mrow { min-height: 64px; padding-block: var(--s-3); cursor: pointer; }
        .r10 .master-screen .mrow:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }

        /* Row typography and cell colour — r8/ui.css's .tr .nm/.sub, .tier, .mono,
           .pill and .tr .muted, re-targeted at this screen's .mrow cells. */
        .r10 .master-screen .mrow .nm { font: 600 14.5px/1.2 var(--f-label); letter-spacing: .02em; text-transform: uppercase; color: var(--ink); }
        .r10 .master-screen .mrow .sub { margin-top: 2px; font: 400 var(--t-body-sm)/1.45 var(--f-body); letter-spacing: -.005em; color: var(--ink-3); }
        .r10 .master-screen .mrow .band {
          display: inline-flex; align-items: center; gap: var(--s-2);
          font: 600 var(--t-label)/1 var(--f-label); letter-spacing: var(--track-label);
          text-transform: uppercase; color: var(--ink);
        }
        .r10 .master-screen .mrow .band::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
        .r10 .master-screen .mrow .ser,
        .r10 .master-screen .mrow .plate { font: 500 var(--t-mono)/1.3 var(--f-mono); letter-spacing: .04em; color: var(--ink); }
        .r10 .master-screen .mrow .ser.none { color: var(--ink-3); font-weight: 500; }
        .r10 .master-screen .mrow .ser.void { color: var(--bad); font: 600 var(--t-label-sm)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .r10 .master-screen .mrow .st {
          display: inline-flex; align-items: center; gap: 6px; height: 26px;
          padding: 0 var(--s-3) 0 10px; border-radius: var(--r-pill);
          font: 600 var(--t-label-sm)/1 var(--f-label); letter-spacing: var(--track-label);
          text-transform: uppercase; white-space: nowrap; background: var(--raised); color: var(--ink-2);
        }
        .r10 .master-screen .mrow .st::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .r10 .master-screen .mrow .st.ok { background: var(--ok-tint); color: var(--go); }
        .r10 .master-screen .mrow .st.wait { background: var(--wait-tint); color: var(--gold); }
        .r10 .master-screen .mrow .when { font: 400 var(--t-body-sm)/1.45 var(--f-body); letter-spacing: -.005em; text-transform: none; text-align: right; color: var(--ink-2); }
        .r10 .master-screen .mrow .when.mute { color: var(--ink-3); }
        .r10 .master-screen .mrow .when.bad { color: var(--bad); }
        .r10 .master-screen .mrow .muted { color: var(--ink-3); }
        .r10 .master-screen .mrow .row2 { display: none; }

        .r10 .person-detail { display: grid; gap: var(--s-5); }
        .r10 .person-detail dl { display: grid; grid-template-columns: 1fr 1.5fr; gap: var(--s-3) var(--s-4); margin: 0; }
        .r10 .person-detail dt { color: var(--ink-3); }
        .r10 .person-detail dd { margin: 0; text-align: right; }
        @media (max-width: 700px) {
          .r10 .master-screen .master-head { align-items: start; flex-direction: column; gap: var(--s-5); }
          .r10 .master-thead { display: none; }
          .r10 .master-screen .mrow { grid-template-columns: 1fr; gap: var(--s-2); padding-inline: var(--s-5); }
          .r10 .master-screen .mrow > .hide-s { display: none; }
          .r10 .master-screen .mrow .row2 {
            display: flex !important; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-3);
          }
          .r10 .master-screen .mrow .row2 .when { text-align: left; color: var(--ink-3); }
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
