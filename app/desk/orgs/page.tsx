import { OrgsScreen } from './orgs-screen'

// ACC-027. Quota, status and the invite list must be current on every load —
// see docs/ARCHITECTURE.md's rendering table ("all /desk/* force-dynamic").
export const dynamic = 'force-dynamic'

export default function OrgsPage() {
  return <OrgsScreen />
}
