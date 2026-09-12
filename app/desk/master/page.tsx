import { DeskChrome } from '../desk-chrome'
import { MasterScreen } from './master-screen'

export const dynamic = 'force-dynamic'

export default function MasterPage() {
  return (
    <DeskChrome>
      <MasterScreen />
    </DeskChrome>
  )
}
