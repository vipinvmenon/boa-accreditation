'use client'

import { useEffect, useState } from 'react'
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
  internal: 'Something went wrong. Try again.',
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

export function ControlRoomScreen() {
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
                    maxWidth: '14ch',
                  }}
                >
                  Nobody walks in unlisted
                </h1>
                <p style={{ fontSize: '15.5px', lineHeight: 1.55, color: 'var(--ink2,rgba(242,239,226,0.72))', margin: '0 0 24px', maxWidth: '52ch' }}>
                  Every person working at BOA is registered individually, approved against the master list, and checks in
                  physically for their own wristband. Every vehicle is registered to a plate and carries a sticker bound
                  to it.
                </p>
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
                      {dash.pendingTotal} left
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
              <h2 className="d-h2" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 1, textTransform: 'uppercase', color: inkVar, margin: '0 0 10px' }}>
                Three bands. No fourth.
              </h2>
              <p style={{ fontSize: '14.5px', lineHeight: 1.55, color: 'var(--ink3,rgba(242,239,226,0.42))', margin: '0 0 22px', maxWidth: '60ch' }}>
                Type is assigned at approval and sets the band colour and the zones. Serials are typed in at the gate as
                bands are handed over, never pre-assigned.
              </p>

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
                    All-areas access is not requestable on the vendor form. The accreditation lead stamps it onto an
                    approved pass from a named list.{' '}
                    <strong style={{ color: inkVar }}>
                      {dash.aaaStamped} issued of {dash.aaaNominatedApproved} approved.
                    </strong>
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
