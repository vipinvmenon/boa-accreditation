'use client'

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { drainOutbox, pullGate } from '@/gate/client'
import { readDeviceToken } from '@/gate/device-token'
import {
  createGateSyncDeps,
  createSyncScheduler,
  type SyncScheduler,
  type SyncStatus as SchedulerStatus,
} from '@/gate/sync-scheduler'

/**
 * ACC-149 — mounts the sync scheduler and renders "Last synced HH:MM · N
 * pending". One scheduler per page, shared by every mounted instance; it stops
 * when the last one unmounts. Credentials are read here (device token today,
 * the operator session after ACC-150) so that switch touches only this file.
 */
let shared: { scheduler: SyncScheduler; mounts: number } | null = null
const syncedListeners = new Set<() => void | Promise<void>>()

function acquire(): SyncScheduler {
  if (!shared) {
    const scheduler = createSyncScheduler(
      createGateSyncDeps({
        drain: async () => {
          const token = readDeviceToken()
          if (token) await drainOutbox(token)
        },
        pull: async () => {
          const token = readDeviceToken()
          if (!token) throw new Error('invalid_device')
          await pullGate(token)
        },
        hasCredentials: () => readDeviceToken() !== null,
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
