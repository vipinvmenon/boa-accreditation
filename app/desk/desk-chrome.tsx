'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { NAV, PROP } from '@/lib/design'
import { dashboardSchema, type Dashboard } from '@/lib/schemas/dashboard'
import { operatorRowSchema, type OperatorRow } from '@/lib/schemas/operator'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { useDomTheme } from '@/lib/use-theme'
import { z } from 'zod'

const rule = 'var(--rule,rgba(242,239,226,0.16))'
const ink = 'var(--ink,#F2EFE2)'
const ink3 = 'var(--ink3,rgba(242,239,226,0.52))'
const green = 'var(--grn,#00F5A5)'
const panel = 'var(--panel,#101012)'

const ROLE_LABEL: Record<OperatorRow['role'], string> = {
  lead: 'Lead',
  approver: 'Approver',
  admin: 'Admin',
}

/**
 * Shape of GET /api/desk/operators (app/api/desk/operators/route.ts) — an
 * RLS-scoped list (own row only, unless the caller is lead/admin) plus
 * `callerId`. Reused here rather than a new "who am I" endpoint: it already
 * returns exactly display_name + role, nothing beyond what non-negotiable #9
 * would flag, and the caller's own row is always present in it regardless of
 * role since RLS never hides a row from its own owner.
 */
const operatorsResponseSchema = z.object({
  operators: operatorRowSchema.array(),
  callerId: z.string(),
})

export function DeskChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const theme = useDomTheme()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [me, setMe] = useState<OperatorRow | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    async function loadStatus() {
      const response = await fetch('/api/desk/dashboard')
      if (cancelled) return
      if (response.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!response.ok) return
      const parsed = dashboardSchema.safeParse(await response.json())
      if (!cancelled && parsed.success) setDashboard(parsed.data)
    }
    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    let cancelled = false
    async function loadMe() {
      const response = await fetch('/api/desk/operators')
      if (cancelled || !response.ok) return
      const parsed = operatorsResponseSchema.safeParse(await response.json())
      if (cancelled || !parsed.success) return
      const own = parsed.data.operators.find((o) => o.user_id === parsed.data.callerId)
      if (own) setMe(own)
    }
    void loadMe()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const p = PROP[theme]
  const totalQuota = dashboard?.orgs.reduce((total, org) => total + org.quota, 0) ?? null
  const activeNav = NAV.find((item) => item.href === pathname)?.id

  function toggleTheme() {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark')
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    await supabaseBrowser().auth.signOut()
    router.replace('/desk/login')
  }

  return (
    <div>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 70,
          background: 'var(--bg,#0A0A0A)',
          borderBottom: `1px solid ${rule}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
          <Link
            href="/desk"
            aria-label="BOA Accreditation desk home"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 18px',
              borderRight: `1px solid ${rule}`,
              textDecoration: 'none',
            }}
          >
            <img src="/assets/boa-logo.png" alt="Bangalore Open Air" style={{ height: '30px', width: 'auto', display: 'block' }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                lineHeight: 1.2,
                textTransform: 'uppercase',
                color: ink3,
              }}
            >
              Accred
              <br />
              desk
            </span>
          </Link>

          <nav aria-label="Desk navigation" style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: '1 1 auto', overflowX: 'auto' }}>
            {NAV.map((item) => {
              const active = item.id === activeNav
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className="hov-text-ink"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: 0,
                    borderRight: `1px solid ${rule}`,
                    background: active ? p.grnbg : 'transparent',
                    color: active ? (theme === 'dark' ? green : ink) : ink3,
                    padding: '11px 18px',
                    fontFamily: "'Oswald',sans-serif",
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div ref={menuRef} style={{ position: 'relative', borderLeft: `1px solid ${rule}` }}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Operator menu"
              className="hov-text-grn"
              style={{
                cursor: 'pointer',
                border: 0,
                background: 'transparent',
                color: p.ink3,
                padding: '14px 16px',
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap',
              }}
            >
              {me ? me.display_name : 'Account'}
              <span aria-hidden="true">{menuOpen ? '▲' : '▼'}</span>
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Operator menu"
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  zIndex: 80,
                  minWidth: '220px',
                  background: panel,
                  border: `1px solid ${rule}`,
                  boxShadow: '0 12px 28px rgba(0,0,0,0.35)',
                }}
              >
                <div
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${rule}`,
                    fontFamily: "'Oswald',sans-serif",
                  }}
                >
                  <div style={{ fontSize: '13px', fontWeight: 600, color: ink }}>
                    {me ? me.display_name : 'Loading…'}
                  </div>
                  <div
                    style={{
                      marginTop: '2px',
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: '10px',
                      fontWeight: 500,
                      letterSpacing: '0.09em',
                      textTransform: 'uppercase',
                      color: ink3,
                    }}
                  >
                    {me ? ROLE_LABEL[me.role] : ''}
                  </div>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    toggleTheme()
                    setMenuOpen(false)
                  }}
                  className="hov-text-grn"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: 0,
                    borderBottom: `1px solid ${rule}`,
                    background: 'transparent',
                    color: p.ink3,
                    padding: '11px 16px',
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                </button>

                <Link
                  href="/desk/users"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="hov-text-ink"
                  style={{
                    display: 'block',
                    borderBottom: `1px solid ${rule}`,
                    color: ink3,
                    padding: '11px 16px',
                    fontFamily: "'Oswald',sans-serif",
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textDecoration: 'none',
                  }}
                >
                  Manage users
                </Link>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void signOut()}
                  disabled={signingOut}
                  className="hov-text-bad"
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    cursor: signingOut ? 'default' : 'pointer',
                    border: 0,
                    background: 'transparent',
                    color: ink3,
                    padding: '11px 16px',
                    fontFamily: "'Oswald',sans-serif",
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    opacity: signingOut ? 0.6 : 1,
                  }}
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
            padding: '8px 18px',
            borderTop: `1px solid ${rule}`,
            background: panel,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: '10.5px',
            fontWeight: 500,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: ink3,
          }}
        >
          <span style={{ color: green }}>● Live</span>
          <span>Build 05–09 Oct · Show 10 Oct</span>
          <span style={{ color: ink }}>
            {dashboard ? `${dashboard.bandsIssued} / ${totalQuota ?? 0} bands issued` : 'Loading bands'}
          </span>
          <span style={{ marginLeft: 'auto', color: p.gold }}>
            {dashboard ? `${dashboard.bmsPending} not in BMS` : 'Loading BMS'}
          </span>
        </div>
      </header>

      {children}
    </div>
  )
}
