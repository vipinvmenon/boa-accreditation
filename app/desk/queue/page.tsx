import { QueueScreen } from './queue-screen'
import { DeskChrome } from '../desk-chrome'

export const dynamic = 'force-dynamic'

export default function QueuePage() {
  return (
    <DeskChrome>
      <QueueScreen />
    </DeskChrome>
  )
}
