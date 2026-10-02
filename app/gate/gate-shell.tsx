'use client'

import { GateChrome } from './gate-chrome'
import { GateTabs } from './gate-tabs'

/**
 * Mounted once by app/gate/layout.tsx so the nav and the People / Vehicles
 * switch survive the switch: the pill slides on one element instead of being
 * handed between two copies that each page used to mount (twice on /gate:
 * its skeleton, then its panels).
 */
export function GateShell({ children }: { children: React.ReactNode }) {
  return (
    <GateChrome>
      <div className="gate-tabs-bar"><GateTabs /></div>
      {children}
    </GateChrome>
  )
}
