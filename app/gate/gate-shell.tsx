'use client'

import { GateChrome } from './gate-chrome'

/** Mounted once by app/gate/layout.tsx so the nav survives the People/Vehicles switch. */
export function GateShell({ children }: { children: React.ReactNode }) {
  return <GateChrome>{children}</GateChrome>
}
