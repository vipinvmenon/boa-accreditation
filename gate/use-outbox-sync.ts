'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { drainOutbox, pullGate } from './client'
import {
  createGateSyncDeps,
  createSyncScheduler,
  type SyncScheduler,
  type SyncStatus as SchedulerStatus,
} from './sync-scheduler'

export type OutboxSync = {
  online: boolean
  queued: number
  /** entries the server refused: kept on this phone, not sent again */
  failed: number
  /** false when the server refused the last drain (401/403): queued work waits for a login */
  canSync: boolean
  /** the scheduler's full status, for callers that need more than the fields above (e.g. SyncStatus's "last synced" line) */
  status: SchedulerStatus | null
  /** run a cycle now (drain, then pull) */
  sync: () => Promise<void>
  /** re-read the current status without necessarily draining anything new */
  refresh: () => Promise<void>
}

/**
 * ACC-133: one shared outbox-status hook for every gate screen, replacing the
 * two independent implementations that used to run side by side — this
 * hook's own 30 s poll (pre-ACC-133) and gate/sync-scheduler.ts's scheduler
 * (mounted separately by SyncStatus). Both called drainOutbox/pullGate on
 * their own timers, so a gate screen ran two overlapping sync loops.
 *
 * There is exactly one gate/sync-scheduler.ts scheduler per tab (ACC-149's
 * singleton, ref-counted below), shared by every mounted instance of this
 * hook — including the one SyncStatus (app/gate/sync-status.tsx) now uses
 * internally instead of keeping its own copy. It starts on the first mount
 * and stops when the last one unmounts.
 *
 * ACC-150: the credential is the operator's session cookie, which rides
 * every same-origin request on its own. There is nothing to read and
 * nothing the page can check offline, so `hasCredentials` is always true and
 * "needs login" comes only from the server actually refusing a drain or a
 * pull with 401/403 — the queue is kept either way (docs/OFFLINE-SYNC.md).
 */
let shared: { scheduler: SyncScheduler; mounts: number } | null = null
const syncedListeners = new Set<() => void | Promise<void>>()

function acquire(): SyncScheduler {
  if (!shared) {
    const scheduler = createSyncScheduler(
      createGateSyncDeps({
        drain: () => drainOutbox(),
        pull: () => pullGate(),
        hasCredentials: () => true,
        onSynced: async () => {
          await Promise.all([...syncedListeners].map((listener) => listener()))
        },
      }),
    )
    shared = { scheduler, mounts: 0 }
    scheduler.start()
  }
  shared.mounts += 1
  return shared.scheduler
}

function release() {
  if (!shared) return
  shared.mounts -= 1
  if (shared.mounts === 0) {
    shared.scheduler.stop()
    shared = null
  }
}

export function useOutboxSync(onSynced?: () => void | Promise<void>): OutboxSync {
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const schedulerRef = useRef<SyncScheduler | null>(null)
  const onSyncedRef = useRef(onSynced)

  useEffect(() => {
    onSyncedRef.current = onSynced
  }, [onSynced])

  useEffect(() => {
    const scheduler = acquire()
    schedulerRef.current = scheduler
    const listener = () => onSyncedRef.current?.()
    syncedListeners.add(listener)
    const unsubscribe = scheduler.subscribe(setStatus)
    const first = window.setTimeout(() => setStatus(scheduler.getStatus()), 0)
    return () => {
      window.clearTimeout(first)
      unsubscribe()
      syncedListeners.delete(listener)
      schedulerRef.current = null
      release()
    }
  }, [])

  // 'manual' is a forced trigger (gate/sync-scheduler.ts's `forced`): it
  // always re-reads the queue (so the caller's pending count is current)
  // and drains/pulls immediately rather than waiting for the next tick.
  const sync = useCallback(async () => {
    await schedulerRef.current?.syncNow('manual')
  }, [])
  const refresh = sync

  return {
    online: status?.online ?? (typeof navigator !== 'undefined' ? navigator.onLine : true),
    queued: status?.pending ?? 0,
    failed: status?.failed ?? 0,
    canSync: !(status?.needsLogin ?? false),
    status,
    sync,
    refresh,
  }
}
