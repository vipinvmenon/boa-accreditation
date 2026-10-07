'use client'

import { GateChrome } from './gate-chrome'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { GateTabs, pendingTab, type TabSent } from './gate-tabs'

/**
 * Mounted once by app/gate/layout.tsx so the nav and the People / Vehicles
 * switch survive the switch: the pill slides on one element instead of being
 * handed between two copies that each page used to mount (twice on /gate:
 * its skeleton, then its panels).
 */
export function GateShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [sent, setSent] = useState<TabSent | null>(null)
  // The old screen stays up until the new route has rendered on the server.
  // Dim it and take its buttons away so a person's approval card is not
  // left live under the Vehicles tab (Vipin, 7 Oct).
  const pending = pendingTab(sent, pathname) !== null
  return (
    <GateChrome>
      <div className="gate-tabs-bar"><GateTabs sent={sent} onSend={setSent} /></div>
      <div className="gate-content" data-pending={pending ? '' : undefined} aria-busy={pending ? true : undefined} inert={pending}>{children}</div>
    </GateChrome>
  )
}
