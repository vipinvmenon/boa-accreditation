'use client'

import { usePathname } from 'next/navigation'
import { DeskChrome } from './desk-chrome'

/** Mounted once by app/desk/layout.tsx so the nav (and its pill) survives route changes. */
export function DeskShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (pathname.startsWith('/desk/login')) return <>{children}</>
  return <DeskChrome>{children}</DeskChrome>
}
