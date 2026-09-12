import { ControlRoomScreen } from './control-room-screen'

// ACC-033. Every number is live from boa_acc_desk_dashboard() on every load —
// see docs/ARCHITECTURE.md's rendering table ("all /desk/* force-dynamic").
export const dynamic = 'force-dynamic'

export default function DeskIndexPage() {
  return <ControlRoomScreen />
}
