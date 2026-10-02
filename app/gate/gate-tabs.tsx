'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

const TABS = [
  { href: '/gate', label: 'People' },
  { href: '/gate/vehicle', label: 'Vehicles' },
] as const

/**
 * The People / Vehicles switch (r8-gate.html, r8-vehicle.html). Mounted once
 * by the gate layout (gate-shell.tsx), so it is the same element on both
 * routes and the pill is one CSS transition. The pill moves on the tap, not
 * when the route lands (/gate/vehicle is server-rendered and takes a moment);
 * the route then agrees with it (Vipin, 29 Sep: "make the people vehicle
 * switcher smooth").
 */
export function GateTabs() {
  const pathname = usePathname()
  const active = pathname.startsWith('/gate/vehicle') ? 1 : 0
  /** Where the pill was sent, for the route it was sent from. */
  const [sent, setSent] = useState<{ to: number; from: string } | null>(null)
  const pos = sent && sent.from === pathname ? sent.to : active

  return (
    <nav className="segmented" aria-label="Check in people or vehicles">
      <span className="seg-pip" data-pos={pos} aria-hidden="true" />
      {TABS.map((tab, index) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={index === active ? 'page' : undefined}
          data-on={index === pos ? '' : undefined}
          onClick={() => { if (index !== active) setSent({ to: index, from: pathname }) }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
