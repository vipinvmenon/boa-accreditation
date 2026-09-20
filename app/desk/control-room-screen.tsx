'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Dashboard } from '@/lib/schemas/dashboard'
import { ALL_ZONES, PROP, TYPES, glowFor, passType, type PassTypeCode } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'

/**
 * Transcribed from design/source/boa_design_body.html lines 65-146 (the
 * `isDash` block) — the one screen in scripts/visual-check.mjs's SCREENS
 * whose `auth: 'operator'` means the automated gate can never mint a session
 * for it, so it is always reported BLOCKED rather than pass/fail (see that
 * script's own header). Verified by hand instead: signed in as a real
 * operator, against the real deployed route.
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

const ruleVar = 'var(--rule,rgba(242,239,226,0.16))'
const rule2Var = 'var(--rule2,rgba(242,239,226,0.32))'
const inkVar = 'var(--ink,#F2EFE2)'
const panelVar = 'var(--panel,#101012)'
const goldVar = 'var(--gold,#E3BB72)'
const grnVar = 'var(--grn,#00F5A5)'
const onVar = 'var(--on,#0A0A0A)'

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved: 'Approved',
  closed: 'Closed',
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * The dates that do not move (CLAUDE.md). Bhoopesh and Salman already know
 * there are three bands and how approval works — what they don't have at a
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
function heroHeadline(dash: Dashboard): string {
  if (dash.pendingTotal > 0) return `${dash.pendingTotal} waiting on a decision`
  if (dash.bmsPending > 0) return `${dash.bmsPending} approved, not in BMS`
  if (dash.bandsNotCollected > 0) return `${dash.bandsNotCollected} bands not collected`
  return 'Queue is clear'
}

function heroMetric(dash: Dashboard): { value: number | null; label: string } {
  if (dash.pendingTotal > 0) return { value: dash.pendingTotal, label: 'waiting on a decision' }
  if (dash.bmsPending > 0) return { value: dash.bmsPending, label: 'approved, not in BMS' }
  if (dash.bandsNotCollected > 0) return { value: dash.bandsNotCollected, label: 'bands not collected' }
  return { value: null, label: 'Queue is clear' }
}

export function ControlRoomScreenV1() {
  const router = useRouter()
  const theme = useDomTheme()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/desk/dashboard')
      if (cancelled) return
      if (res.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if (!cancelled) setLoadError(copyForError(body))
        return
      }
      const body = (await res.json()) as Dashboard
      if (cancelled) return
      setDash(body)
      setLoadError(null)
    }
    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const p = PROP[theme]

  const stats = dash
    ? [
        { label: 'Submitted', value: dash.submittedTotal, sub: `${dash.submittedOrgs} organisation${dash.submittedOrgs === 1 ? '' : 's'}`, colour: p.ink },
        { label: 'Approved', value: dash.approvedTotal, sub: `${dash.pendingTotal} awaiting decision`, colour: p.grn },
        { label: 'Bands issued', value: dash.bandsIssued, sub: `${dash.bandsNotCollected} not yet collected`, colour: p.gold },
        { label: 'Vehicle stickers', value: dash.stickersActive, sub: `${dash.stickersActive + dash.stickersPending} registrations approved`, colour: p.ink },
        { label: 'Added to BMS', value: dash.bmsAdded, sub: `${dash.bmsPending} approved, not entered`, colour: p.gold },
      ]
    : []

  const typeCounts = new Map((dash?.types ?? []).map((t) => [t.code, t.count]))
  const milestone = nextMilestone(new Date())

  return (
    <div style={{ background: 'var(--bg,#0A0A0A)', minHeight: '100%', display: 'flex', justifyContent: 'center' }}>
      <div className="d-shell">
        {loadError && (
          <div className="d-pad-sec" style={{ color: 'var(--bad,#FF6B5A)' }}>
            {loadError}
          </div>
        )}

        {!dash && !loadError && (
          <div className="d-pad-sec" style={{ color: inkVar }}>
            Loading…
          </div>
        )}

        {dash && (
          <>
            {/* Hero */}
            <div style={{ position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${ruleVar}` }}>
              <div
                className="d-poster d-poster-img"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  right: 0,
                  backgroundImage: 'url(/assets/boa-poster.png)',
                  backgroundSize: 'cover',
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div className="d-poster-scrim" style={{ position: 'absolute', inset: 0 }} />
              <div
                className="d-hero-pad d-hero-min d-hero-text"
                style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
              >
                <div
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: grnVar,
                    marginBottom: '18px',
                  }}
                >
                  Control room
                </div>
                <h1
                  className="d-h1"
                  style={{
                    fontFamily: "'Anton',sans-serif",
                    lineHeight: 0.92,
                    letterSpacing: '0.01em',
                    textTransform: 'uppercase',
                    color: inkVar,
                    margin: '0 0 18px',
                    maxWidth: '18ch',
                  }}
                >
                  {heroHeadline(dash)}
                </h1>
                {milestone && (
                  <p
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: '13px',
                      letterSpacing: '0.04em',
                      color: 'var(--ink2,rgba(242,239,226,0.72))',
                      margin: '0 0 24px',
                    }}
                  >
                    <span style={{ color: goldVar, fontWeight: 700 }}>{milestone.days}</span>{' '}
                    day{milestone.days === 1 ? '' : 's'} to {milestone.label}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Link
                    href="/desk/queue"
                    className="hov-invert-grn"
                    style={{
                      cursor: 'pointer',
                      border: `1px solid ${grnVar}`,
                      background: grnVar,
                      color: onVar,
                      padding: '15px 22px',
                      fontFamily: "'Oswald',sans-serif",
                      fontSize: '13.5px',
                      fontWeight: 600,
                      letterSpacing: '0.13em',
                      textTransform: 'uppercase',
                      minHeight: '50px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                    }}
                  >
                    Clear the queue
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px', fontWeight: 700 }}>
                      {dash.pendingTotal}
                    </span>
                  </Link>
                  <Link
                    href="/gate"
                    className="hov-outline-grn"
                    style={{
                      cursor: 'pointer',
                      border: `1px solid ${rule2Var}`,
                      background: panelVar,
                      color: inkVar,
                      padding: '15px 22px',
                      fontFamily: "'Oswald',sans-serif",
                      fontSize: '13.5px',
                      fontWeight: 600,
                      letterSpacing: '0.13em',
                      textTransform: 'uppercase',
                      minHeight: '50px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    Open the gate scanner
                  </Link>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="d-stat-cols" style={{ display: 'grid', borderBottom: `1px solid ${ruleVar}` }}>
              {stats.map((s) => (
                <div key={s.label} style={{ padding: '20px 18px 18px', borderRight: `1px solid ${ruleVar}` }}>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: '11px',
                      fontWeight: 600,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: 'var(--ink3,rgba(166,201,180,0.58))',
                    }}
                  >
                    {s.label}
                  </div>
                  <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '46px', lineHeight: 1, letterSpacing: '0.01em', color: s.colour, marginTop: '12px' }}>
                    {s.value}
                  </div>
                  <div style={{ fontSize: '13px', lineHeight: 1.4, color: 'var(--ink3,rgba(242,239,226,0.42))', marginTop: '8px' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Wristbands */}
            <div className="d-pad-sec" style={{ borderBottom: `1px solid ${ruleVar}` }}>
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: grnVar,
                  marginBottom: '14px',
                }}
              >
                Wristbands
              </div>
              <h2 className="d-h2" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 1, textTransform: 'uppercase', color: inkVar, margin: '0 0 22px' }}>
                {dash.bandsIssued} issued · {dash.bandsNotCollected} not collected
              </h2>

              <div className="d-type-cols" style={{ display: 'grid', gap: '1px', background: ruleVar }}>
                {TYPES.map((t) => {
                  const c = theme === 'dark' ? t.colour : t.colourLight
                  const held = new Set(t.zones)
                  return (
                    <div key={t.code} style={{ background: 'var(--bg,#0A0A0A)', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
                        <div
                          style={{
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: '9.5px',
                            fontWeight: 700,
                            letterSpacing: '0.14em',
                            textTransform: 'uppercase',
                            color: 'var(--ink3,rgba(242,239,226,0.52))',
                          }}
                        >
                          {t.num}
                        </div>
                        <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '34px', lineHeight: 1, color: 'var(--ink2,rgba(242,239,226,0.72))' }}>
                          {typeCounts.get(t.code) ?? 0}
                        </div>
                      </div>
                      <div style={{ height: '8px', background: c, boxShadow: glowFor(c, theme) }} />
                      <div>
                        <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '26px', lineHeight: 1, textTransform: 'uppercase', color: inkVar }}>
                          {t.label}
                        </div>
                        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '12.5px', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, marginTop: '6px' }}>
                          {t.band} band
                        </div>
                      </div>
                      <div style={{ fontSize: '13.5px', lineHeight: 1.5, color: 'var(--ink2,rgba(242,239,226,0.72))' }}>{t.note}</div>
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 0,
                          borderTop: `1px solid ${ruleVar}`,
                          paddingTop: '12px',
                          marginTop: 'auto',
                        }}
                      >
                        {ALL_ZONES.map((z) => (
                          <span
                            key={z}
                            style={{
                              fontFamily: "'Oswald',sans-serif",
                              fontSize: '9.5px',
                              fontWeight: 500,
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              color: held.has(z) ? p.ink2 : p.ink3,
                              padding: '3px 8px 3px 0',
                            }}
                          >
                            {held.has(z) ? z : `—— ${z}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AAA override */}
            <div className="d-pad-sec" style={{ borderBottom: `1px solid ${ruleVar}`, borderTop: `2px solid ${goldVar}`, background: panelVar }}>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px' }}>
                  <div
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      textTransform: 'uppercase',
                      color: goldVar,
                      marginBottom: '12px',
                    }}
                  >
                    AAA override
                  </div>
                  <div style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--ink2,rgba(242,239,226,0.72))', maxWidth: '62ch' }}>
                    <strong style={{ color: inkVar }}>
                      {dash.aaaStamped} issued of {dash.aaaNominatedApproved} approved.
                    </strong>
                    {dash.aaaNominatedApproved > dash.aaaStamped && (
                      <> {dash.aaaNominatedApproved - dash.aaaStamped} still to stamp.</>
                    )}
                  </div>
                </div>
                <Link
                  href="/desk/aaa"
                  className="hov-invert-gold"
                  style={{
                    cursor: 'pointer',
                    border: `1px solid ${goldVar}`,
                    background: goldVar,
                    color: onVar,
                    padding: '14px 22px',
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: '13px',
                    fontWeight: 600,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                  }}
                >
                  Manage list →
                </Link>
              </div>
            </div>

            {/* Organisations */}
            <div className="d-pad-sec">
              <div
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: '11px',
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: grnVar,
                  marginBottom: '14px',
                }}
              >
                Organisations
              </div>
              <h2 className="d-h2" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 1, textTransform: 'uppercase', color: inkVar, margin: '0 0 22px' }}>
                {dash.orgs.length} compan{dash.orgs.length === 1 ? 'y' : 'ies'} on site
              </h2>

              {dash.orgs.length === 0 ? (
                <p style={{ fontSize: '14px', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>
                  No organisations yet. Add one from <Link href="/desk/orgs" style={{ color: grnVar }}>Orgs</Link>.
                </p>
              ) : (
                <div style={{ borderTop: `1px solid ${rule2Var}` }}>
                  {dash.orgs.map((o) => {
                    const pct = o.quota > 0 ? Math.round((o.used / o.quota) * 100) : 0
                    const barFg = pct >= 100 ? p.gold : p.grn
                    const type = passType(o.defaultType as PassTypeCode)
                    const typeColourValue = theme === 'dark' ? type.colour : type.colourLight
                    const statusFg = o.status === 'submitted' ? p.gold : o.status === 'approved' ? p.grn : p.ink3
                    return (
                      <div
                        key={o.id}
                        className="d-org-cols"
                        style={{ display: 'grid', gap: '16px', padding: '16px 0', borderBottom: `1px solid ${ruleVar}`, alignItems: 'center' }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "'Oswald',sans-serif",
                              fontSize: '17px',
                              fontWeight: 600,
                              letterSpacing: '0.02em',
                              textTransform: 'uppercase',
                              color: inkVar,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {o.name}
                          </div>
                          <div
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: '10.5px',
                              letterSpacing: '0.07em',
                              textTransform: 'uppercase',
                              color: 'var(--ink3,rgba(242,239,226,0.42))',
                              marginTop: '4px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {titleCase(o.kind)} · {o.contactName} · {o.contactPhone}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                          <span style={{ width: '9px', height: '22px', background: typeColourValue, flex: '0 0 auto' }} />
                          <span
                            style={{
                              fontFamily: "'Oswald',sans-serif",
                              fontSize: '13px',
                              fontWeight: 500,
                              letterSpacing: '0.09em',
                              textTransform: 'uppercase',
                              color: 'var(--ink2,rgba(242,239,226,0.72))',
                            }}
                          >
                            {type.label}
                          </span>
                        </div>
                        <div>
                          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', fontWeight: 700, letterSpacing: '0.06em', color: inkVar }}>
                            {o.used}
                            <span style={{ color: 'var(--ink3,rgba(242,239,226,0.42))', fontWeight: 400 }}>/{o.quota}</span>
                          </div>
                          <div style={{ height: '3px', background: ruleVar, marginTop: '6px' }}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barFg }} />
                          </div>
                        </div>
                        <div
                          style={{
                            fontFamily: "'JetBrains Mono',monospace",
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.12em',
                            textTransform: 'uppercase',
                            color: statusFg,
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {STATUS_LABEL[o.status] ?? titleCase(o.status)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
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

function V2BandCard({ type, count, theme, delay }: { type: (typeof TYPES)[number]; count: number; theme: 'dark' | 'light'; delay: number }) {
  const colour = theme === 'dark' ? type.colour : type.colourLight
  const held = new Set(type.zones)
  return (
    <div className="bandcard bz rv" style={{ '--d': delay, '--c': colour } as React.CSSProperties}>
      <div className="pl">
        <div className="top"><span className="mono">{type.num}</span><span className="cnt num">{count}</span></div>
        <div className="stripe" />
        <h3>{type.label}</h3>
        <div className="col">{type.band} band</div>
        <p>{type.note}</p>
        <div className="zones">{ALL_ZONES.map((zone) => <span key={zone} className={held.has(zone) ? undefined : 'off'}>{zone}</span>)}</div>
      </div>
    </div>
  )
}

function ControlRoomV2({ dash, theme }: { dash: Dashboard; theme: 'dark' | 'light' }) {
  const rootRef = useRef<HTMLElement>(null)
  const typeCounts = new Map(dash.types.map((type) => [type.code, type.count]))
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
    if (!('IntersectionObserver' in window)) {
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
              <Link href="/desk/queue" className="btn go">Clear the queue <span className="n">{dash.pendingTotal}</span><span className="ic">↗</span></Link>
              <Link href="/gate" className="btn">Open the gate scanner<span className="ic">⌁</span></Link>
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
          <div className="row" style={{ marginTop: 'auto' }}><Link href="/desk/aaa" className="btn gold">Manage list<span className="ic">→</span></Link></div>
        </div></div>
        <V2Stat className="stat quad" label="Organisations" value={dash.submittedOrgs} detail={`${dash.submittedOrgs - dash.orgs.length} not yet listed`} width={orgRatio} delay={6} />
      </div>

        <div className="head rv" style={{ paddingTop: '72px' }}><h2 className="h2">Three bands. No fourth.</h2></div>
        <div className="bands3">{TYPES.map((type, index) => <V2BandCard key={type.code} type={type} count={typeCounts.get(type.code) ?? 0} theme={theme} delay={index + 7} />)}</div>

        <div className="head rv" style={{ paddingTop: '72px' }}><h2 className="h2">{dash.orgs.length} compan{dash.orgs.length === 1 ? 'y' : 'ies'} on site</h2><span className="linkbtn">Needs you first ↕</span></div>
        <div className="bz rv"><div className="pl list">
          <div className="list-head"><span className="mono">Organisations</span><span className="mono">{dash.orgs.length} listed</span></div>
          {dash.orgs.map((org) => {
            const type = passType(org.defaultType as PassTypeCode)
            const colour = theme === 'dark' ? type.colour : type.colourLight
            const percentage = org.quota > 0 ? Math.min(org.used / org.quota, 1) : 0
            return <div className="li" key={org.id}>
              <div><div className="nm">{org.name}</div><div className="sub">{titleCase(org.kind)} · {org.contactName} · {org.contactPhone}</div></div>
              <div className="band" style={{ '--c': colour } as React.CSSProperties}>{type.label}</div>
              <div className="qt"><span className="num"><b>{org.used}</b>/{org.quota}</span><div className="meter"><i style={{ '--w': percentage, '--c': percentage >= 1 ? 'var(--gold)' : 'var(--grn)' } as React.CSSProperties} /></div></div>
              <span className={`st ${org.status === 'approved' ? 'ok' : org.status === 'submitted' ? 'wait' : 'mute'}`}>{STATUS_LABEL[org.status] ?? titleCase(org.status)}</span>
            </div>
          })}
        </div></div>
    </main>
  )
}

export function ControlRoomScreen() {
  const theme = useDomTheme()
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    void fetch('/api/desk/dashboard').then(async (response) => {
      if (cancelled) return
      if (response.status === 401) { router.replace('/desk/login'); return }
      if (!response.ok) { setLoadError(copyForError(await response.json().catch(() => null))); return }
      const body = await response.json()
      if (!cancelled) setDash(body as Dashboard)
    }).catch(() => { if (!cancelled) setLoadError(ERROR_COPY['internal']!) })
    return () => { cancelled = true }
  }, [router])

  if (loadError) return <main><p className="pad" style={{ color: 'var(--bad)' }}>{loadError}</p></main>
  if (!dash) return <main><p className="pad mono">Loading…</p></main>
  return <ControlRoomV2 dash={dash} theme={theme} />
}
