import { OrgsScreen } from './orgs-screen'
import { DeskChrome } from '../desk-chrome'

// ACC-027. Status and the per-org submitted/approved counts (ADR-019) must be
// current on every load — see docs/ARCHITECTURE.md's rendering table
// ("all /desk/* force-dynamic").
export const dynamic = 'force-dynamic'

export default function OrgsPage() {
  return (
    <DeskChrome>
      <OrgsScreen />
    </DeskChrome>
  )
}
