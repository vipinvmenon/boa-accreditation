// @vitest-environment node
import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { gateDb } from './db'
import type { OutboxEntryState } from './outbox-policy'
import {
  DRAIN_INTERVAL_MS,
  PULL_INTERVAL_MS,
  TICK_MS,
  createSyncScheduler,
  isAuthError,
  pullAndReconcile,
  type SyncDeps,
} from './sync-scheduler'

type Trigger = 'online' | 'offline' | 'visible'

function entry(id: string, patch: Partial<OutboxEntryState> = {}): OutboxEntryState {
  return {
    id,
    idempotencyKey: `${id}-key`,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Number(id.replace(/\D/g, '')) || 1,
    ...patch,
  }
}

/** A fake device: an outbox array, a network switch and a trigger bus. */
function harness(options: { queue?: OutboxEntryState[]; credentials?: boolean } = {}) {
  const state = {
    online: true,
    visible: true,
    credentials: options.credentials ?? true,
    queue: options.queue ?? [],
    listener: null as ((trigger: Trigger) => void) | null,
    saved: [] as Array<{ lastPullAt?: number; lastDrainAt?: number }>,
  }
  const drain = vi.fn(async () => {
    state.queue = state.queue.map((row) => (row.status === 'pending' ? { ...row, status: 'done' as const } : row))
  })
  const pull = vi.fn(async () => {})
  const onSynced = vi.fn()
  const deps: SyncDeps = {
    drain,
    pull,
    readQueue: async () => state.queue.filter((row) => row.status !== 'done' && row.status !== 'resolved'),
    hasCredentials: () => state.credentials,
    isOnline: () => state.online,
    isVisible: () => state.visible,
    now: () => Date.now(),
    subscribe: (listener) => {
      state.listener = listener
      return () => {
        state.listener = null
      }
    },
    loadTimestamps: async () => ({ lastPullAt: null, lastDrainAt: null }),
    saveTimestamps: async (patch) => {
      state.saved.push(patch)
    },
    onSynced,
  }
  const scheduler = createSyncScheduler(deps)
  const fire = async (trigger: Trigger) => {
    state.listener?.(trigger)
    await vi.advanceTimersByTimeAsync(0)
  }
  return { state, drain, pull, onSynced, scheduler, fire }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-10T09:00:00+05:30'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('sync scheduler (ACC-149)', () => {
  it('drains and pulls on start, then re-pulls on the timer while online', async () => {
    const { scheduler, drain, pull, state } = harness({ queue: [entry('e1')] })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(scheduler.getStatus()).toMatchObject({ pending: 0, needsLogin: false })
    expect(scheduler.getStatus().lastPullAt).toBe(Date.now())
    expect(state.saved).toContainEqual({ lastDrainAt: Date.now() })

    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS - TICK_MS)
    expect(pull).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(pull).toHaveBeenCalledTimes(2)
    // Nothing pending: the drain timer does not post empty drains.
    expect(drain).toHaveBeenCalledTimes(1)
    scheduler.stop()
  })

  it('drains every ~10 s while work is pending and pulls straight after a drain lands', async () => {
    const { scheduler, drain, pull, state, onSynced } = harness()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)

    state.queue = [entry('e2')]
    await vi.advanceTimersByTimeAsync(DRAIN_INTERVAL_MS)
    expect(drain).toHaveBeenCalledTimes(1)
    // The drain landed work, so the ledger other phones wrote is fetched now,
    // not 45 s later.
    expect(pull).toHaveBeenCalledTimes(2)
    expect(onSynced).toHaveBeenCalled()
    scheduler.stop()
  })

  it('counts refused (failed) entries apart from pending ones, and keeps pulling (6 Oct)', async () => {
    const { scheduler, pull, state } = harness({ queue: [entry('e1', { status: 'failed', lastError: 'HTTP 404: {"error":"not_found"}' }), entry('e2')] })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scheduler.getStatus()).toMatchObject({ pending: 0, failed: 1, needsLogin: false })
    expect(pull).toHaveBeenCalledTimes(1)
    expect(state.queue.find((row) => row.id === 'e2')?.status).toBe('done')
    scheduler.stop()
  })

  it('does nothing offline and syncs immediately on the online event', async () => {
    const { scheduler, drain, pull, state, fire } = harness({ queue: [entry('e1'), entry('e2')] })
    state.online = false
    scheduler.start()
    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS * 2)
    expect(drain).not.toHaveBeenCalled()
    expect(pull).not.toHaveBeenCalled()
    expect(scheduler.getStatus()).toMatchObject({ online: false, pending: 2 })

    state.online = true
    await fire('online')
    expect(drain).toHaveBeenCalledTimes(1)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(scheduler.getStatus()).toMatchObject({ online: true, pending: 0 })

    await fire('offline')
    expect(scheduler.getStatus().online).toBe(false)
    scheduler.stop()
  })

  it('syncs when the tab becomes visible, not when it is hidden', async () => {
    const { scheduler, pull, state, fire } = harness()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)
    state.visible = false
    await fire('visible')
    expect(pull).toHaveBeenCalledTimes(1)
    state.visible = true
    await fire('visible')
    expect(pull).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('is single-flight: overlapping triggers never run two drains or pulls at once', async () => {
    const { scheduler, drain, pull, state } = harness({ queue: [entry('e1')] })
    let concurrent = 0
    let maxConcurrent = 0
    const slow = (fn: () => Promise<void>) => async () => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 1_000))
      await fn()
      concurrent -= 1
    }
    drain.mockImplementation(slow(async () => {
      state.queue = state.queue.map((row) => ({ ...row, status: 'done' as const }))
    }))
    pull.mockImplementation(slow(async () => {}))

    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    void scheduler.syncNow('online')
    void scheduler.syncNow('visible')
    void scheduler.syncNow('manual')
    await vi.advanceTimersByTimeAsync(5_000)

    expect(maxConcurrent).toBe(1)
    expect(drain).toHaveBeenCalledTimes(1)
    // The start cycle plus exactly one coalesced follow-up, not three.
    expect(pull).toHaveBeenCalledTimes(2)
    scheduler.stop()
  })

  it('backs off a failing pull on the outbox curve and recovers', async () => {
    const { scheduler, pull } = harness()
    pull.mockRejectedValue(new Error('pull_failed'))
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(scheduler.getStatus().lastError).toBe('pull_failed')
    expect(scheduler.getStatus().lastPullAt).toBeNull()

    // failure 1 -> nextAttemptDelayMs(1) = 2 s: the next 5 s tick retries.
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(pull).toHaveBeenCalledTimes(2)
    // failure 2 -> 4 s; failure 3 -> 8 s: the 5 s tick after it is skipped.
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(pull).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(pull).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(TICK_MS)
    expect(pull).toHaveBeenCalledTimes(4)

    pull.mockResolvedValue(undefined)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(scheduler.getStatus().lastError).toBeNull()
    expect(scheduler.getStatus().lastPullAt).not.toBeNull()
    scheduler.stop()
  })

  it('a 401 on drain stops draining and pulling, keeps every entry, and waits for a trigger', async () => {
    const queue = [entry('e1'), entry('e2'), entry('e3')]
    const { scheduler, drain, pull, state, fire } = harness({ queue })
    // What drainOutbox does on a 401: the head stays pending, attempts
    // untouched, lastError marks it auth-stopped; nothing behind it is sent.
    drain.mockImplementation(async () => {
      state.queue = state.queue.map((row, index) =>
        index === 0 ? { ...row, status: 'pending' as const, lastError: 'authentication required' } : row,
      )
    })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(pull).not.toHaveBeenCalled()
    expect(scheduler.getStatus()).toMatchObject({ needsLogin: true, pending: 3 })

    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS * 3)
    expect(drain).toHaveBeenCalledTimes(1)
    expect(pull).not.toHaveBeenCalled()
    expect(state.queue.map((row) => [row.id, row.status, row.attempts])).toEqual([
      ['e1', 'pending', 0],
      ['e2', 'pending', 0],
      ['e3', 'pending', 0],
    ])

    // Re-login, then signal/visibility: one explicit retry drains everything.
    drain.mockImplementation(async () => {
      state.queue = state.queue.map((row) => ({ ...row, status: 'done' as const, lastError: undefined }))
    })
    await fire('visible')
    expect(drain).toHaveBeenCalledTimes(2)
    expect(pull).toHaveBeenCalledTimes(1)
    expect(scheduler.getStatus()).toMatchObject({ needsLogin: false, pending: 0 })
    scheduler.stop()
  })

  it('a 401 on pull pauses the timer and surfaces needsLogin', async () => {
    const { scheduler, pull } = harness()
    pull.mockRejectedValue(new Error('invalid_device'))
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(scheduler.getStatus().needsLogin).toBe(true)
    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS * 3)
    expect(pull).toHaveBeenCalledTimes(1)

    pull.mockResolvedValue(undefined)
    await scheduler.syncNow('manual')
    expect(pull).toHaveBeenCalledTimes(2)
    expect(scheduler.getStatus().needsLogin).toBe(false)
    scheduler.stop()
  })

  it('without credentials it never calls the network and says so', async () => {
    const { scheduler, drain, pull } = harness({ queue: [entry('e1')], credentials: false })
    scheduler.start()
    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS)
    expect(drain).not.toHaveBeenCalled()
    expect(pull).not.toHaveBeenCalled()
    expect(scheduler.getStatus()).toMatchObject({ needsLogin: true, pending: 1 })
    scheduler.stop()
  })

  it('stop() cancels the timer and the trigger subscription', async () => {
    const { scheduler, pull, state } = harness()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(0)
    scheduler.stop()
    expect(state.listener).toBeNull()
    await vi.advanceTimersByTimeAsync(PULL_INTERVAL_MS * 2)
    expect(pull).toHaveBeenCalledTimes(1)
  })

  it('recognises the gate routes’ auth refusals', () => {
    expect(isAuthError(new Error('invalid_device'))).toBe(true)
    expect(isAuthError(new Error('HTTP 401'))).toBe(true)
    expect(isAuthError(new Error('pull_failed'))).toBe(false)
    expect(isAuthError(new Error('empty_roster'))).toBe(false)
  })
})

describe('pullAndReconcile (ACC-149)', () => {
  const personId = '11111111-1111-4111-8111-111111111111'
  const issueId = '55555555-5555-4555-8555-555555555555'
  const result = {
    id: issueId,
    personId,
    kind: 'wristband',
    idempotencyKey: issueId,
    bandSerial: '0412',
    stickerNo: null,
    vehicleReg: null,
    operatorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    gateLabel: 'Check-in',
    volunteerName: 'Ravi',
    occurredAt: '2026-10-10T09:00:00+05:30',
    postedAt: '2026-10-10T09:00:01+05:30',
    isReissue: false,
    supervisorNote: null,
    voidsCheckinId: null,
  }

  beforeEach(async () => {
    vi.useRealTimers()
    await gateDb.delete()
    await gateDb.open()
  })

  it('restores an issue that a concurrent drain landed while the pull was in flight', async () => {
    await gateDb.outbox.put({
      id: issueId,
      kind: 'wristband',
      idempotencyKey: issueId,
      status: 'pending',
      nextAttemptAt: 0,
      createdAt: 1,
      payload: {},
      attempts: 0,
    })
    await pullAndReconcile(async () => {
      // The drain finishes mid-pull...
      await gateDb.outbox.update(issueId, { status: 'done', result })
      // ...then the pull's stale answer replaces the ledger without it.
      await gateDb.ledger.clear()
    })
    const ledger = await gateDb.ledger.toArray()
    expect(ledger.map((row) => [row.id, row.kind, row.bandSerial])).toEqual([[issueId, 'wristband', '0412']])
  })

  it('does not resurrect an issue that was done before the pull (the server may have voided it)', async () => {
    await gateDb.outbox.put({
      id: issueId,
      kind: 'wristband',
      idempotencyKey: issueId,
      status: 'done',
      nextAttemptAt: 0,
      createdAt: 1,
      payload: {},
      result,
      attempts: 0,
    })
    await pullAndReconcile(async () => {
      await gateDb.ledger.clear()
    })
    expect(await gateDb.ledger.count()).toBe(0)
  })
})
