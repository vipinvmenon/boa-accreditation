/**
 * ACC-149 — sync as soon as there is signal.
 *
 * Up to ten issuers' phones check people in, often offline (ADR-020). Two
 * phones can only warn each other about a band once both have talked to the
 * server, so when there is signal they must converge fast:
 *
 *   - the outbox drains on `online`, on the tab becoming visible, on start,
 *     and every DRAIN_INTERVAL_MS while anything is pending;
 *   - the roster + ledger re-pull every PULL_INTERVAL_MS while online, and
 *     straight after any drain that landed work — so a second phone shows
 *     amber "already issued" within about a minute.
 *
 * This module only decides WHEN. It never reads the network on the scan path
 * and never writes anything but the Dexie cache: every gate read is still
 * from Dexie and every write still goes through the outbox (non-negotiable #7,
 * docs/OFFLINE-SYNC.md). `drainOutbox` and `pullGate` are called, not changed.
 *
 * Guarantees:
 *   - Single-flight. One cycle (drain then pull) at a time; a trigger that
 *     arrives mid-cycle is coalesced into one follow-up cycle. A pull never
 *     overlaps a drain started here.
 *   - Backoff. A failed pull or a thrown drain retries after
 *     `nextAttemptDelayMs(failures)` — the outbox's own curve, capped at 60 s.
 *     Per-entry backoff stays inside the outbox (selectDrainBatch).
 *   - 401 means "needs login", never "drop". When the queue holds an
 *     auth-stopped entry (hasAuthStoppedEntry), a pull answers 401, or there
 *     are no credentials, timers stop draining and pulling. The queue is left
 *     exactly as it is. Only an explicit trigger (online, visible, start,
 *     syncNow — e.g. after a re-login) tries again, once.
 *
 * The core (`createSyncScheduler`) takes its IO as dependencies so it is
 * unit-tested with fake timers. `createGateSyncDeps` is the browser wiring.
 */
import { gateIssueResultSchema } from '@/lib/schemas/gate'
import { gateDb, ledgerRowSchema, metaRowSchema } from './db'
import { reviveLegacyFailures } from './outbox'
import { hasAuthStoppedEntry, nextAttemptDelayMs, type OutboxEntryState } from './outbox-policy'

export const TICK_MS = 5_000
export const DRAIN_INTERVAL_MS = 10_000
export const PULL_INTERVAL_MS = 45_000

export type SyncTrigger = 'start' | 'online' | 'visible' | 'manual' | 'timer'

export type SyncStatus = {
  online: boolean
  /** a drain or pull is in flight */
  syncing: boolean
  /** outbox entries still pending or syncing — the same count as queuedCount() */
  pending: number
  /**
   * outbox entries the server refused ('failed'). Kept on the phone, never
   * re-sent, and no longer blocking the queue, so the gate must say so: before
   * the 6 Oct fix nothing on screen showed them.
   */
  failed: number
  /** epoch ms of the last successful roster pull (persisted across reloads) */
  lastPullAt: number | null
  /** epoch ms of the last drain that left nothing pending (persisted) */
  lastDrainAt: number | null
  /** 401/no credentials: queue kept, sync paused until a login and a trigger */
  needsLogin: boolean
  lastError: string | null
}

export type SyncDeps = {
  drain: () => Promise<void>
  pull: () => Promise<void>
  /** outbox entries that are not done/resolved */
  readQueue: () => Promise<OutboxEntryState[]>
  hasCredentials: () => boolean
  isOnline: () => boolean
  isVisible: () => boolean
  now: () => number
  /** subscribe to browser triggers; returns an unsubscribe */
  subscribe: (listener: (trigger: 'online' | 'offline' | 'visible') => void) => () => void
  loadTimestamps?: () => Promise<{ lastPullAt: number | null; lastDrainAt: number | null }>
  saveTimestamps?: (patch: { lastPullAt?: number; lastDrainAt?: number }) => Promise<void>
  /** a pull or drain changed the cache; screens re-read their snapshot */
  onSynced?: () => void | Promise<void>
}

export type SyncScheduler = {
  start: () => void
  stop: () => void
  /** run a cycle now (coalesced if one is in flight) */
  syncNow: (trigger?: SyncTrigger) => Promise<void>
  getStatus: () => SyncStatus
  subscribe: (listener: (status: SyncStatus) => void) => () => void
}

/** A pull that the server refused for authentication, not for signal. */
export function isAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return /invalid_device|not_authenticated|not_authorized|unauthor|authentication required|(?:^|\D)401(?:\D|$)/i.test(message)
}

function isPending(entry: OutboxEntryState): boolean {
  return entry.status === 'pending' || entry.status === 'syncing'
}

export function createSyncScheduler(deps: SyncDeps): SyncScheduler {
  let status: SyncStatus = {
    online: deps.isOnline(),
    syncing: false,
    pending: 0,
    failed: 0,
    lastPullAt: null,
    lastDrainAt: null,
    needsLogin: false,
    lastError: null,
  }
  const listeners = new Set<(status: SyncStatus) => void>()
  let running = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe: (() => void) | null = null
  let inFlight: Promise<void> | null = null
  let followUp: SyncTrigger | null = null
  let nextDrainAt = 0
  let nextPullAt = 0
  let pullFailures = 0
  let drainFailures = 0
  let pullAuthFailed = false

  function emit(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch }
    for (const listener of listeners) listener(status)
  }

  function schedule() {
    if (!running) return
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void syncNow('timer')
    }, TICK_MS)
  }

  async function readQueueState(): Promise<{ pending: number; failed: number; authStopped: boolean }> {
    const queue = await deps.readQueue()
    return {
      pending: queue.filter(isPending).length,
      failed: queue.filter((entry) => entry.status === 'failed').length,
      authStopped: hasAuthStoppedEntry(queue),
    }
  }

  async function cycle(trigger: SyncTrigger): Promise<void> {
    const forced = trigger !== 'timer'
    const online = deps.isOnline()
    let queue = await readQueueState()
    const credentials = deps.hasCredentials()
    emit({ online, pending: queue.pending, failed: queue.failed, needsLogin: !credentials || queue.authStopped || pullAuthFailed })

    if (!online || !credentials) return
    // Paused on 401: timers do nothing; an explicit trigger tries once.
    if (status.needsLogin && !forced) return

    let changed = false
    const startedAt = deps.now()

    if (queue.pending > 0 && (forced || startedAt >= nextDrainAt)) {
      emit({ syncing: true })
      const before = queue.pending
      try {
        await deps.drain()
        drainFailures = 0
        nextDrainAt = startedAt + DRAIN_INTERVAL_MS
      } catch (error) {
        drainFailures += 1
        nextDrainAt = startedAt + nextAttemptDelayMs(drainFailures)
        emit({ lastError: error instanceof Error ? error.message : String(error) })
      }
      queue = await readQueueState()
      if (queue.authStopped) {
        // The queue is intact (drainOutbox kept every entry pending and did
        // not consume an attempt). Surface it and stop; do not pull either.
        emit({ syncing: false, pending: queue.pending, failed: queue.failed, needsLogin: true, lastError: 'authentication required' })
        return
      }
      if (queue.pending < before) changed = true
      if (queue.pending === 0) {
        const lastDrainAt = deps.now()
        emit({ lastDrainAt })
        await deps.saveTimestamps?.({ lastDrainAt })
      }
      emit({ pending: queue.pending, failed: queue.failed })
    }

    if (forced || changed || startedAt >= nextPullAt) {
      emit({ syncing: true })
      try {
        await deps.pull()
        pullFailures = 0
        pullAuthFailed = false
        nextPullAt = startedAt + PULL_INTERVAL_MS
        const lastPullAt = deps.now()
        emit({ lastPullAt, lastError: null, needsLogin: queue.authStopped })
        await deps.saveTimestamps?.({ lastPullAt })
        changed = true
      } catch (error) {
        if (isAuthError(error)) {
          pullAuthFailed = true
          emit({ needsLogin: true, lastError: 'authentication required' })
        } else {
          pullFailures += 1
          nextPullAt = startedAt + nextAttemptDelayMs(pullFailures)
          emit({ lastError: error instanceof Error ? error.message : String(error) })
        }
      }
    }

    emit({ syncing: false })
    if (changed) await deps.onSynced?.()
  }

  function syncNow(trigger: SyncTrigger = 'manual'): Promise<void> {
    if (inFlight) {
      // Coalesce: a forced trigger mid-cycle earns exactly one follow-up.
      if (trigger !== 'timer') followUp = trigger
      return inFlight
    }
    inFlight = cycle(trigger)
      .catch((error: unknown) => {
        // A Dexie read failing must not kill the loop; the next tick retries.
        emit({ syncing: false, lastError: error instanceof Error ? error.message : String(error) })
      })
      .finally(() => {
        inFlight = null
        schedule()
        const next = followUp
        followUp = null
        if (next && running) void syncNow(next)
      })
    return inFlight
  }

  return {
    start() {
      if (running) return
      running = true
      unsubscribe = deps.subscribe((event) => {
        if (event === 'offline') {
          emit({ online: false })
          return
        }
        if (event === 'visible' && !deps.isVisible()) return
        // A login may be what brought signal or the tab back; clear the
        // pull's auth flag so the forced cycle genuinely retries.
        pullAuthFailed = false
        void syncNow(event)
      })
      void (async () => {
        const persisted = await deps.loadTimestamps?.().catch(() => undefined)
        if (persisted) emit(persisted)
        if (running) await syncNow('start')
      })()
    },
    stop() {
      running = false
      if (timer !== null) clearTimeout(timer)
      timer = null
      unsubscribe?.()
      unsubscribe = null
      followUp = null
    },
    syncNow(trigger = 'manual') {
      if (trigger !== 'timer') pullAuthFailed = false
      return syncNow(trigger)
    },
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Restore ledger rows for outbox entries that completed while a pull was in
 * flight. `pullGate` replaces the ledger wholesale; a pull whose request left
 * before a concurrent drain landed returns a ledger without that issue, and the
 * entry is already `done`, so resolveScan would see neither — a GREEN for a
 * person this phone just banded. Only entries that turned `done` during this
 * pull are restored: anything done before the request left is already in the
 * server's answer (or correctly absent because the desk voided it).
 */
export async function pullAndReconcile(pull: () => Promise<unknown>): Promise<void> {
  const doneBefore = new Set(await gateDb.outbox.where('status').equals('done').primaryKeys())
  await pull()
  const doneNow = await gateDb.outbox.where('status').equals('done').toArray()
  const restored = doneNow
    .filter((entry) => !doneBefore.has(entry.id))
    .flatMap((entry) => {
      const parsed = gateIssueResultSchema.safeParse(entry.result)
      if (!parsed.success) return [] // a vehicle event or a {duplicate:true} reply
      const result = parsed.data
      if (result.kind === 'void') return []
      return [
        ledgerRowSchema.parse({
          id: result.id,
          personId: result.personId,
          kind: result.kind,
          occurredAt: result.occurredAt,
          bandSerial: result.bandSerial ?? undefined,
          stickerNo: result.stickerNo ?? undefined,
          gateLabel: result.gateLabel,
          volunteerName: result.volunteerName,
          isReissue: result.isReissue,
        }),
      ]
    })
  if (restored.length > 0) await gateDb.ledger.bulkPut(restored)
}

/**
 * Browser wiring. Credentials are supplied by the caller so the switch from
 * device tokens to a login session (ACC-150) changes only this call site.
 */
export function createGateSyncDeps(options: {
  drain: () => Promise<void>
  pull: () => Promise<unknown>
  hasCredentials: () => boolean
  onSynced?: () => void | Promise<void>
}): SyncDeps {
  return {
    drain: options.drain,
    pull: () => pullAndReconcile(options.pull),
    readQueue: async () => {
      await reviveLegacyFailures()
      return gateDb.outbox.where('status').anyOf('pending', 'syncing', 'failed').toArray()
    },
    hasCredentials: options.hasCredentials,
    isOnline: () => navigator.onLine,
    isVisible: () => document.visibilityState === 'visible',
    now: () => Date.now(),
    subscribe(listener) {
      const online = () => listener('online')
      const offline = () => listener('offline')
      const visible = () => listener('visible')
      window.addEventListener('online', online)
      window.addEventListener('offline', offline)
      document.addEventListener('visibilitychange', visible)
      return () => {
        window.removeEventListener('online', online)
        window.removeEventListener('offline', offline)
        document.removeEventListener('visibilitychange', visible)
      }
    },
    async loadTimestamps() {
      const [pull, drain] = await Promise.all([gateDb.meta.get('lastPullAt'), gateDb.meta.get('lastDrainAt')])
      return {
        lastPullAt: typeof pull?.value === 'number' ? pull.value : null,
        lastDrainAt: typeof drain?.value === 'number' ? drain.value : null,
      }
    },
    async saveTimestamps(patch) {
      const rows = Object.entries(patch).map(([key, value]) => metaRowSchema.parse({ key, value }))
      await gateDb.meta.bulkPut(rows)
    },
    ...(options.onSynced ? { onSynced: options.onSynced } : {}),
  }
}
