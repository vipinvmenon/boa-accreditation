/**
 * ACC-051 — the outbox's scheduling decisions, as pure functions.
 *
 * These decisions are separated from Dexie IO so the ordering and retry rules
 * can be tested without a browser or a network. Every gate write is appended to
 * the outbox, online or offline; this module never posts, deletes, or mutates
 * an entry.
 *
 * The guarantee that matters is ordering. Replay stops at the first blocked
 * entry. Without that, a reissue can post before its original issue and the
 * ledger's causal history is wrong.
 */
import type { OutboxRow } from './db'

export type OutboxEntryState = Pick<
  OutboxRow,
  'id' | 'idempotencyKey' | 'status' | 'attempts' | 'nextAttemptAt' | 'createdAt' | 'lastError'
>

/** How a drain failure should be treated. */
export type FailureKind = 'auth' | 'duplicate' | 'invalid' | 'transient'

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
 * Invalid is terminal but retained for human review. Everything else retries
 * with bounded backoff; in particular, "person not found" is transient because
 * the approval may have reached the server before this device's roster refresh.
 */
export function classifyFailure(error: unknown): FailureKind {
  const { message, code } = failureParts(error)

  if (code === '23505' || /duplicate key|\balready (issued|exists|recorded)\b/.test(message)) {
    return 'duplicate'
  }

  if (code === '28000' || code === '42501') return 'auth'
  if (
    /not authorised|not authorized|authentication required|permission denied|jwt|unauthor|(?:^|\s)401(?:\s|$)|(?:^|\s)403(?:\s|$)/.test(
      message,
    )
  ) {
    return 'auth'
  }

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

/** Terminal means stop retrying and retain the entry for human resolution. */
export function isTerminal(attempts: number): boolean {
  return attempts >= MAX_ATTEMPTS
}

/**
 * Select eligible entries in causal order, stopping at the first blockage.
 *
 * Completed rows are retained as local evidence and skipped. No entry is
 * removed here, and the idempotency key travels with the returned row unchanged
 * for every retry.
 */
export function selectDrainBatch(entries: OutboxEntryState[], now: number): OutboxEntryState[] {
  const ordered = [...entries].sort(
    (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const batch: OutboxEntryState[] = []

  for (const entry of ordered) {
    if (entry.status === 'done' || entry.status === 'resolved') continue
    if (entry.status === 'failed' || isTerminal(entry.attempts)) break
    if (entry.status === 'syncing') break
    if (entry.nextAttemptAt > now) break
    batch.push(entry)
  }

  return batch
}
