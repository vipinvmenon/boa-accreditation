import type { Metadata } from 'next'
import { UsersScreen } from './users-screen'

// ACC-049. Operator activation state must be current on every load — see
// docs/ARCHITECTURE.md's rendering table ("all /desk/* force-dynamic").
export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Users' }

export default function UsersPage() {
  return (
    <>
      <UsersScreen />
    </>
  )
}
