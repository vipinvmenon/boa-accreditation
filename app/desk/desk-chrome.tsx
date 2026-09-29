'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DESK_NAV } from '@/lib/design'
import { SiteFooter } from '@/components/site-footer'
import { dashboardSchema, type Dashboard } from '@/lib/schemas/dashboard'
import { operatorRowSchema, type OperatorRow } from '@/lib/schemas/operator'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { useDomTheme } from '@/lib/use-theme'
import { loginHref } from '@/gate/session'
import { Icon } from '@/components/icon'
import { LoadingSkeleton } from '@/components/loading-skeleton'
import { z } from 'zod'

const ROLE_LABEL: Record<OperatorRow['role'], string> = {
  lead: 'Lead',
  approver: 'Approver',
  admin: 'Admin',
  issuer: 'Issuer',
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
  const [meError, setMeError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    async function loadStatus() {
      try {
        const response = await fetch('/api/desk/dashboard')
        if (cancelled) return
        if (response.status === 401) {
          router.replace(loginHref(window.location.pathname + window.location.search))
          return
        }
        if (!response.ok) return
        const parsed = dashboardSchema.safeParse(await response.json())
        if (cancelled || !parsed.success) return
        // Only feeds the Master list nav badge (F3) — R8.shell has no
        // status bar to render the rest of this into (ACC-130/foundation).
        setDashboard(parsed.data)
      } catch {
        // A silent failure just means no badge; nothing else reads this.
      }
    }
    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    let cancelled = false
    async function loadMe() {
      try {
        const response = await fetch('/api/desk/operators')
        if (cancelled) return
        if (!response.ok) {
          setMeError(true)
          return
        }
        const parsed = operatorsResponseSchema.safeParse(await response.json())
        if (cancelled || !parsed.success) {
          if (!cancelled) setMeError(true)
          return
        }
        const own = parsed.data.operators.find((o) => o.user_id === parsed.data.callerId)
        if (!own) {
          setMeError(true)
          return
        }
        // ACC-150 (ADR-020): an issuer has no desk. Every desk RPC refuses them
        // in the database; this only saves them looking at empty screens.
        if (own.role === 'issuer') {
          router.replace('/gate')
          return
        }
        setMe(own)
        setMeError(false)
      } catch {
        if (!cancelled) setMeError(true)
      }
    }
    void loadMe()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
        profileButtonRef.current?.focus()
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        profileButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        mobileMenuButtonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  const activeNav = DESK_NAV.find((item) => item.href === pathname)?.id

  useLayoutEffect(() => {
    const links = document.getElementById('desk-links')
    const pip = links?.querySelector<HTMLElement>('.pip')
    if (!links || !pip) return

    const movePip = () => {
      const active = links.querySelector<HTMLElement>('[aria-current="page"]')
      if (!active) return
      pip.style.width = `${active.offsetWidth}px`
      pip.style.transform = `translateX(${active.offsetLeft}px)`
    }

    const previous = window.sessionStorage.getItem('boa-pip')
    if (previous) {
      try {
        const geometry = JSON.parse(previous) as { left?: number; width?: number }
        if (typeof geometry.left === 'number' && typeof geometry.width === 'number') {
          pip.style.width = `${geometry.width}px`
          pip.style.transform = `translateX(${geometry.left}px)`
        }
      } catch {
        window.sessionStorage.removeItem('boa-pip')
      }
    }

    let frame = 0
    let settleFrame = 0
    frame = requestAnimationFrame(() => {
      if (previous) {
        links.classList.add('pip-ready')
        settleFrame = requestAnimationFrame(movePip)
      } else {
        movePip()
        settleFrame = requestAnimationFrame(() => links.classList.add('pip-ready'))
      }
      window.sessionStorage.removeItem('boa-pip')
    })
    const observer = new ResizeObserver(movePip)
    observer.observe(links)
    window.addEventListener('resize', movePip)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(settleFrame)
      observer.disconnect()
      window.removeEventListener('resize', movePip)
    }
  }, [activeNav])

  function toggleTheme() {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark')
  }

  function closeProfileMenu() {
    setMenuOpen(false)
    profileButtonRef.current?.focus()
  }

  function closeMobileMenu() {
    setMobileOpen(false)
    mobileMenuButtonRef.current?.focus()
  }

  function rememberPip() {
    const links = document.getElementById('desk-links')
    const active = links?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!active) return
    window.sessionStorage.setItem('boa-pip', JSON.stringify({
      left: active.offsetLeft,
      width: active.offsetWidth,
    }))
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    await supabaseBrowser().auth.signOut()
    router.replace('/desk/login')
  }

  return (
    <div className={`r10 v2-app ${mobileOpen ? 'menu-open' : ''}`} data-theme={theme}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="ambient" aria-hidden="true" />
      <div className="app">
        <header className="nav-wrap">
          <nav className="island" aria-label="Desk navigation">
            <Link href="/desk" className="brand" aria-label="BOA Accreditation desk home">
              <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
            </Link>
            <div className="links" id="desk-links">
              <span className="pip" aria-hidden="true" />
              {DESK_NAV.map((item) => {
                const active = item.id === activeNav
                // F3: R8.shell's nav badge (design/source/r10/r8/ui.js:36,40)
                // only has a data source for Master (not-in-BMS). This also
                // carries the "not in BMS" deep link the removed status bar
                // (F4) used to offer (ACC-154, tests/e2e/org-filter.spec.ts)
                // — pointing the nav item itself at the filtered list only
                // while there is something outstanding to flag.
                const bmsPending = item.id === 'master' ? dashboard?.bmsPending : undefined
                const hasBadge = typeof bmsPending === 'number' && bmsPending > 0
                const href = hasBadge ? `${item.href}?in_bms=false` : item.href
                return (
                  <Link key={item.id} href={href} aria-current={active ? 'page' : undefined} onClick={rememberPip}>
                    {item.label}
                    {hasBadge && <span className="badge" aria-label={`${bmsPending} not in BMS`}>{bmsPending}</span>}
                  </Link>
                )
              })}
            </div>
            <div className="nav-end">
              <div ref={menuRef} className="profile-wrap">
                <button ref={profileButtonRef} type="button" className="av" onClick={() => {
                  if (menuOpen) {
                    closeProfileMenu()
                    return
                  }
                  setMobileOpen(false)
                  setMenuOpen(true)
                }} aria-controls="desk-profile-menu" aria-expanded={menuOpen} aria-label="Operator menu">
                  {me?.display_name?.slice(0, 2).toUpperCase() ?? 'VI'}
                </button>
                <div id="desk-profile-menu" aria-label="Operator menu" className="profile-menu" hidden={!menuOpen}>
                    <div className="profile-head"><strong>{me ? me.display_name : meError ? 'Operator' : <LoadingSkeleton width="86px" />}</strong><span>{me ? ROLE_LABEL[me.role] : meError ? '—' : <LoadingSkeleton width="52px" />}</span></div>
                    <button type="button" onClick={() => { toggleTheme(); closeProfileMenu() }}>
                      <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> Switch to {theme === 'dark' ? 'light' : 'dark'} theme
                    </button>
                    <Link href="/desk/users" onClick={closeProfileMenu}><i aria-hidden="true" className="ph-light ph-users-three" />Users</Link>
                    <button type="button" onClick={() => { closeProfileMenu(); void signOut() }} disabled={signingOut}><i aria-hidden="true" className="ph-light ph-sign-out" />{signingOut ? 'Signing out…' : 'Sign out'}</button>
                </div>
              </div>
              <button ref={mobileMenuButtonRef} type="button" className="burger" onClick={() => {
                if (mobileOpen) {
                  closeMobileMenu()
                } else {
                  setMenuOpen(false)
                  setMobileOpen(true)
                }
              }} aria-label="Menu" aria-controls="desk-menu" aria-expanded={mobileOpen}><i aria-hidden="true" className="ph-light ph-list" /></button>
            </div>
          </nav>
          {/* r10-foundation F4: R8.shell (design/source/r10/r8/ui.js) renders
              only the nav and the footer here — no status bar under the nav
              on any r8 screen. The build-date / bands-issued / not-in-BMS
              pill that used to sit here is removed; not-in-BMS now lives in
              the Master list badge above. */}
        </header>
        <div id="desk-menu" className="menu" aria-hidden={!mobileOpen} hidden={!mobileOpen} inert={!mobileOpen}>
          {DESK_NAV.map((item, index) => <Link key={item.id} href={item.href} aria-current={item.id === activeNav ? 'page' : undefined} tabIndex={mobileOpen ? 0 : -1} style={{ '--i': index } as React.CSSProperties} onClick={() => {
            closeMobileMenu()
          }}>{item.label}{item.id === 'master' && dashboard && dashboard.bmsPending > 0 && <span className="badge" aria-hidden="true">{dashboard.bmsPending}</span>}</Link>)}
        </div>
        <div className="frame page">{children}</div>
        <SiteFooter signedInAs={me ? `${me.display_name} (${ROLE_LABEL[me.role]})` : null} />
      </div>
    </div>
  )
}
