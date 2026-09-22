'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { dashboardResponseSchema, type Dashboard, type DashboardResponse } from '@/lib/schemas/dashboard'
import { tier, tierColour, type TierCode } from '@/lib/design'
import { zoneChips } from '@/lib/desk-tiers'
import { useDomTheme } from '@/lib/use-theme'
import { ControlRoomSkeleton } from '@/components/loading-skeleton'
import { Icon } from '@/components/icon'
import { DoubleIssuePanel } from './double-issue-panel'

/**
 * The v2 Control room (design/source/boa_design_v2.html, the dashboard
 * section). The band cards render every tier boa_acc_desk_dashboard() returns,
 * in sort order (ADR-018); the v1 three-type renderer that used to sit beside
 * this was unreferenced and has been removed.
 *
 * The shared desk NAV / BMS status bar is supplied by DeskChrome, which wraps
 * every authenticated desk route. The public submission screen remains
 * intentionally outside that shell.
 *
 * The org list's `status` column is boa_acc_org.status itself (open/
 * submitted/approved/closed), not a derived label — nothing sets it past
 * 'open'/'closed' yet (boa_acc_decide is ACC-041), so every real org today
 * reads "Open" here. That is correct, not a bug: this screen shows what the
 * database actually contains, not what the design's mock implies.
 */

const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_authorized: 'Only an active operator can view the Control room.',
  internal: "That didn't go through. Try again.",
}

function copyForError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const code = String((body as { error: unknown }).error)
    return ERROR_COPY[code] ?? ERROR_COPY['internal']!
  }
  return ERROR_COPY['internal']!
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved: 'Approved',
  closed: 'Closed',
}

const STATUS_COPY: Record<string, string> = {
  open: 'Open',
  submitted: 'Pending',
  approved: 'Approved',
  closed: 'Closed',
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
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
  { label: 'show', date: '2026-10-10' },
] as const

function nextMilestone(now: Date): { label: string; days: number } | null {
  for (const m of MILESTONES) {
    const days = Math.ceil((new Date(`${m.date}T00:00:00`).getTime() - now.getTime()) / 86_400_000)
    if (days >= 0) return { label: m.label, days }
  }
  return null
}

/**
 * The one number worth leading with, in the order an operator would actually
 * want it acted on: a live decision queue outranks a BMS backlog, which
 * outranks a band still sitting uncollected.
 */
function heroMetric(dash: Dashboard): { value: number | null; label: string } {
  if (dash.pendingTotal > 0) return { value: dash.pendingTotal, label: 'waiting on a decision' }
  if (dash.bmsPending > 0) return { value: dash.bmsPending, label: 'approved, not in BMS' }
  if (dash.bandsNotCollected > 0) return { value: dash.bandsNotCollected, label: 'bands not collected' }
  return { value: null, label: 'Queue is clear' }
}

function V2Count({ value, suffix }: { value: number; suffix?: string | undefined }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const frame = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(frame)
    }

    const started = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1100)
      setShown(Math.round(value * (1 - Math.pow(1 - progress, 4))))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return <span className="num">{shown}{suffix ? <small>{suffix}</small> : null}</span>
}

function V2Stat({
  label,
  value,
  suffix,
  detail,
  width,
  colour,
  className = 'stat',
  delay,
}: {
  label: string
  value: number
  suffix?: string | undefined
  detail: string
  width: number
  colour?: string
  className?: string
  delay: number
}) {
  return (
    <div className={`${className} bz rv`} style={{ '--d': delay } as React.CSSProperties}>
      <div className="pl">
        <span className="mono" style={colour ? { color: colour } : undefined}>{label}</span>
        <div className="v"><V2Count value={value} suffix={suffix} /></div>
        <p>{detail}</p>
        <div className="meter"><i style={{ '--w': width, '--c': colour } as React.CSSProperties} /></div>
      </div>
    </div>
  )
}

/**
 * One card per tier the database returns, in boa_acc_type.sort_order (the
 * master sheet's "Where each band goes" order). Count and note come from the
 * data layer; label, band name, colour and zone strip from the pack mirror in
 * lib/design.ts, which accreditation-contract.test.ts proves against the seed.
 */
function V2BandCard({ code, count, note, theme, delay }: { code: TierCode; count: number; note: string | null; theme: 'dark' | 'light'; delay: number }) {
  const t = tier(code)
  return (
    <div className="bandcard bz rv" style={{ '--d': delay, '--c': tierColour(code, theme) } as React.CSSProperties}>
      <div className="pl">
        <div className="top"><span className="mono">{t.printQty === null ? 'Print qty TBC' : `${t.printQty} printed`}</span><span className="cnt num">{count}</span></div>
        <div className="stripe" />
        <h3>{t.label}</h3>
        <div className="col">{t.band} band</div>
        {note && <p>{note}</p>}
        <div className="zones">{zoneChips(code).map((zone) => <span key={zone.zone} className={zone.held ? undefined : 'off'}>{zone.text}</span>)}</div>
      </div>
    </div>
  )
}

const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const ORDINAL_WORDS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh']

/** The v2 heading "Three bands. No fourth.", counted from the data rather than written in. */
function bandsHeading(n: number): string {
  const count = COUNT_WORDS[n]
  const next = ORDINAL_WORDS[n + 1]
  return count && next ? `${count} band${n === 1 ? '' : 's'}. No ${next}.` : `${n} bands.`
}

function ControlRoomV2({ dash, theme }: { dash: DashboardResponse; theme: 'dark' | 'light' }) {
  const rootRef = useRef<HTMLElement>(null)
  const milestone = nextMilestone(new Date())
  const headline = heroMetric(dash)
  const approvedRatio = dash.submittedTotal > 0 ? dash.approvedTotal / dash.submittedTotal : 0
  const issuedRatio = dash.approvedTotal > 0 ? dash.bandsIssued / dash.approvedTotal : 0
  const stickersTotal = dash.stickersActive + dash.stickersPending
  const stickerRatio = stickersTotal > 0 ? dash.stickersActive / stickersTotal : 0
  const bmsRatio = dash.approvedTotal > 0 ? dash.bmsAdded / dash.approvedTotal : 0
  const orgRatio = dash.submittedOrgs > 0 ? dash.orgs.length / dash.submittedOrgs : 0

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const revealables = root.querySelectorAll<HTMLElement>('.rv')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealables.forEach((element) => element.classList.add('in'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }),
      { threshold: 0.12 },
    )
    revealables.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return (
    <main ref={rootRef}>
        <div className="bento">
        <div className="hero bz rv"><div className="pl">
          <div className="hero-art" role="img" aria-label="Festival poster art" /><div className="hero-scrim" />
          <div className="hero-in">
            <span className="tag">Control room</span>
            <h1 className="h1"><span>{headline.value === null ? headline.label : <><V2Count value={headline.value} /> {headline.label}</>}</span></h1>
            {milestone && <p className="when"><b>{milestone.days} day{milestone.days === 1 ? '' : 's'}</b> to {milestone.label}</p>}
            <div className="row">
              <Link href="/desk/queue" className="btn go">Clear the queue <span className="n">{dash.pendingTotal}</span><span className="ic"><Icon name="arrow-up-right" /></span></Link>
              <Link href="/gate" className="btn">Open the gate scanner<span className="ic"><Icon name="scan" /></span></Link>
            </div>
          </div>
        </div></div>

        <V2Stat label="Approved" value={dash.approvedTotal} suffix={`/ ${dash.submittedTotal}`} detail={`${dash.pendingTotal} awaiting decision, from ${dash.submittedOrgs} organisations`} width={approvedRatio} delay={1} />
        <V2Stat label="Bands issued" value={dash.bandsIssued} suffix={`/ ${dash.approvedTotal}`} detail={`${dash.bandsNotCollected} not yet collected`} width={issuedRatio} colour="var(--gold)" delay={2} />
        <V2Stat className="stat quad" label="Vehicle stickers" value={dash.stickersActive} suffix={`/ ${stickersTotal}`} detail={`${dash.stickersPending} plates still to arrive`} width={stickerRatio} delay={3} />
        <V2Stat className="stat quad" label="Added to BMS" value={dash.bmsAdded} suffix={`/ ${dash.approvedTotal}`} detail={`${dash.bmsPending} approved, not entered`} width={bmsRatio} colour="var(--gold)" delay={4} />
        <div className="stat aaa-card bz rv" style={{ '--d': 5 } as React.CSSProperties}><div className="pl">
          <span className="mono" style={{ color: 'var(--gold)' }}>AAA override</span>
          <div className="v"><V2Count value={dash.aaaStamped} suffix={`/ ${dash.aaaNominatedApproved}`} /></div>
          <p>{Math.max(dash.aaaNominatedApproved - dash.aaaStamped, 0)} still to stamp from the named list</p>
          <div className="row" style={{ marginTop: 'auto' }}><Link href="/desk/aaa" className="btn gold">Manage list<span className="ic"><Icon name="arrow-right" /></span></Link></div>
        </div></div>
        <V2Stat className="stat quad" label="Organisations" value={dash.submittedOrgs} detail={`${dash.submittedOrgs - dash.orgs.length} not yet listed`} width={orgRatio} delay={6} />
      </div>

        {/* ACC-148: absent unless the database reports a double issue. */}
        <DoubleIssuePanel count={dash.doubleIssues} list={dash.doubleIssueList} />

        <div className="head rv" style={{ paddingTop: '72px' }}><h2 className="h2">{bandsHeading(dash.types.length)}</h2></div>
        <div className={`bands3${dash.types.length > 3 ? ' bands8' : ''}`}>{dash.types.map((type, index) => <V2BandCard key={type.code} code={type.code} count={type.count} note={type.note ?? null} theme={theme} delay={index + 7} />)}</div>

        <div className="head rv" style={{ paddingTop: '72px' }}><h2 className="h2">{dash.submittedOrgs} compan{dash.submittedOrgs === 1 ? 'y' : 'ies'} on site</h2><span className="linkbtn">Needs you first <Icon name="sort-descending" /></span></div>
        <div className="bz rv"><div className="pl"><div className="list-scroll" tabIndex={0} aria-label="Organisations on site"><div className="list">
          <div className="list-head"><span className="mono">Organisations</span><span className="mono">{dash.orgs.length} listed</span></div>
          {dash.orgs.map((org) => {
            const type = tier(org.defaultType)
            const colour = tierColour(org.defaultType, theme)
            const percentage = org.quota > 0 ? Math.min(org.used / org.quota, 1) : 0
            return <div className="li" key={org.id}>
              <div><div className="nm">{org.name}</div><div className="sub">{titleCase(org.kind)}, {org.contactName}, {org.contactPhone}</div></div>
              <div className="band" style={{ '--c': colour } as React.CSSProperties}>{type.label}</div>
              <div className="qt"><span className="num"><b>{org.used}</b>/{org.quota}</span><div className="meter"><i style={{ '--w': percentage, '--c': percentage >= 1 ? 'var(--gold)' : 'var(--grn)' } as React.CSSProperties} /></div></div>
              <span className={`st ${org.status === 'approved' ? 'ok' : org.status === 'submitted' ? 'wait' : 'mute'}`}>{STATUS_COPY[org.status] ?? STATUS_LABEL[org.status] ?? titleCase(org.status)}</span>
            </div>
          })}
        </div></div></div></div>
    </main>
  )
}

export function ControlRoomScreen() {
  const theme = useDomTheme()
  const [dash, setDash] = useState<DashboardResponse | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    void fetch('/api/desk/dashboard').then(async (response) => {
      if (cancelled) return
      if (response.status === 401) { router.replace('/desk/login'); return }
      if (!response.ok) { setLoadError(copyForError(await response.json().catch(() => null))); return }
      // Zod at the boundary: a payload that drifts from the route's contract
      // is an error state, never a half-rendered screen.
      const parsed = dashboardResponseSchema.safeParse(await response.json())
      if (cancelled) return
      if (!parsed.success) { setLoadError(ERROR_COPY['internal']!); return }
      setDash(parsed.data)
    }).catch(() => { if (!cancelled) setLoadError(ERROR_COPY['internal']!) })
    return () => { cancelled = true }
  }, [router])

  if (loadError) return <main><p role="alert" className="pad" style={{ color: 'var(--bad)' }}>{loadError}</p></main>
  if (!dash) return <main><div role="status"><ControlRoomSkeleton /></div></main>
  return <ControlRoomV2 dash={dash} theme={theme} />
}
