/**
 * ACC-051 — the outbox's scheduling decisions, as pure functions.
 *
 * These decisions are separated from Dexie IO so the ordering and retry rules
 * can be tested without a browser or a network. Every gate write is appended to
 * the outbox, online or offline; this module never posts, deletes, or mutates
 * an entry.
 *
 * The guarantee that matters is ordering. Replay stops at the first entry
 * whose server result is unknown. Without that, a reissue can post before its
 * original issue and the ledger's causal history is wrong.
 *
 * What it must never do is stop for good (6 Oct pre-festival test pass,
 * findings 6 and 7). Until then eight failed sends of any kind — eight
 * "Load failed" on a phone that thinks it has signal, about four minutes —
 * marked the head entry 'failed', and a 'failed' entry blocked everything
 * behind it for the rest of the day, with nothing on screen to say so. Now:
 *   - no signal (a network error, a timeout, a gateway 5xx, a 429) is never
 *     terminal: it backs off, capped at a minute, and keeps trying;
 *   - a refusal (any other 4xx: the person was withdrawn, the payload was
 *     malformed) is terminal at once, because sending it again changes
 *     nothing;
 *   - a 'failed' entry has a known answer, so it no longer holds back the
 *     work behind it. It is retained and counted on screen.
 */
import type { OutboxRow } from './db'

export type OutboxEntryState = Pick<
  OutboxRow,
  'id' | 'idempotencyKey' | 'status' | 'attempts' | 'nextAttemptAt' | 'createdAt' | 'lastError'
>

/**
 * How a drain failure should be treated. `network` means the request never got
 * an answer from the app (no signal, a timeout, a gateway in front of it
 * failing): never terminal. `transient` means the app answered with an error
 * it did not explain: retried, terminal after MAX_ATTEMPTS.
 */
export type FailureKind = 'auth' | 'duplicate' | 'invalid' | 'network' | 'transient'

/**
 * HTTP answers that say nothing about the entry itself: a timeout, too many
 * requests, or a gateway (Vercel, Supabase) in front of the route failing.
 */
const NO_SIGNAL_STATUS = new Set(['408', '425', '429', '502', '503', '504'])

/**
 * `fetch` rejects with a TypeError when the request could not be made at all
 * ("Failed to fetch", Safari's "Load failed"); an abort or gate/fetch-timeout.ts's
 * limit is the same thing seen from the other side.
 */
function isNoSignal(error: unknown): boolean {
  if (error instanceof TypeError) return true
  return isRecord(error) && ['AbortError', 'TimeoutError', 'RequestTimeoutError'].includes(String(error['name']))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Preserve the server's explanation even when PostgREST throws a plain object. */
export function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (isRecord(error) && typeof error['message'] === 'string' && error['message'].trim()) {
    return error['message']
  }
  return 'Unknown sync failure'
}

function failureParts(error: unknown): { message: string; code: string } {
  return {
    message: failureMessage(error).toLowerCase(),
    code: isRecord(error) && typeof error['code'] === 'string' ? error['code'] : '',
  }
}

/**
 * Classify a drain failure.
 *
 * Duplicate is success because a lost response can leave the server holding
 * the write already. Auth stops the drain without consuming an attempt.
 * Invalid (a 4xx the route chose, or a database refusal) is terminal but
 * retained for human review. No signal is `network` and retries forever with
 * capped backoff. Anything else unexplained is `transient`: retried, terminal
 * after MAX_ATTEMPTS. The bare prose "person not found" stays transient; the
 * gate routes never send it (they answer 404, which is `invalid`).
 */
export function classifyFailure(error: unknown): FailureKind {
  const { message, code } = failureParts(error)

  if (code === '23505' || code === '409' || /duplicate|duplicate key|\balready (issued|exists|recorded)\b/.test(message)) {
    return 'duplicate'
  }

  // 401/403 are the gate routes' own HTTP answer to a lapsed operator
  // session or a signed-in person who is not a gate role (ACC-149/ACC-150).
  // Their JSON body ("not_authenticated", "not_authorized") matches none of
  // the prose below, so until this line a 401 was 'transient' and burned
  // MAX_ATTEMPTS on the head of the queue. Both now leave every queued
  // entry exactly where it is until someone logs in again (ADR-020).
  if (code === '28000' || code === '42501' || code === '401' || code === '403') return 'auth'
  if (
    /not authorised|not authorized|authentication required|permission denied|jwt|unauthor|(?:^|\s)401(?:\s|$)|(?:^|\s)403(?:\s|$)/.test(
      message,
    )
  ) {
    return 'auth'
  }

  if (isNoSignal(error) || NO_SIGNAL_STATUS.has(code)) return 'network'

  // Any other 4xx is the route refusing this entry: a person withdrawn or
  // re-tokened after this phone's pull (404), a malformed or mismatched
  // action (400, 422). Sending it again gets the same answer, so it stops
  // now rather than after eight tries, and no longer blocks the queue.
  if (/^4\d\d$/.test(code)) return 'invalid'

  if (/person not found/.test(message)) return 'transient'

  if (code === '22023' || code === '23514') return 'invalid'
  if (/missing supervisor note|supervisor note is required|person is not approved|not approved/.test(message)) {
    return 'invalid'
  }

  return 'transient'
}

/** True when a retained pending row is the reason the drain is auth-stopped. */
export function hasAuthStoppedEntry(entries: OutboxEntryState[]): boolean {
  return entries.some(
    (entry) => entry.status === 'pending' && classifyFailure(entry.lastError) === 'auth',
  )
}

/** Exponential backoff, capped at one minute. Jitter is supplied by the caller. */
export function nextAttemptDelayMs(attempts: number, jitter = 1): number {
  const base = Math.min(60_000, 1_000 * 2 ** Math.min(Math.max(attempts, 0), 6))
  return Math.round(base * jitter)
}

export const MAX_ATTEMPTS = 8

/**
 * Terminal means stop retrying and retain the entry for human resolution.
 * Applies to `transient` failures only; `network` ones are never terminal.
 */
export function isTerminal(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS
}

/**
 * Select eligible entries in causal order, stopping at the first blockage.
 *
 * Completed rows are retained as local evidence and skipped. So are 'failed'
 * rows: the server has answered them, so nothing behind them can overtake an
 * unknown result, and holding the queue behind one would stop this phone
 * sending for the rest of the day. No entry is removed here, and the
 * idempotency key travels with the returned row unchanged for every retry.
 */
export function selectDrainBatch(entries: OutboxEntryState[], now: number): OutboxEntryState[] {
  const ordered = [...entries].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const batch: OutboxEntryState[] = []

  for (const entry of ordered) {
    if (entry.status === 'done' || entry.status === 'resolved' || entry.status === 'failed') continue
    // drainOutbox resets an orphaned 'syncing' row before it selects, so one
    // seen here is another tab's send in flight: its result is unknown.
    if (entry.status === 'syncing') break
    if (entry.nextAttemptAt > now) break
    batch.push(entry)
  }

  return batch
}
