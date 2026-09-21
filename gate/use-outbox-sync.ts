'use client'

import { useCallback, useEffect, useState } from 'react'
import { drainOutbox, queuedCount } from './client'
import { readDeviceToken } from './device-token'

const DRAIN_INTERVAL_MS = 30_000

export type OutboxSync = {
  online: boolean
  queued: number
  /** false when this device has no token — queued work cannot sync until /gate/setup runs again */
  canSync: boolean
  /** drain now if online and a token exists, then refresh the count */
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
    const token = readDeviceToken()
    setCanSync(token !== null)
    if (token && navigator.onLine) {
      try {
        await drainOutbox(token)
        await onDrained?.()
      } catch {
        // drainOutbox records per-entry failures itself; a thrown error here
        // (e.g. fetch rejected mid-flight) just means "try again next tick".
      }
    }
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
