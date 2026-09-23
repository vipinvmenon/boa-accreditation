'use client'

import { useCallback, useEffect, useState } from 'react'
import { drainOutbox, needsLogin, queuedCount } from './client'

const DRAIN_INTERVAL_MS = 30_000

export type OutboxSync = {
  online: boolean
  queued: number
  /** false when the server refused the last drain (401/403): queued work waits for a login */
  canSync: boolean
  /** drain now if online, then refresh the count */
  sync: () => Promise<void>
  refresh: () => Promise<void>
}

/**
 * One outbox status for every gate screen (ACC-109/ACC-113). Before this the
 * gate drained only right after an issue and the vehicle screen never
 * drained at all. Now: drain on mount, on the browser's `online` event, and
 * every 30 s. Every read still comes from Dexie and every write still goes
 * through the outbox (docs/OFFLINE-SYNC.md, non-negotiable #7) — this only
 * decides *when* the existing drainOutbox runs.
 */
export function useOutboxSync(onDrained?: () => void | Promise<void>): OutboxSync {
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine)
  const [queued, setQueued] = useState(0)
  const [canSync, setCanSync] = useState(true)

  const refresh = useCallback(async () => {
    setQueued(await queuedCount())
  }, [])

  const sync = useCallback(async () => {
    if (navigator.onLine) {
      try {
        await drainOutbox()
        await onDrained?.()
      } catch {
        // drainOutbox records per-entry failures itself; a thrown error here
        // (e.g. fetch rejected mid-flight) just means "try again next tick".
      }
    }
    // ACC-150: the credential is the session cookie, so "can this sync?" is
    // answered by what the server said, not by what this device holds — a
    // 401/403 leaves every entry queued (gate/outbox-policy.ts).
    setCanSync(!(await needsLogin()))
    await refresh()
  }, [onDrained, refresh])

  useEffect(() => {
    const updateOnline = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine) void sync()
    }
    const first = window.setTimeout(() => void sync(), 0)
    const timer = window.setInterval(() => void sync(), DRAIN_INTERVAL_MS)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [sync])

  return { online, queued, canSync, sync, refresh }
}
