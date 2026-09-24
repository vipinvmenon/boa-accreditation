import type { Metadata } from 'next'
import { ControlRoomScreen } from './control-room-screen'
import { DeskChrome } from './desk-chrome'

// ACC-033. Every number is live from boa_acc_desk_dashboard() on every load —
// see docs/ARCHITECTURE.md's rendering table ("all /desk/* force-dynamic").
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Control room' }

export default function DeskIndexPage() {
  return (
    <DeskChrome>
      <ControlRoomScreen />
    </DeskChrome>
  )
}
