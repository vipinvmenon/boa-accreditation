'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DESK_NAV, GATE_NAV } from '@/lib/design'
import { useGateOperator, initialsOf, type GateOperator } from '@/gate/use-operator'
import { SiteFooter } from '@/components/site-footer'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { loginHref } from '@/gate/session'

/**
 * Only the three roles that can stand at a gate reach this chrome; the desk's
 * own ROLE_LABEL covers approvers too, which cannot be one of these.
 */
const GATE_ROLE_LABEL: Record<GateOperator['role'], string> = {
  issuer: 'Issuer',
  lead: 'Lead',
  admin: 'Admin',
}

export function GateChrome({
  children,
  bandsIssued = 0,
  approved = 0,
  bmsPending,
}: {
  children: React.ReactNode
  bandsIssued?: number
  approved?: number
  // ACC-190: no default. A caller with no Dexie-backed BMS count (the vehicle
  // screen) omits the prop rather than passing a fabricated number (D7), and
  // the status line below drops the "not in BMS" pill entirely when it is
  // absent instead of rendering it against a fake 0.
  bmsPending?: number
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const profileButtonRef = useRef<HTMLButtonElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const theme = useDomTheme()
  /**
   * ACC-132 drew a volunteer's chrome for anyone on /gate, so a lead or admin
   * who tapped Vehicle from the desk was stranded with no way back (Vipin,
   * 24 Sep). The chrome follows the PERSON now: a desk operator keeps the desk
   * navigation wherever they stand, and only an issuer gets the two-tab gate.
   * `null` while unknown draws the issuer view — the narrowest, so a
   * volunteer never sees desk links flash past on a slow boot.
   */
  const operator = useGateOperator()
  const isDeskOperator = operator !== null && operator.role !== 'issuer'
  const nav = isDeskOperator ? DESK_NAV : GATE_NAV
  const active = nav.find((item) => item.href === pathname)?.id

  function closeMobileMenu() {
    setMobileOpen(false)
    mobileMenuButtonRef.current?.focus()
  }

  function closeProfileMenu() {
    setProfileOpen(false)
    profileButtonRef.current?.focus()
  }

  function toggleTheme() {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark')
  }

  async function signOut() {
    if (signingOut) return
    setSigningOut(true)
    await supabaseBrowser().auth.signOut()
    // Back to the gate after the next sign-in: this is an issuer's whole app
    // (ACC-150). Queued work stays in the outbox and syncs once they are in.
    router.replace(loginHref())
  }

  useEffect(() => {
    if (!mobileOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeMobileMenu()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen])

  useEffect(() => {
    if (!profileOpen) return
    function onPointerDown(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node) && event.target !== profileButtonRef.current) {
        closeProfileMenu()
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeProfileMenu()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [profileOpen])

  useLayoutEffect(() => {
    const links = document.querySelector<HTMLElement>('.nav-wrap .links')
    const pip = links?.querySelector<HTMLElement>('.pip')
    if (!links || !pip) return

    const movePip = () => {
      const activeLink = links.querySelector<HTMLElement>('[aria-current="page"]')
      if (!activeLink) return
      pip.style.width = `${activeLink.offsetWidth}px`
      pip.style.transform = `translateX(${activeLink.offsetLeft}px)`
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
  }, [active])

  function rememberPip() {
    const links = document.querySelector<HTMLElement>('.nav-wrap .links')
    const activeLink = links?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!activeLink) return
    window.sessionStorage.setItem('boa-pip', JSON.stringify({
      left: activeLink.offsetLeft,
      width: activeLink.offsetWidth,
    }))
  }

  useEffect(() => {
    const root = mainRef.current
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
  }, [pathname])

  return (
    <div className={`v2-app ${mobileOpen ? 'menu-open' : ''} ${profileOpen ? 'profile-open' : ''}`}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className="frame">
        <header className="nav-wrap">
          <nav className="island" aria-label="Gate navigation">
            <Link href="/gate" className="brand" aria-label="Bangalore Open Air"><img src="/assets/boa-logo.png" alt="Bangalore Open Air" /><span>Accred<br />gate</span></Link>
            <div className="links"><span className="pip" aria-hidden="true" />{nav.map((item) => <Link key={item.id} href={item.href} aria-current={item.id === active ? 'page' : undefined} onClick={rememberPip}>{item.label}</Link>)}</div>
            <div className="nav-end"><div ref={profileMenuRef} className="profile-wrap"><button ref={profileButtonRef} type="button" className="av av-gate-target" onClick={() => { if (profileOpen) closeProfileMenu(); else { setMobileOpen(false); setProfileOpen(true) } }} aria-controls="gate-profile-menu" aria-expanded={profileOpen} aria-label="Operator menu">{operator ? initialsOf(operator.displayName) : '··'}</button><div id="gate-profile-menu" className="profile-menu" hidden={!profileOpen} aria-label="Operator menu"><div className="profile-head"><strong>{operator ? operator.displayName : 'Signed in'}</strong><span>{operator ? GATE_ROLE_LABEL[operator.role] : '—'}</span></div><button type="button" onClick={() => { toggleTheme(); closeProfileMenu() }}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /> Switch to {theme === 'dark' ? 'light' : 'dark'} theme</button>{isDeskOperator && <Link href="/desk/users" onClick={closeProfileMenu}>Manage users</Link>}<button type="button" disabled={signingOut} onClick={() => { closeProfileMenu(); void signOut() }}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div></div><button ref={mobileMenuButtonRef} type="button" className="burger" onClick={() => {
              if (mobileOpen) {
                closeMobileMenu()
              } else {
                setProfileOpen(false)
                setMobileOpen(true)
              }
            }} aria-label="Menu" aria-controls="gate-menu" aria-expanded={mobileOpen}><i /><i /></button></div>
          </nav>
          {/* ACC-130: the mock's "Live" pip was always on regardless of connectivity — the real
              connectivity signal (Online/Offline · N queued) already renders inside each
              gate/vehicle screen's own card, driven by useOutboxSync. */}
          <div className="status"><span className="hide-s">Build 05-09 Oct, show 10 Oct</span><span>{bandsIssued} / {approved} bands issued</span>{bmsPending !== undefined && <span className="warn">{bmsPending} not in BMS</span>}</div>
        </header>
        <div id="gate-menu" className="menu" aria-hidden={!mobileOpen} hidden={!mobileOpen} inert={!mobileOpen}>{nav.map((item, index) => <Link key={item.id} href={item.href} aria-current={item.id === active ? 'page' : undefined} tabIndex={mobileOpen ? 0 : -1} style={{ '--i': index } as React.CSSProperties} onClick={() => {
          closeMobileMenu()
        }}>{item.label}</Link>)}</div>
        <main id="main-content" tabIndex={-1} ref={mainRef}>{children}</main>
        <SiteFooter signedInAs={operator ? `${operator.displayName} (${GATE_ROLE_LABEL[operator.role]})` : null} />
      </div>
      {/*
        ACC-190/ACC-166: app/v2.css:104's .av is 38x38, short of the 44x44
        gate target (DESIGN.md "Do keep 44px hit areas, 56px at the gate";
        --hit in app/r10/tokens.css is also 44px). DeskChrome's root already
        carries "r10" (app/desk/desk-chrome.tsx), so app/r10/base.css's
        ".r10 .av, .r10 .burger { width/height: var(--hit) }" already fixes
        the desk's avatar for free. GateChrome's root is plain "v2-app" — no
        .r10 yet, that is ACC-189's job — so var(--hit) is not in scope here;
        44px is the same value, spelled out. styled-jsx's scoped (non-global)
        mode keeps this rule off desk-chrome.tsx's own ".av" regardless.
        Safe to delete once ACC-189 gives the gate chrome its own .r10 root.
      */}
      <style jsx>{`
        .av.av-gate-target { width: 44px; height: 44px; }
      `}</style>
    </div>
  )
}
