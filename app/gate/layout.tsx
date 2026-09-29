import type { Metadata } from 'next'
import { GateServiceWorker } from './register-sw'
import { GateShell } from './gate-shell'

export const dynamic = 'force-dynamic'

// ACC-127: app/gate/page.tsx is a Client Component ('use client', for the
// scanner/camera/outbox state) and cannot export its own `metadata` — only
// Server Components can. This layout's title is /gate's title by
// inheritance; app/gate/vehicle/page.tsx (a Server Component) overrides it
// with its own for that one child route.
export const metadata: Metadata = { title: 'Gate' }

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GateServiceWorker />
      <GateShell>{children}</GateShell>
    </>
  )
}
