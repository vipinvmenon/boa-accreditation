import { gateIssueResultSchema } from '@/lib/schemas/gate'
import { vehicleEventResponseSchema } from '@/lib/schemas/vehicle'
import { tshirtResponseSchema } from '@/lib/schemas/tshirt'
import { gateDb } from './db'
import { fetchJsonWithTimeout, SEND_TIMEOUT_MS } from './fetch-timeout'
import { classifyFailure, failureMessage, isTerminal, nextAttemptDelayMs, selectDrainBatch } from './outbox-policy'
import { rebuildStickerIndex } from './roster'

/**
 * One drain at a time per page. Since ACC-109 a drain can start from the
 * `online` event, the 30 s timer and an issue at nearly the same moment; two
 * concurrent drains could both read an entry as 'pending' before either marks
 * it 'syncing' and send it twice. Idempotency keys make that harmless on the
 * server, but it is wasted radio time at the gate — so callers share one.
 */
let inFlight: Promise<void> | null = null

/**
 * Posts queued work with the signed-in operator's session cookie (ACC-150:
 * no device token). A 401 (session lapsed) or 403 (not a gate role) stops
 * the drain and leaves every entry queued until someone logs in.
 */
export function drainOutbox(): Promise<void> {
  inFlight ??= drainOnce().finally(() => {
    inFlight = null
  })
  return inFlight
}

/**
 * POST one queued action. Throws `{ code, message }` with the HTTP status on a
 * non-2xx answer, so gate/outbox-policy.ts can classify it.
 */
async function post(url: string, payload: unknown): Promise<unknown> {
  const { response, body } = await fetchJsonWithTimeout(
    url,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
    SEND_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw { code: String(response.status), message: typeof body === 'object' && body !== null ? JSON.stringify(body) : 'sync failed' }
  }
  return body
}

/** What a failure is stored as. An HTTP answer keeps its status in front. */
function describeFailure(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
  return /^\d{3}$/.test(code) ? `HTTP ${code}: ${failureMessage(error)}` : failureMessage(error)
}

let legacyRevived = false

/**
 * Put back to work what an earlier page left behind (6 Oct pre-festival test
 * pass, finding 5).
 *
 *  - 'syncing' is only ever set by a drain, and drains are single-flight per
 *    page, so a 'syncing' row seen before this page's drain starts belongs to
 *    a page that was reloaded or killed mid-send (iOS does this to a locked
 *    phone's tab). Left alone it blocked the queue forever. Its result is
 *    unknown, so it is sent again with the same idempotency key: the server
 *    returns the row it already holds, or writes it now. If a second gate
 *    tab is genuinely mid-send, the repeat is equally harmless.
 *  - Before this fix, eight sends without signal made a row 'failed' for
 *    good. Those rows never had an HTTP status (describeFailure was not
 *    writing one), so a 'failed' row without one is retried once per page
 *    load (reviveLegacyFailures). A real refusal comes back as one and stays
 *    failed.
 */
async function recoverOrphans(): Promise<void> {
  await gateDb.outbox.where('status').equals('syncing').modify({ status: 'pending', nextAttemptAt: 0 })
  await reviveLegacyFailures()
}

/**
 * The once-per-page half of recoverOrphans, exported for the sync scheduler.
 * The scheduler drains only when something is pending, so a device whose
 * only stuck row was one of these old failures never drained, never revived
 * it, and showed "1 not accepted · tell a lead" for good (7 Oct). The
 * scheduler now calls this before it counts the queue.
 */
export async function reviveLegacyFailures(): Promise<void> {
  if (legacyRevived) return
  legacyRevived = true
  await gateDb.outbox
    .where('status')
    .equals('failed')
    .filter((row) => !/^HTTP \d{3}\b/.test(row.lastError ?? ''))
    .modify({ status: 'pending', attempts: 0, nextAttemptAt: 0 })
}

async function drainOnce(): Promise<void> {
  await recoverOrphans()
  const entries = await gateDb.outbox.toArray()
  const batch = selectDrainBatch(entries, Date.now())
  // ACC-153: a sticker confirmed by the server adds a ledger row here, between
  // roster pulls. The plate index is derived from that ledger, so it is
  // rebuilt once at the end of the drain rather than left until the next pull
  // — otherwise a sticker handed over at the crew gate is not recognised at
  // the vehicle barrier for up to a minute.
  let stickerIssued = false
  for (const selected of batch) {
    const entry = await gateDb.outbox.get(selected.id)
    if (!entry) continue
    await gateDb.outbox.update(entry.id, { status: 'syncing' })
    try {
      // Vehicle events have their own endpoint and write no ledger row. Until
      // ACC-109 they were posted to /api/gate/issue, rejected with a 400, and
      // — because a failed action blocks everything behind it — stalled every
      // wristband issue queued after the first vehicle event on the device.
      if (entry.kind === 'vehicle_event') {
        const result = vehicleEventResponseSchema.parse(await post('/api/gate/vehicle', entry.payload))
        await gateDb.outbox.update(entry.id, { status: 'done', result })
        continue
      }
      // ACC-197b: a T-shirt hand-over. Its own endpoint, no ledger row; the
      // server's answer (the first hand-over, if another phone got there first)
      // is what the roster keeps.
      if (entry.kind === 'tshirt_given') {
        const result = tshirtResponseSchema.parse(await post('/api/gate/tshirt', entry.payload))
        await gateDb.transaction('rw', gateDb.outbox, gateDb.roster, async () => {
          await gateDb.outbox.update(entry.id, { status: 'done', result })
          await gateDb.roster.where('personId').equals(result.personId).modify((row) => {
            row.tshirtGivenAt = result.occurredAt
          })
        })
        continue
      }
      const result = gateIssueResultSchema.parse(await post('/api/gate/issue', entry.payload))
      await gateDb.transaction('rw', gateDb.outbox, gateDb.ledger, async () => {
        await gateDb.outbox.update(entry.id, { status: 'done', result })
        if (result.kind !== 'void') {
          if (result.kind === 'vehicle_sticker') stickerIssued = true
          await gateDb.ledger.put({
            id: result.id,
            personId: result.personId,
            kind: result.kind,
            occurredAt: result.occurredAt,
            bandSerial: result.bandSerial ?? undefined,
            stickerNo: result.stickerNo ?? undefined,
            gateLabel: result.gateLabel,
            volunteerName: result.volunteerName,
            isReissue: result.isReissue,
          })
        }
      })
    } catch (error: unknown) {
      const kind = classifyFailure(error)
      if (kind === 'duplicate') {
        await gateDb.outbox.update(entry.id, { status: 'done', result: { duplicate: true } })
        continue
      }
      if (kind === 'auth') {
        // Keep the entry and its attempt count (an auth failure is not the
        // entry's fault), but hold it briefly so the next trigger does not
        // re-post it in a tight loop. gate/sync-scheduler.ts reads this
        // lastError via hasAuthStoppedEntry and pauses until re-login.
        await gateDb.outbox.update(entry.id, {
          status: 'pending',
          lastError: 'authentication required',
          nextAttemptAt: Date.now() + nextAttemptDelayMs(entry.attempts + 1),
        })
        break
      }
      const attempts = entry.attempts + 1
      // No signal is never terminal: the entry waits, capped at a minute
      // between tries, for as long as it takes (gate/outbox-policy.ts).
      const terminal = kind === 'invalid' || (kind === 'transient' && isTerminal(attempts))
      await gateDb.outbox.update(entry.id, {
        status: terminal ? 'failed' : 'pending',
        attempts,
        nextAttemptAt: Date.now() + nextAttemptDelayMs(attempts),
        lastError: describeFailure(error),
      })
      // The server has answered a terminal entry, so the work behind it may
      // go. An entry still waiting blocks every later action in the causal
      // queue: a reissue or vehicle event must not overtake work whose server
      // result is unknown.
      if (terminal) continue
      break
    }
  }
  if (stickerIssued) await rebuildStickerIndex()
}
