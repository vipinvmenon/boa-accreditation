'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
export type TabSent = { to: number; from: string }

/** The tab the pill was sent to, while the route it was sent from is still on screen. */
export function pendingTab(sent: TabSent | null, pathname: string): number | null {
  return sent && sent.from === pathname ? sent.to : null
}

export function GateTabs({ sent, onSend }: { sent: TabSent | null; onSend: (sent: TabSent | null) => void }) {
  const pathname = usePathname()
  const active = pathname.startsWith('/gate/vehicle') ? 1 : 0
  const pos = pendingTab(sent, pathname) ?? active

  return (
    <nav className="segmented" aria-label="Check in people or vehicles">
      <span className="seg-pip" data-pos={pos} aria-hidden="true" />
      {TABS.map((tab, index) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={index === active ? 'page' : undefined}
          data-on={index === pos ? '' : undefined}
          // Tapping the tab you are already on (e.g. People again, before
          // Vehicles has landed) must cancel the pending switch, or the old
          // screen stays dimmed and inert for good.
          onClick={() => onSend(index === active ? null : { to: index, from: pathname })}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
