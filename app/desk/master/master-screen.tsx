'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { masterResponseSchema, type MasterRow } from '@/lib/schemas/master'
import { tier, tierColour } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { formatMasterBand, formatMasterCollected } from '@/lib/format'
import { Icon } from '@/components/icon'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { EmptyState, InlineError } from '@/components/states'

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

  async function load(nextQuery: string, nextBmsFilter: 'all' | 'true' | 'false') {
    setLoading(true)
    try {
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
              <InlineError message={error} onRetry={() => void load(query, bmsFilter)} />
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
            <EmptyState message={query || bmsFilter !== 'all' ? 'Nobody matches that. Try a phone number or a band serial.' : 'Nobody accredited yet. This list fills in once people are approved.'} />
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
