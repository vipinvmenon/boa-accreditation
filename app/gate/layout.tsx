import { GateServiceWorker } from './register-sw'

export const dynamic = 'force-static'

export default function GateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GateServiceWorker />
      {children}
    </>
  )
}
