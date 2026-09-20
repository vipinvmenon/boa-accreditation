'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { NAV } from '@/lib/design'
import { SiteFooter } from '@/components/site-footer'

export function GateChrome({
  children,
  bandsIssued = 0,
  approved = 0,
  bmsPending = 0,
}: {
  children: React.ReactNode
  bandsIssued?: number
  approved?: number
  bmsPending?: number
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const active = NAV.find((item) => item.href === pathname)?.id

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
    <div className={`v2-app ${mobileOpen ? 'menu-open' : ''}`}>
      <div className="frame">
        <header className="nav-wrap">
          <nav className="island" aria-label="Gate navigation">
            <Link href="/gate" className="brand" aria-label="Bangalore Open Air"><img src="/assets/boa-logo.png" alt="Bangalore Open Air" /><span>Accred<br />desk</span></Link>
            <div className="links"><span className="pip" aria-hidden="true" />{NAV.map((item) => <Link key={item.id} href={item.href} aria-current={item.id === active ? 'page' : undefined}>{item.label}</Link>)}</div>
            <div className="nav-end"><div className="av" aria-label="Gate operator">GT</div><button ref={mobileMenuButtonRef} type="button" className="burger" onClick={() => {
              if (mobileOpen) {
                setMobileOpen(false)
                mobileMenuButtonRef.current?.focus()
              } else {
                setMobileOpen(true)
              }
            }} aria-label="Menu" aria-controls="gate-menu" aria-expanded={mobileOpen}><i /><i /></button></div>
          </nav>
          <div className="status"><span className="live"><b />Live</span><span className="hide-s">Build 05-09 Oct, show 10 Oct</span><span>{bandsIssued} / {approved} bands issued</span><span className="warn">{bmsPending} not in BMS</span></div>
        </header>
        <div id="gate-menu" className="menu" aria-hidden={!mobileOpen} hidden={!mobileOpen} inert={!mobileOpen}>{NAV.map((item, index) => <Link key={item.id} href={item.href} aria-current={item.id === active ? 'page' : undefined} tabIndex={mobileOpen ? 0 : -1} style={{ '--i': index } as React.CSSProperties} onClick={() => {
          setMobileOpen(false)
          mobileMenuButtonRef.current?.focus()
        }}>{item.label}</Link>)}</div>
        <main ref={mainRef}>{children}</main>
        <SiteFooter />
      </div>
    </div>
  )
}
