import { PassesScreen } from './passes-screen'
import { DeskChrome } from '../desk-chrome'

// The nonce CSP is request-scoped. A static shell would be emitted without
// nonce attributes, so strict-dynamic would reject every client chunk.
export const dynamic = 'force-dynamic'

export default function PassesPage() {
  return (
    <DeskChrome>
      <PassesScreen />
    </DeskChrome>
  )
}
