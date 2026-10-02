'use client'

import { useSyncExternalStore } from 'react'
import { SyncStatus } from './sync-status'

const noop = () => () => {}

/**
 * The one status row under the gate and vehicle cards (1 Oct review, item 5
 * and 24): when this phone last synced, always, quietly; and a second phrase
 * only when something needs the volunteer's attention. "Online, nothing to
 * send" and the operator's name (already in the nav avatar) are the normal
 * case and are not printed.
 */
export function GateStatus({ online, queued, canSync, onSynced }: {
  online: boolean
  queued: number
  canSync: boolean
  onSynced?: () => void | Promise<void>
}) {
  // /gate/vehicle is server-rendered, and Node's navigator has no onLine, so
  // the server would print "Offline" and the client "Online": the phrase is
  // drawn only once the browser can say which is true.
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const alert = !mounted ? null : !canSync
    ? `Not sending · sign in again${queued > 0 ? ` (${queued} waiting)` : ''}`
    : !online
      ? queued > 0 ? `Offline · ${queued} waiting to send` : 'Offline · keep scanning'
      : queued > 0 ? `Online · ${queued} waiting to send` : null
  return (
    <div className="gate-status mono">
      <SyncStatus {...(onSynced ? { onSynced } : {})} />
      {alert && <span className={canSync ? 'q wait' : 'q bad'}>{alert}</span>}
    </div>
  )
}
