import { DevicesScreen } from './devices-screen'
import { DeskChrome } from '../desk-chrome'

// ACC-045. Device state (revoked / last seen) must be current on every load —
// see docs/ARCHITECTURE.md's rendering table ("all /desk/* force-dynamic").
export const dynamic = 'force-dynamic'

export default function DevicesPage() {
  return (
    <DeskChrome>
      <DevicesScreen />
    </DeskChrome>
  )
}
