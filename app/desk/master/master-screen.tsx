'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { dashboardResponseSchema } from '@/lib/schemas/dashboard'
import { bandArtSrc, tier, tierColour, zoneStrip, ZONES, type Theme } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { useSkeletonMemory } from '@/lib/skeleton-memory'
import { z } from 'zod'
import { formatLedgerTime, formatMasterCollected, masterCountLabel } from '@/lib/format'
import {
  MASTER_DAY_LABELS,
  MASTER_FIELD_LABELS,
  MASTER_FILTER_KEYS,
  MASTER_PRESETS,
  hasMasterFilters,
  masterFilterOptions,
  masterFilterValueLabel,
  masterFiltersToParams,
  masterStatusOf,
  matchesMasterFilters,
  matchesMasterSearch,
  parseMasterFilters,
  presetFilters,
  EMPTY_MASTER_FILTERS,
  type MasterFilterKey,
  type MasterFilters,
} from '@/lib/master-filter'
import { Icon } from '@/components/icon'
import { loginHref } from '@/gate/session'
import { Button, Chip, FilterBar } from '@/components/r10/primitives-a'
import { EmptyState, Sheet, Skeleton, SkeletonText } from '@/components/r10/primitives-b'

const PAGE = 60
type SortKey = 'default' | 'name' | 'collected'
type MenuState = { open: false } | { open: true; field: MasterFilterKey | null }

/** lib/skeleton-memory.ts: the digit counts the header last loaded with. */
const masterShapeSchema = z.object({
  approvedDigits: z.number().int().min(1).max(6),
  pendingDigits: z.number().int().min(0).max(6),
  chipDigits: z.array(z.number().int().min(1).max(6)).max(12),
  totalDigits: z.number().int().min(1).max(6),
})

export function MasterScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const theme = useDomTheme()
  const [rows, setRows] = useState<MasterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPerson, setSelectedPerson] = useState<MasterRow | null>(null)
  // The last person opened, kept while the sheet slides out so it does not
  // collapse to an empty panel mid-animation.
  const [sheetPerson, setSheetPerson] = useState<MasterRow | null>(null)
  /**
   * The r8-master.html subtitle is "{N} approved people. {M} more are still
   * waiting in the response sheet." Neither number is on this screen's own
   * read (it counts every person regardless of status); both come from the
   * same RPC the Control room uses (approvedTotal, pendingTotal).
   */
  const [dashboardCounts, setDashboardCounts] = useState<{ approvedTotal: number; pendingTotal: number } | null>(null)
  // The lede holds a skeleton line while the counts are in flight, so the
  // header does not grow when they land; a failed read drops it entirely.
  const [countsLoading, setCountsLoading] = useState(true)

  // ── Filters live in the URL (?tier=crew&status=not_collected&in_bms=false…) ──
  // The Control room and Organisations link here with them, and a filtered
  // view can be bookmarked. history.replaceState keeps typing and toggling
  // client-side: Next.js syncs it into useSearchParams without a server trip.
  const filters = useMemo(() => parseMasterFilters(searchParams), [searchParams])
  const [draftQuery, setDraftQuery] = useState(searchParams.get('q') ?? '')
  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  const [shown, setShown] = useState(PAGE)
  const [sort, setSort] = useState<SortKey>('default')
  const [menu, setMenu] = useState<MenuState>({ open: false })
  const [toast, setToast] = useState<{ id: number; text: string; bad: boolean } | null>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const writeUrl = useCallback((nextQuery: string, nextFilters: MasterFilters) => {
    const params = new URLSearchParams()
    if (nextQuery) params.set('q', nextQuery)
    masterFiltersToParams(nextFilters, params)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
  }, [])

  function changeFilters(next: MasterFilters) {
    setShown(PAGE)
    writeUrl(query, next)
  }

  // The URL write stays outside the state updater: replaceState inside it
  // updated Next's router while React was rendering MasterScreen (the "Cannot
  // update a component while rendering" error, 1 Oct review).
  useEffect(() => {
    if (draftQuery === query) return
    const timer = window.setTimeout(() => {
      setShown(PAGE)
      setQuery(draftQuery)
      writeUrl(draftQuery, parseMasterFilters(new URLSearchParams(window.location.search)))
    }, 120)
    return () => window.clearTimeout(timer)
  }, [draftQuery, query, writeUrl])

  async function load() {
    setLoading(true)
    try {
      const response = await fetch('/api/desk/master')
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
      // A thrown fetch (network down) must still clear the skeleton and tell
      // the operator, not leave it spinning forever.
      setError('Unable to load the master list.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Once on arrival: the whole roster is read and filtered in the browser.
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        // The subtitle is simply left out; the table does not depend on it.
      } finally {
        if (!cancelled) setCountsLoading(false)
      }
    }
    void loadCounts()
    return () => { cancelled = true }
  }, [])

  // ── The list ──
  const total = rows.length
  const list = useMemo(() => {
    const matched = rows.filter((row) => matchesMasterSearch(row, query) && matchesMasterFilters(row, filters))
    if (sort === 'name') return [...matched].sort((a, b) => a.fullName.localeCompare(b.fullName))
    if (sort === 'collected') return [...matched].sort((a, b) => (b.collectedAt ?? '').localeCompare(a.collectedAt ?? ''))
    return matched
  }, [rows, query, filters, sort])
  const activeKeys = MASTER_FILTER_KEYS.filter((key) => filters[key].length > 0)
  const hasFilter = query.trim() !== '' || hasMasterFilters(filters)
  const countLabel = masterCountLabel(list.length, total)
  const showTable = !loading && !error && list.length > 0
  const presetCounts = useMemo(
    () => MASTER_PRESETS.map((preset) => {
      const f = presetFilters(preset.filters)
      return rows.filter((row) => matchesMasterFilters(row, f)).length
    }),
    [rows],
  )

  // How wide the counts were last time, and whether the lede had its
  // "still waiting" clause, so the skeleton header is the loaded header's
  // size (lib/skeleton-memory.ts). Digit counts only, never the numbers.
  const shape = useSkeletonMemory('master', masterShapeSchema, dashboardCounts && !loading ? {
    approvedDigits: String(dashboardCounts.approvedTotal).length,
    pendingDigits: dashboardCounts.pendingTotal > 0 ? String(dashboardCounts.pendingTotal).length : 0,
    chipDigits: presetCounts.map((n) => String(n).length),
    totalDigits: String(total).length,
  } : null)

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ format: 'csv' })
    if (query) params.set('q', query)
    // The export must be what is on screen: same search, same filters.
    masterFiltersToParams(filters, params)
    return `/api/desk/master?${params.toString()}`
  }, [query, filters])

  // ── Add-filter menu ──
  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenu({ open: false })
    if (returnFocus) addRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!menu.open) return
    menuRef.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [menu])

  useEffect(() => {
    if (!menu.open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element | null
      if (!target || target.closest('.add-wrap') || target.closest('[data-edit]')) return
      setMenu({ open: false })
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMenu(true)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu.open, closeMenu])

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button, input') ?? [])
    if (items.length === 0) return
    event.preventDefault()
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1)
    items[next]?.focus()
  }

  function toggleValue(key: MasterFilterKey, value: string, on: boolean) {
    const current = filters[key] as string[]
    const nextValues = on ? [...current, value] : current.filter((v) => v !== value)
    changeFilters({ ...filters, [key]: nextValues } as MasterFilters)
  }

  function clearEverything() {
    setDraftQuery('')
    setQuery('')
    setShown(PAGE)
    writeUrl('', EMPTY_MASTER_FILTERS)
  }

  function showToast(text: string, bad = false) {
    setToast({ id: Date.now(), text, bad })
  }
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const menuField = menu.open ? menu.field : null

  return (
    <main id="main-content" tabIndex={-1} className="master-screen">
      <div className="page-head">
        <div>
          <h1 className="display-lg">Master list</h1>
          {dashboardCounts ? (
            <p className="lede">
              {dashboardCounts.approvedTotal} approved people.{dashboardCounts.pendingTotal > 0 && <> {dashboardCounts.pendingTotal} more {dashboardCounts.pendingTotal === 1 ? 'is' : 'are'} still waiting in the response sheet.</>}
            </p>
          ) : countsLoading && (
            <p className="lede" aria-hidden="true">
              <SkeletonText w={`${shape?.approvedDigits ?? 2}ch`} /> approved people.{(shape === null || shape.pendingDigits > 0) && <> <SkeletonText w={`${shape?.pendingDigits ?? 2}ch`} /> more are still waiting in the response sheet.</>}
            </p>
          )}
        </div>
        <a href={exportHref} download className="btn btn-export">Export CSV<span className="ic" aria-hidden="true"><Icon name="download-simple" /></span></a>
      </div>

      <FilterBar
        className="master-filterbar"
        searchValue={draftQuery}
        onSearchChange={setDraftQuery}
        searchLabel="Search the master list"
        searchPlaceholder="Name, phone, plate or band"
      >
        <div className="add-wrap">
          <button
            ref={addRef}
            type="button"
            className="btn"
            aria-haspopup="menu"
            aria-expanded={menu.open}
            onClick={() => setMenu(menu.open ? { open: false } : { open: true, field: null })}
          >
            <span className="master-add-ic" aria-hidden="true"><Icon name="funnel-simple" /></span><span className="btn-label">Add filter</span>
          </button>
          {menu.open && (
            <div className="menu" role="menu" aria-label="Add a filter" ref={menuRef} onKeyDown={onMenuKeyDown}>
              {menuField === null ? (
                <>
                  <div className="menu-title label-sm">Filter by</div>
                  {MASTER_FILTER_KEYS.map((key) => (
                    <button key={key} type="button" role="menuitem" onClick={() => setMenu({ open: true, field: key })}>
                      {MASTER_FIELD_LABELS[key]}
                      {filters[key].length > 0
                        ? <span className="n">{filters[key].length} on</span>
                        : <span className="n" aria-hidden="true"><Icon name="caret-right" /></span>}
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <button type="button" className="menu-back" onClick={() => setMenu({ open: true, field: null })}>
                    <Icon name="caret-left" />{MASTER_FIELD_LABELS[menuField]}
                  </button>
                  {masterFilterOptions(rows, menuField).map((option) => (
                    <label key={option.value}>
                      <input
                        type="checkbox"
                        value={option.value}
                        checked={(filters[menuField] as string[]).includes(option.value)}
                        onChange={(event) => toggleValue(menuField, option.value, event.target.checked)}
                      />
                      {option.tierCode && <span className="swatch" style={{ ['--c' as string]: tierColour(option.tierCode, theme) }} />}
                      {option.label}
                      <span className="n">{option.count}</span>
                    </label>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </FilterBar>
      <div className="filterbar-row master-chips">
        <div className="chips" aria-label="Active filters">
          {activeKeys.length === 0
            ? MASTER_PRESETS.map((preset, index) => (
              <Chip key={preset.label} preset count={loading ? <SkeletonText w={`${shape?.chipDigits[index] ?? 1}ch`} /> : presetCounts[index] ?? 0} onActivate={() => changeFilters(presetFilters(preset.filters))}>
                {preset.label}
              </Chip>
            ))
            : (
              <>
                {activeKeys.map((key) => (
                  <Chip
                    key={key}
                    onEdit={() => setMenu({ open: true, field: key })}
                    removeLabel={`Remove ${MASTER_FIELD_LABELS[key]} filter`}
                    onRemove={() => changeFilters({ ...filters, [key]: [] })}
                  >
                    <b>{MASTER_FIELD_LABELS[key]}:</b> {(filters[key] as string[]).map((value) => masterFilterValueLabel(rows, key, value)).join(', ')}
                  </Chip>
                ))}
                {activeKeys.length >= 2 && (
                  <Button variant="ghost" className="btn-sm" onClick={() => changeFilters(EMPTY_MASTER_FILTERS)}>Clear all</Button>
                )}
              </>
            )}
        </div>
        {!error && (
          <span className="count body-sm" aria-live="polite">
            {loading
              ? <><strong><SkeletonText w={`${shape?.totalDigits ?? 2}ch`} /></strong> people</>
              : hasFilter ? <><strong>{list.length}</strong> of {total}</> : <><strong>{total}</strong> people</>}
          </span>
        )}
      </div>

      {error && (
        <section className="empty empty-error" role="alert">
          <span aria-hidden="true"><Icon name="warning-circle" /></span>
          <h2 className="display-sm">The list didn’t load</h2>
          <p>Your connection or the server stopped answering. Nothing you did was lost.</p>
          <Button icon={<Icon name="arrows-clockwise" />} onClick={() => void load()}>Try again</Button>
        </section>
      )}

      {loading && !error && (
        // The loaded table's own header and row markup with the values as
        // skeletons, so every row is its real height and nothing moves on load.
        <div className="table master" aria-busy="true" aria-label="Loading the master list">
          <div className="thead" aria-hidden="true">
            <span><button type="button" disabled tabIndex={-1}>Person <Icon name="caret-down" /></button></span>
            <span>Tier</span><span className="wide-only">Days</span><span>Band</span><span className="wide-only">Vehicle</span><span>T-shirt given</span>
            <span className="cell-r"><button type="button" disabled tabIndex={-1}>Collected</button></span>
          </div>
          <div aria-hidden="true">
            {[15, 12, 17, 11, 14, 16, 13, 12].map((w, index) => (
              <div className="tr master-row-skeleton" key={index}>
                <div><div className="nm"><SkeletonText w={`${w}ch`} /></div><div className="sub"><SkeletonText w={`${w + 14}ch`} /></div></div>
                <div className="hide-s"><span className="tier"><SkeletonText w="5ch" /></span></div>
                <div className="days hide-s wide-only"><SkeletonText w="8ch" /></div>
                <div className="hide-s"><span className="mono"><SkeletonText w="5ch" /></span></div>
                <div className="hide-s wide-only"><span className="mono"><SkeletonText w={index % 3 ? '2ch' : '13ch'} /></span></div>
                <div className="hide-s"><Skeleton shape="pill" /></div>
                <div className="cell-r hide-s"><span className="body-sm"><SkeletonText w={index % 2 ? '2ch' : '14ch'} /></span></div>
                <div className="row2">
                  <span className="tier"><SkeletonText w="5ch" /></span>
                  <Skeleton shape="pill" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && total === 0 && (
        <EmptyState title="No one approved yet" icon={<Icon name="users-three" />}>
          People appear here as soon as they are approved in the response sheet and imported.
        </EmptyState>
      )}

      {showTable && (
        <div className="table master" role="table" aria-label={`Master list. ${countLabel}.`}>
          <div className="thead" role="row">
            <span role="columnheader" aria-sort={sort === 'name' ? 'ascending' : 'none'}>
              <button type="button" onClick={() => setSort(sort === 'name' ? 'default' : 'name')}>Person <Icon name="caret-down" /></button>
            </span>
            <span role="columnheader">Tier</span>
            <span role="columnheader" className="wide-only">Days</span>
            <span role="columnheader">Band</span>
            <span role="columnheader" className="wide-only">Vehicle</span>
            <span role="columnheader">T-shirt given</span>
            <span role="columnheader" className="cell-r" aria-sort={sort === 'collected' ? 'descending' : 'none'}>
              <button type="button" onClick={() => setSort(sort === 'collected' ? 'default' : 'collected')}>Collected</button>
            </span>
          </div>
          <div role="rowgroup">
            {list.slice(0, shown).map((row) => (
              <MasterRowView key={row.id} row={row} theme={theme} onOpen={() => { setSelectedPerson(row); setSheetPerson(row) }} />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && total > 0 && list.length === 0 && (
        <section className="empty">
          <span aria-hidden="true"><Icon name="funnel-simple" /></span>
          <h2 className="display-sm">No one matches</h2>
          <p>{query.trim() ? `No one matches “${query.trim()}”. Try a phone number or band serial, or remove a filter.` : 'Remove a filter to see more people.'}</p>
          <Button onClick={clearEverything}>Clear filters</Button>
        </section>
      )}

      {showTable && list.length > shown && (
        <div className="more"><Button variant="ghost" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</Button></div>
      )}

      <PersonSheet
        person={sheetPerson}
        open={selectedPerson !== null}
        theme={theme}
        onClose={() => setSelectedPerson(null)}
        onCopy={(phone) => {
          navigator.clipboard.writeText(phone).then(
            () => showToast('Phone number copied'),
            () => showToast('Could not copy the number', true),
          )
        }}
      />
      <div className="toasts" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.bad ? ' bad' : ''}`}>
            <span aria-hidden="true"><Icon name={toast.bad ? 'warning-circle' : 'check'} /></span>
            <span>{toast.text}</span>
          </div>
        )}
      </div>

      <style jsx global>{`
        /* app/v2.css still ships .nm, .sub, .empty, .menu (a full-screen nav
           overlay), .zones and .mono as UNSCOPED rules. Everything below is
           (.r10 .master-screen …) so the v2 rule never wins, and it
           re-declares what r8-master.html's <style> and r8/ui.css draw. */
        .r10 .master-screen .master-filterbar { margin-bottom: var(--s-3); }
        .r10 .master-screen .master-chips { margin-bottom: var(--s-6); }
        .r10 .master-screen .btn-export { flex: none; }

        .r10 .master-screen .table.master { --cols: minmax(220px, 2.2fr) minmax(120px, 1fr) 96px 88px minmax(120px, 1fr) 104px minmax(140px, 1.1fr); --c: var(--ink-3); }
        .r10 .master-screen .thead button { display: inline-flex; align-items: center; gap: var(--s-1); min-height: var(--hit); padding: 0; border: 0; background: none; color: inherit; cursor: pointer; font: inherit; letter-spacing: inherit; text-transform: inherit; }
        .r10 .master-screen .tr { cursor: pointer; }
        .r10 .master-screen .tr:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
        .r10 .master-screen .tr .nm { font: 600 14.5px/1.2 var(--f-label); letter-spacing: .02em; text-transform: uppercase; color: var(--ink); }
        .r10 .master-screen .tr .sub { margin-top: 2px; font: 400 var(--t-body-sm)/1.45 var(--f-body); letter-spacing: -.005em; color: var(--ink-3); }
        .r10 .master-screen .tr .muted { color: var(--ink-3); }
        .r10 .master-screen .tier { display: inline-flex; align-items: center; gap: var(--s-2); font: 600 var(--t-label)/1 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); }
        .r10 .master-screen .tier::before { content: ""; width: 10px; height: 10px; border-radius: var(--r-xs); background: var(--c); transition: transform var(--d-quick) var(--e-out); }
        @media (hover: hover) { .r10 .master-screen .tr:hover .tier::before { transform: scale(1.3); } }
        .r10 .master-screen .days { color: var(--ink-2); font-size: var(--t-body-sm); }
        .r10 .master-screen .flagged { color: var(--bad); }
        .r10 .master-screen .mono { font: 500 var(--t-mono)/1.3 var(--f-mono); letter-spacing: .04em; color: var(--ink); }
        .r10 .master-screen .master-row-skeleton { cursor: default; }
        .r10 .master-screen .thead button:disabled { cursor: default; }
        .r10 .master-screen .tr .row2 { display: none; }

        .r10 .master-screen .more { display: flex; justify-content: center; padding: var(--s-6) 0 0; }
        .r10 .master-screen .empty { text-align: left; color: var(--ink-2); }
        .r10 .master-screen .empty > span { font-size: 32px; color: var(--gold); }
        .r10 .master-screen .empty-error > span { color: var(--bad); }

        /* Add filter */
        .r10 .master-screen .add-wrap { position: relative; }
        .r10 .master-screen .master-add-ic { display: inline-flex; font-size: 18px; }
        .r10 .master-screen .menu {
          position: absolute; inset: auto; top: calc(100% + var(--s-2)); right: 0; left: auto; z-index: var(--z-menu);
          display: block; width: auto; min-width: 260px; max-height: 420px; overflow: auto; padding: var(--menu-pad);
          border-radius: var(--menu-r); opacity: 1; pointer-events: auto; transform-origin: top right;
          animation: master-menu-in var(--d-quick) var(--e-out);
        }
        @keyframes master-menu-in { from { opacity: 0; transform: scale(.96) translateY(-4px); } }
        .r10 .master-screen .menu-title { padding: var(--s-2) var(--s-4); color: var(--ink-3); }
        .r10 .master-screen .menu button,
        .r10 .master-screen .menu label {
          display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: var(--hit); padding: 0 var(--s-4);
          border: 0; border-radius: var(--r-pill); background: none; text-align: left; cursor: pointer;
          font: 400 var(--t-body)/1.3 var(--f-body); letter-spacing: normal; text-transform: none; color: var(--ink);
          opacity: 1; transform: none; transition: background-color var(--d-quick) var(--e-out);
        }
        @media (hover: hover) { .r10 .master-screen .menu button:hover, .r10 .master-screen .menu label:hover { background: var(--raised); } }
        .r10 .master-screen .menu button:focus-visible,
        .r10 .master-screen .menu label:has(:focus-visible) { outline: 2px solid var(--go); outline-offset: -2px; }
        .r10 .master-screen .menu .menu-back { color: var(--ink-3); }
        .r10 .master-screen .menu .n { display: inline-flex; margin-left: auto; color: var(--ink-3); font: 500 var(--t-label-sm)/1 var(--f-mono); }
        .r10 .master-screen .swatch { width: 12px; height: 12px; border-radius: var(--r-xs); background: var(--c, var(--ink-3)); flex: none; }

        /* Seven columns need about 1100px. Below that, Days and Vehicle leave
           the table (both are in the person sheet), and below 820px, where five
           no longer fit, it is the stacked phone layout: the columns had been clipped off the card's
           right edge, BMS and Collected with them (Vipin, 2 Oct). */
        @media (max-width: 1100px) {
          .r10 .master-screen .table.master { --cols: minmax(200px, 2fr) minmax(110px, 1fr) 88px 104px minmax(120px, 1fr); }
          .r10 .master-screen .wide-only { display: none; }
        }
        @media (max-width: 820px) {
          .r10 .master-screen .thead { display: none; }
          .r10 .master-screen .tr { grid-template-columns: 1fr; gap: var(--s-1) var(--s-3); padding: var(--s-4) var(--s-5); }
          .r10 .master-screen .tr > .hide-s { display: none; }
          .r10 .master-screen .tr > .row2 { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-3); align-items: center; }
          .r10 .master-screen .tr .tier { font-size: var(--t-label-sm); }
        }
        @media (max-width: 700px) {
          /* r8-master.html anchors the menu to the button's right edge, which
             pushes it off the left of a 390px screen: open it rightwards here. */
          .r10 .master-screen .menu { left: 0; right: auto; transform-origin: top left; max-width: calc(100vw - 32px); }
        }
        @media (prefers-reduced-transparency: reduce) {
          .r10 .master-screen .menu, .r10 .person-sheet { background: var(--surface-solid); backdrop-filter: none; }
        }

        /* Person sheet — r8-master.html */
        .r10 .person-sheet .master-who { display: block; margin-top: var(--s-2); font: 400 var(--t-body)/1.5 var(--f-body); letter-spacing: normal; text-transform: none; color: var(--ink-2); }
        .r10 .person-sheet .sheet-band { display: block; width: 100%; aspect-ratio: 12/1; object-fit: cover; object-position: left center; border-radius: var(--r-sm); opacity: .8; -webkit-mask-image: linear-gradient(90deg, #000 72%, transparent); mask-image: linear-gradient(90deg, #000 72%, transparent); }
        .r10 .person-sheet .sheet-tier { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-4) 0; border-top: 1px solid var(--hair); border-bottom: 1px solid var(--hair); margin: var(--s-5) 0; }
        .r10 .person-sheet .sheet-tier .tier { display: inline-flex; align-items: center; gap: var(--s-2); font: 600 15px/1 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--ink); }
        .r10 .person-sheet .sheet-tier .tier::before { content: ""; width: 10px; height: 10px; border-radius: var(--r-xs); background: var(--c); }
        .r10 .person-sheet .person-zones { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: 0; padding: 0; list-style: none; font-size: var(--t-body-sm); }
        .r10 .person-sheet .person-zones li { display: flex; align-items: center; gap: var(--s-2); }
        .r10 .person-sheet .person-zones i { width: 10px; height: 10px; border-radius: var(--r-xs); background: var(--c); }
        .r10 .person-sheet h3.label { margin: var(--s-6) 0 var(--s-3); color: var(--gold); }
        .r10 .person-sheet .person-dl { display: grid; grid-template-columns: 120px 1fr; gap: var(--s-3) var(--s-4); margin: 0; }
        .r10 .person-sheet .person-dl dt { color: var(--ink-3); }
        .r10 .person-sheet .person-dl dd { margin: 0; }
        .r10 .person-sheet .mono { font: 500 var(--t-mono)/1.3 var(--f-mono); letter-spacing: .04em; }
        .r10 .person-sheet .person-ledger { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--s-3); }
        .r10 .person-sheet .person-ledger li { display: grid; grid-template-columns: 12px 1fr; gap: var(--s-3); }
        .r10 .person-sheet .person-ledger li::before { content: ""; width: 8px; height: 8px; margin-top: 7px; border-radius: 50%; background: var(--c, var(--ink-3)); }
        .r10 .person-sheet .ink-3 { color: var(--ink-3); }
      `}</style>
    </main>
  )
}

function MasterRowView({ row, theme, onOpen }: { row: MasterRow; theme: Theme; onOpen: () => void }) {
  const type = row.typeCode ? tier(row.typeCode) : null
  const colour = row.typeCode ? tierColour(row.typeCode, theme) : 'var(--ink-3)'
  const state = masterStatusOf(row)
  const band = row.status === 'voided'
    ? <span className="flagged label-sm">Voided</span>
    : row.status === 'rejected'
      ? <span className="flagged label-sm">Rejected</span>
      : row.bandSerial
        ? <span className="mono">{row.bandSerial.startsWith('#') ? row.bandSerial : `#${row.bandSerial}`}</span>
        : row.collectedAt
          ? <span className="muted">Issued</span>
          : <span className="muted">–</span>
  const bms = row.status !== 'approved' || !row.tshirtSize
    ? <span className="muted">–</span>
    : <span className={`pill ${row.tshirtGivenAt ? 'pill-ok' : 'pill-wait'}`}>{row.tshirtGivenAt ? 'Given' : 'Not given'}</span>
  const tierLabel = type?.label ?? '–'
  return (
    <div
      className="tr"
      role="row"
      tabIndex={0}
      style={{ ['--c' as string]: colour }}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === 'Enter') onOpen() }}
    >
      <div role="cell"><div className="nm">{row.fullName}</div><div className="sub">{row.orgName} · {row.role}{row.tshirtSize ? ` · T-shirt ${row.tshirtSize}${row.tshirtGivenAt ? ' given' : ' not given'}` : ''}</div></div>
      <div role="cell" className="hide-s"><span className="tier">{tierLabel}</span></div>
      <div role="cell" className="days hide-s wide-only">{row.dayValidity ? MASTER_DAY_LABELS[row.dayValidity] : <span className="muted">–</span>}</div>
      <div role="cell" className="hide-s">{band}</div>
      <div role="cell" className="hide-s wide-only">
        {row.vehicleReg
          ? <span className="mono">{row.vehicleReg}</span>
          : <span className="muted">–</span>}
      </div>
      <div role="cell" className="hide-s">{bms}</div>
      <div role="cell" className="cell-r hide-s">{state === 'collected' ? <span className="body-sm">{formatMasterCollected(row)}</span> : <span className="muted">–</span>}</div>
      <div className="row2">
        <span className="tier">{tierLabel}</span>
        {row.status === 'approved' && bms}
        {state === 'collected'
          ? <span className="body-sm ink-2">Collected {row.collectedAt ? formatLedgerTime(row.collectedAt) : ''}</span>
          : state === 'not_collected'
            ? <span className="body-sm ink-3">Not collected</span>
            : band}
      </div>
    </div>
  )
}

function PersonSheet({ person: p, open, theme, onClose, onCopy }: { person: MasterRow | null; open: boolean; theme: Theme; onClose: () => void; onCopy: (phone: string) => void }) {
  const type = p?.typeCode ? tier(p.typeCode) : null
  const colour = p?.typeCode ? tierColour(p.typeCode, theme) : 'var(--ink-3)'
  const state = p ? masterStatusOf(p) : 'other'
  const held = p?.typeCode ? zoneStrip(p.typeCode).filter((z) => z.held) : []
  const zoneColour = (code: string) => `var(--zone-${ZONES.find((z) => z.code === code)?.mapColour ?? 'green'})`
  return (
    <Sheet
      open={open}
      onClose={onClose}
      className="person-sheet"
      title={p ? <>{p.fullName}<span className="master-who">{p.orgName} · {p.role}{p.tshirtSize ? ` · T-shirt ${p.tshirtSize}${p.tshirtGivenAt ? ' given' : ' not given'}` : ''}</span></> : 'Person details'}
      footer={p && (
        <>
          <a className="btn" href={`/desk/passes?person=${encodeURIComponent(p.id)}`}>Open pass<span className="ic" aria-hidden="true"><Icon name="ticket" /></span></a>
          <Button variant="ghost" onClick={() => onCopy(p.phone)}><Icon name="copy" /> Copy phone</Button>
        </>
      )}
    >
      {p && (
        <>
          {type && p.typeCode && <img className="sheet-band" src={bandArtSrc(p.typeCode)} alt={`${type.label} band`} />}
          <div className="sheet-tier" style={{ ['--c' as string]: colour }}>
            <span className="tier">{type?.label ?? 'Not assigned'}</span>
            <span className="ink-2">{p.dayValidity ? MASTER_DAY_LABELS[p.dayValidity] : ''}</span>
          </div>
          {p.typeCode && (
            <ul className="person-zones">
              {p.typeCode === 'aaa'
                ? <li>All zones</li>
                : held.map((z) => <li key={z.zone}><i style={{ ['--c' as string]: zoneColour(z.zone) }} />{z.label}</li>)}
            </ul>
          )}
          <h3 className="label">Details</h3>
          <dl className="person-dl body-sm">
            <dt>Phone</dt><dd className="mono">{p.phone}</dd>
            <dt>Pass</dt><dd className="mono">{p.passRef ?? '–'}</dd>
            <dt>Vehicle</dt>
            <dd>{p.vehicleReg ? <><span className="mono">{p.vehicleReg}</span>{p.stickerNo && ` · sticker ${p.stickerNo}`}</> : 'None'}</dd>
            <dt>BMS</dt>
            <dd>{p.status !== 'approved' ? '–' : <span className={`pill ${p.inBms ? 'pill-ok' : 'pill-wait'}`}>{p.inBms ? 'In BMS' : 'Not in BMS'}</span>}</dd>
          </dl>
          <h3 className="label">History</h3>
          <ul className="person-ledger body-sm">
            {state === 'collected' && (
              <li style={{ ['--c' as string]: 'var(--go)' }}><span><b>{p.bandSerial ? `Band ${p.bandSerial} issued` : 'Band issued, serial not typed'}</b><br /><span className="ink-3">{formatMasterCollected(p)}</span></span></li>
            )}
            {p.status === 'voided' && (
              <li style={{ ['--c' as string]: 'var(--bad)' }}><span><b>Pass voided</b></span></li>
            )}
            {p.status === 'rejected' && (
              <li style={{ ['--c' as string]: 'var(--bad)' }}><span><b>Rejected</b>{p.decidedAt && <><br /><span className="ink-3">{formatLedgerTime(p.decidedAt)}</span></>}</span></li>
            )}
            {(p.status === 'approved' || p.status === 'voided') && type && (
              <li style={{ ['--c' as string]: 'var(--gold)' }}><span><b>Approved as {type.label}</b>{p.decidedAt && <><br /><span className="ink-3">{formatLedgerTime(p.decidedAt)} · imported from the response sheet</span></>}</span></li>
            )}
          </ul>
        </>
      )}
    </Sheet>
  )
}
