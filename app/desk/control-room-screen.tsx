'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { dashboardResponseSchema, type DashboardResponse } from '@/lib/schemas/dashboard'
import { tier, tierColour, zoneStrip, ZONES, ZONE_MAP_HEX } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { Button, Card, CountDot, EmptyState, Skeleton } from '@/components/r10'
import { copyForError, ERROR_COPY } from '@/lib/error-copy'
import { loginHref } from '@/gate/session'
import styles from './control-room/control-room-screen.module.css'

/**
 * The r10 Control room. Every number is parsed from /api/desk/dashboard;
 * artwork and labels are presentation data, while tier counts and notes stay
 * in the dashboard response.
 */

// ACC-122: shared with every other desk screen via lib/error-copy.ts; only
// this screen's `not_authorized` wording differs from the default, because
// it gates viewing the Control room rather than an action inside it.
const CONTROL_ROOM_ERROR_OVERRIDES = {
  not_authorized: 'Only an active operator can view the Control room.',
}

const LINKS_OUT_DATE = new Date('2026-09-20T00:00:00')
const GATE_LIVE_DATE = new Date('2026-10-04T00:00:00')
const BUILD_START_DATE = new Date('2026-10-05T00:00:00')
const BUILD_END_DATE = new Date('2026-10-09T00:00:00')
const SHOW_DATE = new Date('2026-10-10T00:00:00')

/**
 * "The week" card (r8-control-room.html's `.tl`): four milestones on one
 * continuous line, not four independent segments. `doneAt` is when each
 * phase is considered finished — Build's is its last day, not its first,
 * so the card doesn't call a five-day build "done" on day one.
 */
const TIMELINE = [
  { when: '20 Sep', label: 'Links out', doneAt: LINKS_OUT_DATE },
  { when: '4 Oct', label: 'Gate live', doneAt: GATE_LIVE_DATE },
  { when: '5 to 9 Oct', label: 'Build', doneAt: BUILD_END_DATE },
  { when: '10 Oct', label: 'Show', doneAt: SHOW_DATE },
] as const

/** 0 to 1 across the whole links-out-to-show span, for the timeline's fill line. */
function timelineProgress(now: Date): number {
  const total = SHOW_DATE.getTime() - LINKS_OUT_DATE.getTime()
  const elapsed = now.getTime() - LINKS_OUT_DATE.getTime()
  return Math.min(1, Math.max(0, elapsed / total))
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mon 6 Oct" — the live current date, not a hardcoded demo label. */
function formatWeekdayDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`
}

function formatDayMonth(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/**
 * The hero-kicker line (r8-control-room.html): "Build week, day 2. The gate
 * has been live since 4 Oct." Computed from the fixed dates in CLAUDE.md
 * against the real clock, not written in for one week of the calendar.
 */
function heroKickerText(now: Date): string {
  const sinceGate = `The gate has been live since ${formatDayMonth(GATE_LIVE_DATE)}.`
  if (now < GATE_LIVE_DATE) {
    return `${daysBetween(now, GATE_LIVE_DATE)} day${daysBetween(now, GATE_LIVE_DATE) === 1 ? '' : 's'} to gate live.`
  }
  if (now < BUILD_START_DATE) {
    const days = daysBetween(now, BUILD_START_DATE)
    return `Gate live. Build starts in ${days} day${days === 1 ? '' : 's'}.`
  }
  if (now <= BUILD_END_DATE) {
    const day = daysBetween(BUILD_START_DATE, now) + 1
    return `Build week, day ${day}. ${sinceGate}`
  }
  if (now < SHOW_DATE) {
    const days = daysBetween(now, SHOW_DATE)
    return `Show in ${days} day${days === 1 ? '' : 's'}. ${sinceGate}`
  }
  return `Show day. ${sinceGate}`
}

function ratio(value: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
}

/** Asia/Kolkata wall-clock 'HH:MM' — the same convention as lib/format.ts. */
function formatGateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

/** The ring's countdown pill (r8-control-room.html `.countdown`): always to the show. */
function showCountdown(days: number): string {
  if (days > 1) return `Show in ${days} days`
  if (days === 1) return 'Show tomorrow'
  if (days === 0) return 'Show today'
  return 'Show over'
}

/** One `card spot tile b-stat` from the mockup: body-sm label with a trailing arrow, number, sub, meter. */
function StatTile({ label, value, detail, width, numberColour, meterColour, href }: {
  label: string
  value: number
  detail: ReactNode
  width: number
  numberColour?: string
  meterColour?: string
  href: string
}) {
  return (
    <Card href={href} spotlight className={styles['tile'] ?? ''}>
      <span className="card-label body-sm">{label} <span className="arrow"><Icon name="arrow-up-right" /></span></span>
      <span className="number" style={numberColour ? { color: numberColour } : undefined}>{value}</span>
      <p className={styles['tileSub']}>{detail}</p>
      <div className="meter" aria-hidden="true"><i style={{ '--w': width, ...(meterColour ? { '--c': meterColour } : {}) } as CSSProperties} /></div>
    </Card>
  )
}

function ControlRoomR10({ dash, theme }: { dash: DashboardResponse; theme: 'dark' | 'light' }) {
  const now = new Date()
  const daysToShow = daysBetween(now, SHOW_DATE)
  const timelineNowIndex = TIMELINE.findIndex((t) => now < t.doneAt)
  const issuedRatio = ratio(dash.bandsIssued, dash.approvedTotal)
  const issuedPct = Math.round(issuedRatio * 100)
  const vehicles = dash.stickersActive + dash.stickersPending
  const behind = dash.orgs
    .map((org) => ({ ...org, remaining: Math.max(org.quota - org.used, 0) }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3)

  return (
    <main id="main-content" tabIndex={-1} className={styles['controlRoom']}>
      <h1 className="sr-only">Control room</h1>
      <h2 className="sr-only">{dash.submittedOrgs} companies on site</h2>

      <section className={styles['hero']} aria-label="Collection">
        <div className={styles['heroClip']}>
          <div className={styles['heroArt']} role="img" aria-label="Bangalore Open Air festival poster" />
          <div className={styles['heroInner']}>
            <div className={`glass ${styles['heroPlate']}`}>
              <div className={`${styles['heroKicker']} body-sm`}>
                <span className={styles['liveDot']} aria-hidden="true" />
                {heroKickerText(now)}
              </div>
              <div className={styles['heroNum']}>
                <span className={styles['heroBig']}>{dash.bandsNotCollected}</span>
                <span className={styles['heroUnit']}>still to collect a band</span>
              </div>
              <p className={styles['heroSub']}>
                {dash.bandsIssued} of {dash.approvedTotal} bands handed over.
                {daysToShow > 0 && <> The show is in <b>{daysToShow} day{daysToShow === 1 ? '' : 's'}</b>, and everyone collects in person.</>}
              </p>
              <div className={styles['heroActions']}>
                <Link href="/desk/master?status=not_collected" className="btn btn-primary">
                  See who hasn&apos;t collected<span className="ic"><Icon name="arrow-right" /></span>
                </Link>
              </div>
            </div>
            <div className={`glass ${styles['ringWrap']}`} aria-label={`Bands issued: ${issuedPct} percent`}>
              <svg className={styles['ring']} viewBox="0 0 188 188" aria-hidden="true">
                <circle className={styles['ringTrack']} cx="94" cy="94" r="80" />
                <circle className={styles['ringValue']} cx="94" cy="94" r="80" transform="rotate(-90 94 94)" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - issuedRatio }} />
              </svg>
              <div className={styles['ringLabel']}>
                <span className="number">{issuedPct}%</span>
                <span className="label-sm ink-2">bands issued</span>
              </div>
              <span className={`glass label-sm ${styles['countdown']}`}><Icon name="clock" />{showCountdown(daysToShow)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className={styles['bento']}>
        <div className={styles['bLeft']}>
          <Card className={styles['week'] ?? ''}>
            <div className="card-label"><h2 className="label-sm gold" style={{ margin: 0 }}>The week</h2><span className="body-sm ink-3">{formatWeekdayDate(now)}</span></div>
            <ol className={styles['timeline']} style={{ '--p': timelineProgress(now) } as CSSProperties}>
              {TIMELINE.map((item, i) => {
                const status = i < timelineNowIndex || timelineNowIndex === -1 ? 'done' : i === timelineNowIndex ? 'now' : 'later'
                return (
                  <li key={item.label} className={styles[status]}>
                    <div className={styles['when']}>{item.when}</div>
                    <div className={styles['what']}>{item.label}</div>
                  </li>
                )
              })}
            </ol>
          </Card>

          <StatTile
            label="Not in BookMyShow"
            value={dash.bmsPending}
            detail="approved, still to be entered by hand"
            width={ratio(dash.bmsAdded, dash.approvedTotal)}
            numberColour="var(--gold)"
            meterColour="var(--gold)"
            href="/desk/master?in_bms=false"
          />
          <StatTile
            label="Vehicle stickers"
            value={dash.stickersActive}
            detail={`of ${vehicles} vehicles have a sticker`}
            width={ratio(dash.stickersActive, vehicles)}
            href="/desk/master?vehicle=pending"
          />
          <StatTile
            label="AAA named list"
            value={dash.aaaNominatedApproved}
            detail={`approved by Salman · ${dash.aaaStamped} collected`}
            width={ratio(dash.aaaStamped, dash.aaaNominatedApproved)}
            meterColour={tierColour('aaa', theme)}
            href="/desk/master?tier=aaa"
          />

          <Card className={styles['behind'] ?? ''}>
            <div className="card-label">
              <h2 className="label-sm gold" style={{ margin: 0 }}>Furthest behind</h2>
              <Link href="/desk/orgs" className="btn-link body-sm" style={{ minHeight: 0 }}>All {dash.orgs.length} organisations <Icon name="arrow-right" /></Link>
            </div>
            <div className={styles['behindList']}>
              {behind.map((org) => (
                <Link key={org.id} href={`/desk/master?org=${encodeURIComponent(org.id)}&status=not_collected`} className={styles['behindLink']}>
                  <span className={styles['behindN']}>{org.remaining}</span>
                  <span className={styles['nm']}>{org.name}</span>
                  <span className="body-sm ink-3">{org.used} of {org.quota} collected</span>
                  <div className="meter" style={{ marginTop: 'var(--s-2)' }} aria-hidden="true"><i style={{ '--w': ratio(org.used, org.quota), '--c': 'var(--gold)' } as CSSProperties} /></div>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        <Card className={styles['feed'] ?? ''}>
          <div className="card-label">
            <h2 className="label-sm gold" style={{ margin: 0 }}>At the gates today</h2>
            <Link href="/desk/master?status=collected" className="btn-link body-sm" style={{ minHeight: 0 }}>All <Icon name="arrow-right" /></Link>
          </div>
          {dash.gateCounts === null || dash.latestIssues === null ? (
            <p className={styles['feedSub']}>Today&apos;s gate activity isn&apos;t available right now.</p>
          ) : dash.latestIssues.length === 0 ? (
            <p className={styles['feedSub']}>No bands or stickers issued yet today.</p>
          ) : (
            <>
              <div className={styles['gates']}>
                {dash.gateCounts.map((gate) => (
                  <span key={gate.gateLabel} className="chip" style={{ paddingRight: 'var(--s-1)' }}>
                    <b>{gate.gateLabel}</b>
                    <CountDot>{gate.count}</CountDot>
                  </span>
                ))}
              </div>
              <ul className={styles['feedList']}>
                {dash.latestIssues.map((issue, i) => {
                  const issueTier = issue.typeCode ? tier(issue.typeCode) : null
                  const serial = issue.kind === 'wristband'
                    ? `band ${issue.bandSerial ?? 'not typed'}`
                    : `sticker ${issue.stickerNo ?? 'not typed'}`
                  return (
                    <li key={issue.checkinId} className={styles['feedItem']} style={{ '--i': i } as CSSProperties}>
                      <i className={styles['feedDot']} style={{ '--c': issueTier ? tierColour(issueTier.code, theme) : 'var(--ink-3)' } as CSSProperties} aria-hidden="true" />
                      <div>
                        <div className={styles['nm']}>{issue.fullName}</div>
                        <p className={styles['feedSub']}>{issueTier?.label ?? 'Unlisted tier'} &middot; {serial} &middot; {issue.gateLabel}</p>
                      </div>
                      <time className={styles['feedTime']}>{formatGateTime(issue.occurredAt)}</time>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Card>
      </div>

      <section className="section" aria-labelledby="bands-title">
        <div className="section-head"><h2 id="bands-title" className="label-sm">Bands</h2><span className="body-sm ink-3">Issued of printed</span></div>
        <div className={styles['shelf']}>
          {dash.types.map((item) => {
            const currentTier = tier(item.code)
            const colour = tierColour(item.code, theme)
            return (
              <Card key={item.code} href={`/desk/master?tier=${item.code}`} className={styles['bandCard'] ?? ''}>
                <div className={styles['bandArt']}><img src={`/assets/bands/${item.code}.webp`} alt={`${currentTier.label} band`} /></div>
                <div className={styles['bandBody']}>
                  <div className={styles['bandRow']}>
                    <h3 className="display-sm">{currentTier.label}</h3>
                    <span><span className={styles['bandIssued']}>{item.count}</span> <span className={styles['bandOf']}>/ {currentTier.printQty ?? 'TBC'}</span></span>
                  </div>
                  <div className="meter" style={{ margin: 0 }} aria-label={`${item.count} issued`}><i style={{ '--w': currentTier.printQty ? ratio(item.count, currentTier.printQty) : 0, '--c': colour } as CSSProperties} /></div>
                  {item.note && <p className={styles['feedSub']}>{item.note}</p>}
                  {/* Held zones only, dot + name, like the pass ticket and the mockup's zonesHtml(). */}
                  <ul className={styles['zones']}>
                    {item.code === 'aaa' ? <li>All zones</li> : zoneStrip(item.code).filter((zone) => zone.held).map((zone) => {
                      const mapColour = ZONES.find((z) => z.code === zone.zone)!.mapColour
                      return (
                        <li key={zone.zone}>
                          <i style={{ background: ZONE_MAP_HEX[mapColour] }} aria-hidden="true" />
                          {zone.label}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </Card>
            )
          })}
        </div>
      </section>
    </main>
  )
}

export function ControlRoomScreen() {
  const theme = useDomTheme()
  const [dash, setDash] = useState<DashboardResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/desk/dashboard')
        if (cancelled) return
        if (response.status === 401) { router.replace(loginHref(window.location.pathname + window.location.search)); return }
        if (!response.ok) {
          setLoadError(copyForError(await response.json().catch(() => null), CONTROL_ROOM_ERROR_OVERRIDES))
          return
        }
        // Zod at the boundary: a payload that drifts from the route's contract
        // is an error state, never a half-rendered screen.
        const parsed = dashboardResponseSchema.safeParse(await response.json())
        if (cancelled) return
        if (!parsed.success) { setLoadError(ERROR_COPY.internal); return }
        setDash(parsed.data)
        setLoadError(null)
      } catch {
        // A thrown fetch (network down, aborted) must land here too — never
        // leave `dash` null with nothing telling the operator why.
        if (!cancelled) setLoadError(ERROR_COPY.internal)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [router, reloadKey])

  if (loadError) {
    return (
      <main id="main-content" tabIndex={-1}>
        <EmptyState title={loadError} error className={styles['error'] ?? ''}>
          <Button variant="link" onClick={() => { setLoadError(null); setReloadKey((k) => k + 1) }}>Retry</Button>
        </EmptyState>
      </main>
    )
  }
  if (!dash) return (
    <main id="main-content" tabIndex={-1}>
      <div role="status" aria-label="Loading control room">
        <Card as="div" className={styles['loading'] ?? ''}><Skeleton shape="hero" /></Card>
      </div>
    </main>
  )
  return <ControlRoomR10 dash={dash} theme={theme} />
}
