import type { Metadata } from 'next'
import { DeskChrome } from '../desk-chrome'
import { MasterScreen } from './master-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Master list' }

export default function MasterPage() {
  return (
    <DeskChrome>
      <MasterScreen />
    </DeskChrome>
  )
}
