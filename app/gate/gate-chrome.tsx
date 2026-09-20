'use client'

import Link from 'next/link'
import { useState } from 'react'
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
  const active = NAV.find((item) => item.href === pathname)?.id

  return (
    <div className={`v2-app ${mobileOpen ? 'menu-open' : ''}`}>
      <header className="nav-wrap">
        <nav className="island" aria-label="Gate navigation">
          <Link href="/gate" className="brand" aria-label="Bangalore Open Air"><img src="/assets/boa-logo.png" alt="Bangalore Open Air" /><span>Accred<br />desk</span></Link>
          <div className="links"><span className="pip" aria-hidden="true" />{NAV.map((item) => <Link key={item.id} href={item.href} aria-current={item.id === active ? 'page' : undefined}>{item.label}</Link>)}</div>
          <div className="nav-end"><div className="av" aria-label="Gate operator">GT</div><button type="button" className="burger" onClick={() => setMobileOpen((open) => !open)} aria-label="Menu" aria-expanded={mobileOpen}><i /><i /></button></div>
        </nav>
        <div className="status"><span className="live"><b />Live</span><span className="hide-s">Build 05–09 Oct · Show 10 Oct</span><span>{bandsIssued} / {approved} bands issued</span><span className="warn">{bmsPending} not in BMS</span></div>
      </header>
      <div className="menu" aria-hidden={!mobileOpen}>{NAV.map((item, index) => <Link key={item.id} href={item.href} aria-current={item.id === active ? 'page' : undefined} style={{ '--i': index } as React.CSSProperties} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}</div>
      <main><div className="g-shell">{children}</div></main>
      <SiteFooter />
    </div>
  )
}
