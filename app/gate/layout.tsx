import { GateServiceWorker } from './register-sw'

export const dynamic = 'force-dynamic'

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GateServiceWorker />
      {children}
    </>
  )
}
