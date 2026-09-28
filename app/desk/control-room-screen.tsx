'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { dashboardResponseSchema, type DashboardResponse } from '@/lib/schemas/dashboard'
import { tier, tierColour } from '@/lib/design'
import { zoneChips } from '@/lib/desk-tiers'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { InlineError } from '@/components/states'
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
  { label: 'show', date: '2026-10-10' },
] as const

function nextMilestone(now: Date): { label: string; days: number } | null {
  for (const m of MILESTONES) {
    const days = Math.ceil((new Date(`${m.date}T00:00:00`).getTime() - now.getTime()) / 86_400_000)
    if (days >= 0) return { label: m.label, days }
  }
  return null
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

function StatTile({ label, value, detail, width, colour }: {
  label: string
  value: number
  detail: string
  width: number
  colour?: string
}) {
  return (
    <article className={`card ${styles['stat']}`}>
      <span className="label-sm">{label}</span>
      <span className={`number ${styles['tileNumber']}`} style={colour ? { color: colour } : undefined}>{value}</span>
      <p className={styles['tileDetail']}>{detail}</p>
      <div className="meter" aria-hidden="true"><i style={{ '--w': width, '--c': colour } as CSSProperties} /></div>
    </article>
  )
}

function ControlRoomR10({ dash, theme }: { dash: DashboardResponse; theme: 'dark' | 'light' }) {
  const milestone = nextMilestone(new Date())
  const issuedRatio = ratio(dash.bandsIssued, dash.approvedTotal)
  const stickerTotal = dash.stickersActive + dash.stickersPending
  const behind = dash.orgs
    .map((org) => ({ ...org, remaining: Math.max(org.quota - org.used, 0) }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3)

  return (
    <main id="main-content" tabIndex={-1} className={styles['controlRoom']}>
      <section className={`card ${styles['hero']}`} aria-labelledby="control-room-title">
        <div className={styles['heroClip']}>
          <div className={styles['heroArt']} role="img" aria-label="Bangalore Open Air festival poster" />
          <div className={styles['heroInner']}>
            <div className={`glass ${styles['heroPlate']}`}>
              <p className="label-sm gold">Control room</p>
              <h1 id="control-room-title" className="display-lg">The room behind the bands</h1>
              <span className={styles['heroNumber']}>{dash.bandsNotCollected}</span>
              <p className={styles['heroCopy']}>
                bands still to collect. {dash.bandsIssued} of {dash.approvedTotal} approved bands have been handed over.
                {milestone && <> The show is in {milestone.days} day{milestone.days === 1 ? '' : 's'}.</>}
              </p>
              <Link href="/desk/master?status=not_collected" className={`btn btn-primary ${styles['heroAction']}`}>
                See who is waiting <span className="ic"><Icon name="arrow-right" /></span>
              </Link>
            </div>
            <div className={`glass ${styles['ringWrap']}`} aria-label={`${Math.round(issuedRatio * 100)} percent of approved bands issued`}>
              <svg className={styles['ring']} viewBox="0 0 148 148" aria-hidden="true">
                <circle className={styles['ringTrack']} cx="74" cy="74" r="64" />
                <circle className={styles['ringValue']} cx="74" cy="74" r="64" pathLength="1" style={{ strokeDasharray: 1, strokeDashoffset: 1 - issuedRatio }} />
              </svg>
              <div className={styles['ringLabel']}>
                <strong>{Math.round(issuedRatio * 100)}%</strong>
                <span className="label-sm ink-2">bands issued</span>
              </div>
              {milestone && <span className="chip"><span className="mono">{milestone.days} days</span> to {milestone.label}</span>}
            </div>
          </div>
        </div>
      </section>

      <div className={styles['bento']}>
        <article className={`card ${styles['week']}`} aria-labelledby="week-title">
          <div className="card-label"><h2 id="week-title" className="label-sm gold">The week</h2><span className="body-sm ink-3">Build week</span></div>
          <ol className={styles['timeline']}>
            <li className="done"><span className="body-sm ink-3">20 Sep</span><strong className="display-sm">Links out</strong></li>
            <li className="done"><span className="body-sm ink-3">4 Oct</span><strong className="display-sm">Gate live</strong></li>
            <li className="now"><span className="body-sm ink-3">5 to 9 Oct</span><strong className="display-sm">Build</strong></li>
            <li><span className="body-sm ink-3">10 Oct</span><strong className="display-sm">Show</strong></li>
          </ol>
        </article>

        <StatTile label="Approved" value={dash.approvedTotal} detail={`${dash.pendingTotal} awaiting decision`} width={ratio(dash.approvedTotal, dash.submittedTotal)} />
        <StatTile label="Vehicle stickers" value={dash.stickersActive} detail={`${dash.stickersPending} plates still to arrive`} width={ratio(dash.stickersActive, stickerTotal)} />
        <StatTile label="Added to BMS" value={dash.bmsAdded} detail={`${dash.bmsPending} approved, not entered`} width={ratio(dash.bmsAdded, dash.approvedTotal)} colour="var(--gold)" />
        <StatTile label="AAA named list" value={dash.aaaStamped} detail={`${Math.max(dash.aaaNominatedApproved - dash.aaaStamped, 0)} still to stamp`} width={ratio(dash.aaaStamped, dash.aaaNominatedApproved)} colour={tierColour('aaa', theme)} />

        <article className={`card ${styles['behind']}`} aria-labelledby="behind-title">
          <div className="card-label">
            <h2 id="behind-title" className="label-sm gold">Furthest behind</h2>
            <Link href="/desk/orgs" className="btn-link body-sm">All organisations <Icon name="arrow-right" /></Link>
          </div>
          <div className={styles['behindList']}>
            {behind.map((org) => (
              <Link key={org.id} href={`/desk/master?org=${encodeURIComponent(org.id)}&status=not_collected`} className={styles['behindLink']}>
                <span className={styles['behindNumber']}>{org.remaining}</span>
                <strong className="label-sm">{org.name}</strong>
                <span className="body-sm ink-3">{org.used} of {org.quota} collected</span>
                <div className="meter" aria-hidden="true"><i style={{ '--w': ratio(org.used, org.quota), '--c': 'var(--gold)' } as CSSProperties} /></div>
              </Link>
            ))}
          </div>
        </article>
      </div>

      <section className={`section ${styles['section']}`} aria-labelledby="bands-title">
        <div className="section-head"><h2 id="bands-title" className="label-sm">{bandsHeading(dash.types.length)}</h2><span className="body-sm ink-3">Issued of printed</span></div>
        <div className={styles['shelf']}>
          {dash.types.map((item) => {
            const currentTier = tier(item.code)
            return (
              <Link key={item.code} href={`/desk/master?tier=${item.code}`} className={`card bandcard ${styles['bandCard']}`} style={{ '--c': tierColour(item.code, theme) } as CSSProperties}>
                <div className={styles['bandArt']}><img src={`/assets/bands/${item.code}.webp`} alt={`${currentTier.label} band`} /></div>
                <div className={styles['bandBody']}>
                  <div className={styles['bandRow']}>
                    <h3 className="display-sm">{currentTier.label}</h3>
                    <span><strong className={styles['bandIssued']}>{item.count}</strong> <span className={`body-sm ${styles['bandOf']}`}>/ {currentTier.printQty ?? 'TBC'}</span></span>
                  </div>
                  <div className="meter" aria-label={`${item.count} issued`}><i style={{ '--w': ratio(item.count, currentTier.printQty ?? item.count), '--c': tierColour(item.code, theme) } as CSSProperties} /></div>
                  {item.note && <p className="body-sm ink-2">{item.note}</p>}
                  <div className="col body-sm ink-2">{currentTier.band} band</div>
                  <div className="zones">{zoneChips(item.code).map((zone) => <span key={zone.zone} className={zone.held ? undefined : 'off'}>{zone.text}</span>)}</div>
                </div>
              </Link>
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
        <div className={`card ${styles['error']}`}>
          <InlineError message={loadError} onRetry={() => { setLoadError(null); setReloadKey((k) => k + 1) }} />
        </div>
      </main>
    )
  }
  if (!dash) return (
    <main id="main-content" tabIndex={-1}>
      <div className="card" role="status" aria-label="Loading control room">
        <div className="sk sk-hero" />
      </div>
    </main>
  )
  return <ControlRoomR10 dash={dash} theme={theme} />
}
