'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { dashboardResponseSchema, type DashboardResponse } from '@/lib/schemas/dashboard'
import { tier, tierColour } from '@/lib/design'
import { zoneChips } from '@/lib/desk-tiers'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { Button, Card, CountDot, EmptyState, Skeleton, StatusPill } from '@/components/r10'
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

/**
 * The dates that do not move (CLAUDE.md). Bhoopesh and Salman already know
 * which bands exist and how approval works — what they don't have at a
 * glance is how many days are left, so the hero reports that instead of
 * re-explaining the rules every time the screen loads.
 */
const MILESTONES = [
  { label: 'links-out', date: '2026-09-20' },
  { label: 'gate live', date: '2026-10-04' },
  { label: 'build starts', date: '2026-10-05' },
  { label: 'build ends', date: '2026-10-09' },
  { label: 'show', date: '2026-10-10' },
] as const

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

function nextMilestone(now: Date): { label: string; days: number } | null {
  for (const m of MILESTONES) {
    const days = Math.ceil((new Date(`${m.date}T00:00:00`).getTime() - now.getTime()) / 86_400_000)
    if (days >= 0) return { label: m.label, days }
  }
  return null
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

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh']

function bandsHeading(count: number): string {
  const word = COUNT_WORDS[count]
  const ordinal = ORDINAL_WORDS[count + 1]
  return word && ordinal ? `${word} band${count === 1 ? '' : 's'}. No ${ordinal}.` : `${count} bands.`
}

function ratio(value: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, value / total)) : 0
}

/** Asia/Kolkata wall-clock 'HH:MM' — the same convention as lib/format.ts. */
function formatGateTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

function StatTile({ label, value, detail, width, colour }: {
  label: string
  value: number
  detail: string
  width: number
  colour?: string
}) {
  return (
    <Card className={styles['stat'] ?? ''}>
      <span className="label-sm">{label}</span>
      <span className={`number ${styles['tileNumber']}`} style={colour ? { color: colour } : undefined}>{value}</span>
      <p className={styles['tileDetail']}>{detail}</p>
      <div className="meter" aria-hidden="true"><i style={{ '--w': width, '--c': colour } as CSSProperties} /></div>
    </Card>
  )
}

function ControlRoomR10({ dash, theme }: { dash: DashboardResponse; theme: 'dark' | 'light' }) {
  const now = new Date()
  const milestone = nextMilestone(now)
  const daysToShow = daysBetween(now, SHOW_DATE)
  const timelineNowIndex = TIMELINE.findIndex((t) => now < t.doneAt)
  const issuedRatio = ratio(dash.bandsIssued, dash.approvedTotal)
  const stickerTotal = dash.stickersActive + dash.stickersPending
  const behind = dash.orgs
    .map((org) => ({ ...org, remaining: Math.max(org.quota - org.used, 0) }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3)

  return (
    <main id="main-content" tabIndex={-1} className={`r10 ${styles['controlRoom']}`}>
      <h2 className="sr-only">{dash.submittedOrgs} companies on site</h2>
      <Card className={styles['hero'] ?? ''}>
        <div className={styles['heroClip']}>
          <div className={styles['heroArt']} role="img" aria-label="Bangalore Open Air festival poster" />
          <div className={styles['heroInner']}>
            <div className={`glass ${styles['heroPlate']}`}>
              <h1 id="control-room-title" className="sr-only">Control room</h1>
              <div className={`${styles['heroKicker']} body-sm`}>
                <span className={styles['liveDot']} aria-hidden="true" />
                {heroKickerText(now)}
              </div>
              <div className={styles['heroNum']}>
                <span className={styles['heroBig']}>{dash.bandsNotCollected}</span>
                <span className={styles['heroUnit']}>still to collect a band</span>
              </div>
              <p className={styles['heroCopy']}>
                {dash.bandsIssued} of {dash.approvedTotal} bands handed over.
                {daysToShow > 0 && <> The show is in {daysToShow} day{daysToShow === 1 ? '' : 's'}, and everyone collects in person.</>}
              </p>
              <Link href="/desk/master?status=not_collected" className={`btn btn-primary ${styles['heroAction']}`}>
                See who hasn&apos;t collected <span className="ic"><Icon name="arrow-right" /></span>
              </Link>
            </div>
            <div className={`glass ${styles['ringWrap']}`} aria-label={`${Math.round(issuedRatio * 100)} percent of approved bands issued`}>
              <svg className={styles['ring']} viewBox="0 0 188 188" aria-hidden="true">
                <circle className={styles['ringTrack']} cx="94" cy="94" r="80" />
                <circle className={styles['ringValue']} cx="94" cy="94" r="80" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - issuedRatio }} />
              </svg>
              <div className={styles['ringLabel']}>
                <strong>{Math.round(issuedRatio * 100)}%</strong>
                <span className="label-sm ink-2">bands issued</span>
              </div>
              {milestone && <StatusPill status="wait"><span className="mono">{milestone.days} days</span> to {milestone.label}</StatusPill>}
            </div>
          </div>
        </div>
      </Card>

      <div className={styles['bento']}>
        <Card className={styles['week'] ?? ''}>
          <div className="card-label"><h2 id="week-title" className="label-sm gold">The week</h2><span className="body-sm ink-3">{formatWeekdayDate(now)}</span></div>
          <ol className={styles['timeline']} style={{ '--progress': timelineProgress(now) } as CSSProperties}>
            {TIMELINE.map((item, i) => {
              const status = i < timelineNowIndex || timelineNowIndex === -1 ? 'done' : i === timelineNowIndex ? 'now' : 'later'
              return (
                <li key={item.label} className={status}>
                  <span className="body-sm ink-3">{item.when}</span>
                  <strong className="display-sm">{item.label}</strong>
                </li>
              )
            })}
          </ol>
        </Card>

        <Card className={styles['feed'] ?? ''}>
          <div className="card-label">
            <h2 id="feed-title" className="label-sm gold">At the gates today</h2>
            <Link href="/desk/master?status=collected" className="btn-link body-sm">All <Icon name="arrow-right" /></Link>
          </div>
          {dash.gateCounts === null || dash.latestIssues === null ? (
            <p className="body-sm ink-2">Today&apos;s gate activity isn&apos;t available right now.</p>
          ) : dash.latestIssues.length === 0 ? (
            <p className="body-sm ink-2">No bands or stickers issued yet today.</p>
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
                {dash.latestIssues.map((issue) => {
                  const issueTier = issue.typeCode ? tier(issue.typeCode) : null
                  const serial = issue.kind === 'wristband'
                    ? `band ${issue.bandSerial ?? 'not typed'}`
                    : `sticker ${issue.stickerNo ?? 'not typed'}`
                  return (
                    <li key={issue.checkinId} className={styles['feedItem']}>
                      <i className={styles['feedDot']} style={{ '--c': issueTier ? tierColour(issueTier.code, theme) : 'var(--ink-3)' } as CSSProperties} aria-hidden="true" />
                      <div>
                        <div className="label-sm">{issue.fullName}</div>
                        <p className="body-sm ink-3">{issueTier?.label ?? 'Unlisted tier'} &middot; {serial} &middot; {issue.gateLabel}</p>
                      </div>
                      <time className={styles['feedTime']}>{formatGateTime(issue.occurredAt)}</time>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </Card>

        <StatTile label="Approved" value={dash.approvedTotal} detail={`${dash.pendingTotal} awaiting decision`} width={ratio(dash.approvedTotal, dash.submittedTotal)} />
        <StatTile label="Vehicle stickers" value={dash.stickersActive} detail={`${dash.stickersPending} plates still to arrive`} width={ratio(dash.stickersActive, stickerTotal)} />
        <StatTile label="Added to BMS" value={dash.bmsAdded} detail={`${dash.bmsPending} approved, not entered`} width={ratio(dash.bmsAdded, dash.approvedTotal)} colour="var(--gold)" />
        <StatTile label="AAA named list" value={dash.aaaStamped} detail={`${Math.max(dash.aaaNominatedApproved - dash.aaaStamped, 0)} still to stamp`} width={ratio(dash.aaaStamped, dash.aaaNominatedApproved)} colour={tierColour('aaa', theme)} />

        <Card className={styles['behind'] ?? ''}>
          <div className="card-label">
            <h2 id="behind-title" className="label-sm gold">Furthest behind</h2>
            <Link href="/desk/orgs" className="btn-link body-sm">All organisations <Icon name="arrow-right" /></Link>
          </div>
          <div className={styles['behindList']}>
            {behind.map((org) => (
              <Link key={org.id} href={`/desk/master?org=${encodeURIComponent(org.id)}&status=not_collected`} className={styles['behindLink']}>
                <CountDot className={styles['behindNumber'] ?? ''}>{org.remaining}</CountDot>
                <strong className="label-sm">{org.name}</strong>
                <span className="body-sm ink-3">{org.used} of {org.quota} collected</span>
                <div className="meter" aria-hidden="true"><i style={{ '--w': ratio(org.used, org.quota), '--c': 'var(--gold)' } as CSSProperties} /></div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <section className={`section ${styles['section']}`} aria-labelledby="bands-title">
        <div className="section-head"><h2 id="bands-title" className="label-sm">{bandsHeading(dash.types.length)}</h2><span className="body-sm ink-3">Issued of printed</span></div>
        <div className={styles['shelf']}>
          {dash.types.map((item) => {
            const currentTier = tier(item.code)
            return (
              <Card key={item.code} href={`/desk/master?tier=${item.code}`} className={`bandcard ${styles['bandCard'] ?? ''}`}>
                <div className={styles['bandArt']}><img src={`/assets/bands/${item.code}.webp`} alt={`${currentTier.label} band`} /></div>
                <div className={styles['bandBody']} style={{ '--c': tierColour(item.code, theme) } as CSSProperties}>
                  <div className={styles['bandRow']}>
                    <h3 className="display-sm">{currentTier.label}</h3>
                    <span><strong className={styles['bandIssued']}>{item.count}</strong> <span className={`body-sm ${styles['bandOf']}`}>/ {currentTier.printQty ?? 'TBC'}</span></span>
                  </div>
                  <div className="meter" aria-label={`${item.count} issued`}><i style={{ '--w': ratio(item.count, currentTier.printQty ?? item.count), '--c': tierColour(item.code, theme) } as CSSProperties} /></div>
                  {item.note && <p className="body-sm ink-2">{item.note}</p>}
                  <div className="col body-sm ink-2">{currentTier.band} band</div>
                  <div className="zones">{zoneChips(item.code).map((zone) => <span key={zone.zone} className={zone.held ? undefined : 'off'}>{zone.text}</span>)}</div>
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
      <main id="main-content" tabIndex={-1} className="r10">
        <EmptyState title={loadError} error className={styles['error'] ?? ''}>
          <Button variant="link" onClick={() => { setLoadError(null); setReloadKey((k) => k + 1) }}>Retry</Button>
        </EmptyState>
      </main>
    )
  }
  if (!dash) return (
    <main id="main-content" tabIndex={-1} className="r10">
      <div role="status" aria-label="Loading control room">
        <Card as="div" className={styles['loading'] ?? ''}><Skeleton shape="hero" /></Card>
      </div>
    </main>
  )
  return <ControlRoomR10 dash={dash} theme={theme} />
}
