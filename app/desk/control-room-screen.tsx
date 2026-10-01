'use client'

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { dashboardResponseSchema, type DashboardResponse } from '@/lib/schemas/dashboard'
import { tier, tierColour, zoneStrip, TIERS, ZONES, ZONE_MAP_HEX } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { Button, Card, CountDot, EmptyState, Skeleton, SkeletonText } from '@/components/r10'
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

/**
 * 0 to 1 for the timeline's fill line. The four dots sit at even steps along
 * the line (a quarter of its width apart), not at their calendar distances, so
 * the fill moves through each gap between two milestones in proportion to the
 * days within that gap. A calendar-wide fraction put the fill past a dot whose
 * date had not come (1 Oct showed the line beyond Build).
 */
const TIMELINE_DOTS = [LINKS_OUT_DATE, GATE_LIVE_DATE, BUILD_START_DATE, SHOW_DATE] as const

function timelineProgress(now: Date): number {
  if (now >= SHOW_DATE) return 1
  const step = 1 / TIMELINE_DOTS.length
  const gaps = TIMELINE_DOTS.slice(1).map((to, i) => ({ from: TIMELINE_DOTS[i]!, to }))
  const gap = gaps.findIndex(({ to }) => now < to)
  const current = gaps[gap]
  if (!current) return 0
  const within = (now.getTime() - current.from.getTime()) / (current.to.getTime() - current.from.getTime())
  return (gap + Math.min(1, Math.max(0, within))) * step
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
  value: number | null
  detail: ReactNode
  width: number
  numberColour?: string
  meterColour?: string
  href: string
}) {
  return (
    <Card href={href} spotlight className={styles['tile'] ?? ''}>
      <span className="card-label body-sm">{label} <span className="arrow"><Icon name="arrow-up-right" /></span></span>
      <span className="number" style={numberColour ? { color: numberColour } : undefined}>{value ?? <SkeletonText w="2.4ch" />}</span>
      <p className={styles['tileSub']}>{detail}</p>
      <div className="meter" aria-hidden="true"><i style={{ '--w': width, ...(meterColour ? { '--c': meterColour } : {}) } as CSSProperties} /></div>
    </Card>
  )
}

/**
 * `dash` is null while /api/desk/dashboard is in flight. The screen still
 * renders its real cards, poster, timeline and band shelf, with only the
 * values as <SkeletonText>, so nothing moves when the numbers land.
 *
 * `now` is null on the server and through hydration: this screen is now
 * server-rendered in its loading state, and the server's clock (UTC) would
 * put the wrong day on the desk's IST labels. Until the client's clock is
 * read, the date-dependent text is a skeleton too.
 */
function ControlRoomR10({ dash, now, theme }: { dash: DashboardResponse | null; now: Date | null; theme: 'dark' | 'light' }) {
  const daysToShow = now ? daysBetween(now, SHOW_DATE) : null
  const timelineNowIndex = now ? TIMELINE.findIndex((t) => now < t.doneAt) : null
  const issuedRatio = dash ? ratio(dash.bandsIssued, dash.approvedTotal) : 0
  const issuedPct = Math.round(issuedRatio * 100)
  const vehicles = dash ? dash.stickersActive + dash.stickersPending : null
  const behind = dash
    ? dash.orgs
      .map((org) => ({ ...org, remaining: Math.max(org.quota - org.used, 0) }))
      .sort((a, b) => b.remaining - a.remaining)
      .slice(0, 3)
    : null
  // Every boa_acc_type row comes back, in sort_order (the dashboard RPC's
  // `types` aggregate) — TIERS is that order, so the shelf is laid out
  // before the counts arrive.
  const types = dash ? dash.types : TIERS.map((t) => ({ code: t.code, count: null, note: null }))

  return (
    <main id="main-content" tabIndex={-1} className={styles['controlRoom']} aria-busy={dash ? undefined : true}>
      <h1 className="sr-only">Control room</h1>
      {dash ? <h2 className="sr-only">{dash.submittedOrgs} companies on site</h2> : <p className="sr-only" role="status">Loading the control room</p>}

      <section className={styles['hero']} aria-label="Collection">
        <div className={styles['heroClip']}>
          <div className={styles['heroArt']} role="img" aria-label="Bangalore Open Air festival poster" />
          <div className={styles['heroInner']}>
            <div className={`glass ${styles['heroPlate']}`}>
              <div className={`${styles['heroKicker']} body-sm`}>
                <span className={styles['liveDot']} aria-hidden="true" />
                {now ? heroKickerText(now) : <SkeletonText w="18ch" />}
              </div>
              <div className={styles['heroNum']}>
                <span className={styles['heroBig']}>{dash ? dash.bandsNotCollected : <SkeletonText w="2.6ch" />}</span>
                <span className={styles['heroUnit']}>still to collect a band</span>
              </div>
              <p className={styles['heroSub']}>
                {dash ? dash.bandsIssued : <SkeletonText w="3ch" />} of {dash ? dash.approvedTotal : <SkeletonText w="3ch" />} bands handed over.
                {daysToShow === null
                  ? <> The show is in <b><SkeletonText w="2ch" /> days</b>, and everyone collects in person.</>
                  : daysToShow > 0 && <> The show is in <b>{daysToShow} day{daysToShow === 1 ? '' : 's'}</b>, and everyone collects in person.</>}
              </p>
              <div className={styles['heroActions']}>
                <Link href="/desk/master?status=not_collected" className="btn btn-primary">
                  See who hasn&apos;t collected<span className="ic"><Icon name="arrow-right" /></span>
                </Link>
              </div>
            </div>
            <div className={`glass ${styles['ringWrap']}`} aria-label={dash ? `Bands issued: ${issuedPct} percent` : undefined}>
              <svg className={styles['ring']} viewBox="0 0 188 188" aria-hidden="true">
                <circle className={styles['ringTrack']} cx="94" cy="94" r="80" />
                <circle className={styles['ringValue']} cx="94" cy="94" r="80" transform="rotate(-90 94 94)" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - issuedRatio }} />
              </svg>
              <div className={styles['ringLabel']}>
                <span className="number">{dash ? `${issuedPct}%` : <SkeletonText w="2.2ch" />}</span>
                <span className="label-sm ink-2">bands issued</span>
              </div>
              <span className={`glass label-sm ${styles['countdown']}`}><Icon name="clock" />{daysToShow === null ? <SkeletonText w="12ch" /> : showCountdown(daysToShow)}</span>
            </div>
          </div>
        </div>
      </section>

      <div className={styles['bento']}>
        <div className={styles['bLeft']}>
          <Card className={styles['week'] ?? ''}>
            <div className="card-label"><h2 className="label-sm gold" style={{ margin: 0 }}>The week</h2><span className="body-sm ink-3">{now ? formatWeekdayDate(now) : <SkeletonText w="9ch" />}</span></div>
            {/* Keyed so the fill's grow animation plays once the clock is read. */}
            <ol key={now ? 'dated' : 'undated'} className={styles['timeline']} style={{ '--p': now ? timelineProgress(now) : 0 } as CSSProperties}>
              {TIMELINE.map((item, i) => {
                const status = timelineNowIndex === null ? 'later' : i < timelineNowIndex || timelineNowIndex === -1 ? 'done' : i === timelineNowIndex ? 'now' : 'later'
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
            value={dash ? dash.bmsPending : null}
            detail="approved, still to be entered by hand"
            width={dash ? ratio(dash.bmsAdded, dash.approvedTotal) : 0}
            numberColour="var(--gold)"
            meterColour="var(--gold)"
            href="/desk/master?in_bms=false"
          />
          <StatTile
            label="Vehicle stickers"
            value={dash ? dash.stickersActive : null}
            detail={<>of {vehicles ?? <SkeletonText w="2ch" />} vehicles have a sticker</>}
            width={dash && vehicles !== null ? ratio(dash.stickersActive, vehicles) : 0}
            href="/desk/master?vehicle=pending"
          />
          <StatTile
            label="AAA named list"
            value={dash ? dash.aaaNominatedApproved : null}
            detail={<>approved by Salman · {dash ? dash.aaaStamped : <SkeletonText w="2ch" />} collected</>}
            width={dash ? ratio(dash.aaaStamped, dash.aaaNominatedApproved) : 0}
            meterColour={tierColour('aaa', theme)}
            href="/desk/master?tier=aaa"
          />

          <Card className={styles['behind'] ?? ''}>
            <div className="card-label">
              <h2 className="label-sm gold" style={{ margin: 0 }}>Furthest behind</h2>
              <Link href="/desk/orgs" className="btn-link body-sm" style={{ minHeight: 0 }}>All {dash ? dash.orgs.length : <SkeletonText w="2ch" />} organisations <Icon name="arrow-right" /></Link>
            </div>
            <div className={styles['behindList']}>
              {behind ? behind.map((org) => (
                <Link key={org.id} href={`/desk/master?org=${encodeURIComponent(org.id)}&status=not_collected`} className={styles['behindLink']}>
                  <span className={styles['behindN']}>{org.remaining}</span>
                  <span className={styles['nm']}>{org.name}</span>
                  <span className="body-sm ink-3">{org.used} of {org.quota} collected</span>
                  <div className="meter" style={{ marginTop: 'var(--s-2)' }} aria-hidden="true"><i style={{ '--w': ratio(org.used, org.quota), '--c': 'var(--gold)' } as CSSProperties} /></div>
                </Link>
              )) : [18, 14, 16].map((w, i) => (
                <div key={i} className={styles['behindLink']} aria-hidden="true">
                  <span className={styles['behindN']}><SkeletonText w="2ch" /></span>
                  <span className={styles['nm']}><SkeletonText w={`${w}ch`} /></span>
                  <span className="body-sm ink-3"><SkeletonText w="13ch" /></span>
                  <div className="meter" style={{ marginTop: 'var(--s-2)' }}><i style={{ '--w': 0 } as CSSProperties} /></div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card className={styles['feed'] ?? ''}>
          <div className="card-label">
            <h2 className="label-sm gold" style={{ margin: 0 }}>At the gates today</h2>
            <Link href="/desk/master?status=collected" className="btn-link body-sm" style={{ minHeight: 0 }}>All <Icon name="arrow-right" /></Link>
          </div>
          {/* The card stretches to the left column's height, so however many
              rows land here, nothing around it moves. */}
          {!dash ? (
            <ul className={styles['feedList']} aria-hidden="true">
              {[15, 12, 17, 13].map((w, i) => (
                <li key={i} className={styles['feedItem']} style={{ animation: 'none' }}>
                  <Skeleton shape="dot" />
                  <div>
                    <div className={styles['nm']}><SkeletonText w={`${w}ch`} /></div>
                    <p className={styles['feedSub']}><SkeletonText w="24ch" /></p>
                  </div>
                  <span className={styles['feedTime']}><SkeletonText w="5ch" /></span>
                </li>
              ))}
            </ul>
          ) : dash.gateCounts === null || dash.latestIssues === null ? (
            <p className={styles['feedSub']}>Today&apos;s gate activity isn&apos;t available right now.</p>
          ) : dash.latestIssues.length === 0 ? (
            <p className={styles['feedSub']}>No bands or stickers issued yet today.</p>
          ) : (
            <>
              <div className={styles['gates']}>
                {dash.gateCounts.map((gate) => (
                  <span key={gate.gateLabel} className="chip">
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
          {types.map((item) => {
            const currentTier = tier(item.code)
            const colour = tierColour(item.code, theme)
            return (
              <Card key={item.code} href={`/desk/master?tier=${item.code}`} className={styles['bandCard'] ?? ''}>
                <div className={styles['bandArt']}><img src={`/assets/bands/${item.code}.webp`} alt={`${currentTier.label} band`} /></div>
                <div className={styles['bandBody']}>
                  <div className={styles['bandRow']}>
                    <h3 className="display-sm">{currentTier.label}</h3>
                    <span><span className={styles['bandIssued']}>{item.count ?? <SkeletonText w="2ch" />}</span> <span className={styles['bandOf']}>/ {currentTier.printQty ?? 'TBC'}</span></span>
                  </div>
                  <div className="meter" style={{ margin: 0 }} aria-label={item.count === null ? undefined : `${item.count} issued`}><i style={{ '--w': item.count !== null && currentTier.printQty ? ratio(item.count, currentTier.printQty) : 0, '--c': colour } as CSSProperties} /></div>
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

const subscribeNever = () => () => {}

export function ControlRoomScreen() {
  const theme = useDomTheme()
  const [dash, setDash] = useState<DashboardResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const router = useRouter()
  // The client's clock, and only after hydration (see ControlRoomR10): the
  // server snapshot is false, so the server render and hydration agree.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false)
  const [clientNow] = useState(() => new Date())
  const now = hydrated ? clientNow : null

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
  return <ControlRoomR10 dash={dash} now={now} theme={theme} />
}
