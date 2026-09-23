'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { drainOutbox, pullGate } from '@/gate/client'
import {
  createGateSyncDeps,
  createSyncScheduler,
  type SyncScheduler,
  type SyncStatus as SchedulerStatus,
} from '@/gate/sync-scheduler'

/**
 * ACC-149 — mounts the sync scheduler and renders "Last synced HH:MM · N
 * pending". One scheduler per page, shared by every mounted instance; it stops
 * when the last one unmounts.
 *
 * ACC-150: the credential is the operator's session cookie, which rides every
 * same-origin request on its own. There is nothing to read and nothing the
 * page can check offline, so `hasCredentials` is always true and "needs
 * login" comes only from the server actually refusing a drain or a pull with
 * 401/403 — the queue is kept either way (docs/OFFLINE-SYNC.md).
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

function clock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * The line is laid out with zero height and drawn into existing whitespace
 * (`top` is its offset from where it is mounted), so adding it moves nothing
 * in the v2 contract's layout — the design has no slot for it, and
 * OFFLINE-SYNC.md asks for the pull time beside the roster count.
 */
export function SyncStatus({ onSynced, top }: { onSynced?: () => void | Promise<void>; top: number }) {
  const [status, setStatus] = useState<SchedulerStatus | null>(null)
  const onSyncedRef = useRef(onSynced)

  useEffect(() => {
    onSyncedRef.current = onSynced
  }, [onSynced])

  useEffect(() => {
    const scheduler = acquire()
    const listener = () => onSyncedRef.current?.()
    syncedListeners.add(listener)
    const unsubscribe = scheduler.subscribe(setStatus)
    const first = window.setTimeout(() => setStatus(scheduler.getStatus()), 0)
    return () => {
      window.clearTimeout(first)
      unsubscribe()
      syncedListeners.delete(listener)
      release()
    }
  }, [])

  const last = status === null ? '' : status.lastPullAt === null ? 'Not synced yet' : `Last synced ${clock(status.lastPullAt)}`
  const text = status === null ? '' : `${last} · ${status.pending} pending${status.needsLogin ? ' · sign in' : ''}`
  const line: CSSProperties = {
    position: 'absolute',
    top,
    left: 0,
    right: 0,
    margin: 0,
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: status?.needsLogin ? 'var(--gold)' : 'var(--ink3)',
  }
  return (
    <div style={{ position: 'relative', height: 0, margin: 0 }}>
      <p className="mono" data-sync-status role="status" aria-live="polite" title={text} style={line}>
        {text}
      </p>
    </div>
  )
}
