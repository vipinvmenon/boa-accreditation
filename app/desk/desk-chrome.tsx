'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { NAV } from '@/lib/design'
import { SiteFooter } from '@/components/site-footer'
import { dashboardSchema, type Dashboard } from '@/lib/schemas/dashboard'
import { operatorRowSchema, type OperatorRow } from '@/lib/schemas/operator'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { z } from 'zod'

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
  const [mobileOpen, setMobileOpen] = useState(false)
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
    <div className={`v2-app ${mobileOpen ? 'menu-open' : ''}`}>
      <div className="frame">
        <header className="nav-wrap">
          <nav className="island" aria-label="Desk navigation">
            <Link href="/desk" className="brand" aria-label="BOA Accreditation desk home">
              <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
              <span>Accred<br />desk</span>
            </Link>
            <div className="links" id="desk-links">
              <span className="pip" aria-hidden="true" />
              {NAV.map((item) => {
                const active = item.id === activeNav
                return <Link key={item.id} href={item.href} aria-current={active ? 'page' : undefined}>{item.label}</Link>
              })}
            </div>
            <div className="nav-end">
              <div ref={menuRef} className="profile-wrap">
                <button type="button" className="av" onClick={() => setMenuOpen((open) => !open)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Operator menu">
                  {me?.display_name?.slice(0, 2).toUpperCase() ?? 'AV'}
                </button>
                {menuOpen && (
                  <div role="menu" aria-label="Operator menu" className="profile-menu">
                    <div className="profile-head"><strong>{me?.display_name ?? 'Loading…'}</strong><span>{me ? ROLE_LABEL[me.role] : ''}</span></div>
                    <button type="button" role="menuitem" onClick={() => { toggleTheme(); setMenuOpen(false) }}>
                      <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                    </button>
                    <Link href="/desk/users" role="menuitem" onClick={() => setMenuOpen(false)}>Manage users</Link>
                    <button type="button" role="menuitem" onClick={() => void signOut()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
                  </div>
                )}
              </div>
              <button type="button" className="burger" onClick={() => setMobileOpen((open) => !open)} aria-label="Menu" aria-expanded={mobileOpen}><i /><i /></button>
            </div>
          </nav>
          <div className="status">
            <span className="live"><b />Live</span>
            <span className="hide-s">Build 05–09 Oct · Show 10 Oct</span>
            <span>{dashboard ? `${dashboard.bandsIssued} / ${dashboard.approvedTotal} bands issued` : 'Loading bands'}</span>
            <Link href="/desk/master?in_bms=false" className="warn">{dashboard ? `${dashboard.bmsPending} not in BMS` : 'Loading BMS'}</Link>
          </div>
        </header>
        <div className="menu" aria-hidden={!mobileOpen}>
          {NAV.map((item, index) => <Link key={item.id} href={item.href} aria-current={item.id === activeNav ? 'page' : undefined} style={{ '--i': index } as React.CSSProperties} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}
        </div>
        {children}
        <SiteFooter />
      </div>
    </div>
  )
}
