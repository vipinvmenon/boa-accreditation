// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  classifyFailure,
  failureMessage,
  hasAuthStoppedEntry,
  isTerminal,
  MAX_ATTEMPTS,
  nextAttemptDelayMs,
  selectDrainBatch,
  type OutboxEntryState,
} from './outbox-policy'
import { RequestTimeoutError } from './fetch-timeout'

const NOW = 1_760_000_000_000
const KEY = '44444444-4444-4444-8444-444444444444'

function entry(overrides: Partial<OutboxEntryState> & { id: string }): OutboxEntryState {
  return {
    idempotencyKey: KEY,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: NOW - 1_000,
    createdAt: NOW - 10_000,
    ...overrides,
  }
}

describe('selectDrainBatch', () => {
  it('drains in creation order and preserves the action key', () => {
    const batch = selectDrainBatch(
      [
        entry({ id: 'reissue', createdAt: NOW - 5_000, idempotencyKey: '55555555-5555-4555-8555-555555555555' }),
        entry({ id: 'issue', createdAt: NOW - 9_000 }),
      ],
      NOW,
    )

    expect(batch.map((item) => item.id)).toEqual(['issue', 'reissue'])
    expect(batch[0]?.idempotencyKey).toBe(KEY)
  })

  it('stops at the first entry in backoff', () => {
    expect(
      selectDrainBatch(
        [
          entry({ id: 'issue', createdAt: NOW - 9_000, attempts: 1, nextAttemptAt: NOW + 30_000 }),
          entry({ id: 'reissue', createdAt: NOW - 5_000 }),
        ],
        NOW,
      ),
    ).toEqual([])
  })

  it('skips a failed entry: the server has answered it, so it holds nothing back (6 Oct)', () => {
    expect(
      selectDrainBatch(
        [
          entry({ id: 'failed', status: 'failed', attempts: MAX_ATTEMPTS }),
          entry({ id: 'later', createdAt: NOW }),
        ],
        NOW,
      ).map((item) => item.id),
    ).toEqual(['later'])
  })

  it('keeps retrying a pending entry past MAX_ATTEMPTS (no signal is never terminal)', () => {
    expect(
      selectDrainBatch([entry({ id: 'waiting', attempts: MAX_ATTEMPTS + 12 })], NOW).map((item) => item.id),
    ).toEqual(['waiting'])
  })

  it('stops at syncing work', () => {
    expect(
      selectDrainBatch(
        [entry({ id: 'syncing', status: 'syncing' }), entry({ id: 'later', createdAt: NOW })],
        NOW,
      ),
    ).toEqual([])
  })

  it('skips retained completed evidence and ties deterministically', () => {
    const batch = selectDrainBatch(
      [
        entry({ id: 'done', status: 'done', createdAt: NOW - 10_000 }),
        entry({ id: 'b', createdAt: NOW }),
        entry({ id: 'a', createdAt: NOW }),
      ],
      NOW,
    )
    expect(batch.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input array', () => {
    const entries = [entry({ id: 'b', createdAt: NOW }), entry({ id: 'a' })]
    const before = entries.map((item) => item.id)
    selectDrainBatch(entries, NOW)
    expect(entries.map((item) => item.id)).toEqual(before)
  })
})

describe('classifyFailure', () => {
  it('treats duplicate writes as success', () => {
    expect(classifyFailure(new Error('duplicate key value violates unique constraint'))).toBe('duplicate')
    expect(classifyFailure({ message: 'already recorded', code: '23505' })).toBe('duplicate')
    expect(classifyFailure({ message: '{"error":"duplicate"}', code: '409' })).toBe('duplicate')
  })

  it('stops on database or prose auth failures', () => {
    for (const error of [
      new Error('JWT expired'),
      new Error('permission denied'),
      { message: 'expired', code: '42501' },
      { message: 'expired', code: '28000' },
      { message: '{"error":"invalid_device"}', code: '401' },
      { message: '{"error":"not_authorized"}', code: '403' },
    ]) {
      expect(classifyFailure(error)).toBe('auth')
    }
  })

  it('treats invalid gate payloads as terminal', () => {
    expect(classifyFailure({ message: 'missing supervisor note', code: '22023' })).toBe('invalid')
    expect(classifyFailure({ message: 'person is not approved', code: '23514' })).toBe('invalid')
  })

  it('treats no signal as network, never as the entry\'s fault (6 Oct)', () => {
    expect(classifyFailure(new TypeError('Failed to fetch'))).toBe('network')
    expect(classifyFailure(new TypeError('Load failed'))).toBe('network')
    expect(classifyFailure(new DOMException('The operation was aborted.', 'AbortError'))).toBe('network')
    expect(classifyFailure(new RequestTimeoutError('/api/gate/issue', 20_000))).toBe('network')
    for (const code of ['408', '425', '429', '502', '503', '504']) {
      expect(classifyFailure({ message: '{"error":"x"}', code })).toBe('network')
    }
  })

  it('treats the gate routes\' own refusals as invalid, not as something to retry (6 Oct)', () => {
    expect(classifyFailure({ message: '{"error":"not_found"}', code: '404' })).toBe('invalid')
    expect(classifyFailure({ message: '{"error":"invalid_action"}', code: '422' })).toBe('invalid')
    expect(classifyFailure({ message: '{"error":"invalid_body"}', code: '400' })).toBe('invalid')
    expect(classifyFailure({ message: '{"error":"invalid_vehicle_event"}', code: '400' })).toBe('invalid')
  })

  it('keeps an unexplained 500 transient (bounded by MAX_ATTEMPTS)', () => {
    expect(classifyFailure({ message: '{"error":"internal"}', code: '500' })).toBe('transient')
  })

  it('keeps person-not-found transient', () => {
    expect(classifyFailure(new Error('person not found'))).toBe('transient')
  })

  it('defaults unknown failures to transient', () => {
    expect(classifyFailure(new Error('network unavailable'))).toBe('transient')
    expect(classifyFailure(undefined)).toBe('transient')
  })
})

describe('failureMessage and auth-stop state', () => {
  it('reads Error and PostgREST-shaped messages without broad casts', () => {
    expect(failureMessage(new Error('network unavailable'))).toBe('network unavailable')
    expect(failureMessage({ message: 'missing supervisor note', code: '22023' })).toBe('missing supervisor note')
    expect(failureMessage({ code: 'XX000' })).toBe('Unknown sync failure')
  })

  it('detects only retained pending auth failures', () => {
    expect(hasAuthStoppedEntry([entry({ id: 'auth', lastError: 'JWT expired' })])).toBe(true)
    expect(hasAuthStoppedEntry([entry({ id: 'done', status: 'done', lastError: 'JWT expired' })])).toBe(false)
  })
})

describe('retry policy', () => {
  it('backs off exponentially, caps at one minute, and accepts caller jitter', () => {
    expect(nextAttemptDelayMs(0)).toBe(1_000)
    expect(nextAttemptDelayMs(1, 0.75)).toBe(1_500)
    expect(nextAttemptDelayMs(6)).toBe(60_000)
    expect(nextAttemptDelayMs(20)).toBe(60_000)
  })

  it('marks only the eighth attempt terminal', () => {
    expect(isTerminal(MAX_ATTEMPTS - 1)).toBe(false)
    expect(isTerminal(MAX_ATTEMPTS)).toBe(true)
  })
})
