import { AaaScreen } from './aaa-screen'
import { DeskChrome } from '../desk-chrome'

export const dynamic = 'force-dynamic'

export default function AaaPage() {
  return (
    <DeskChrome>
      <AaaScreen />
    </DeskChrome>
  )
}
