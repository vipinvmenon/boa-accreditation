import { gateIssueResultSchema } from '@/lib/schemas/gate'
import { vehicleEventResponseSchema } from '@/lib/schemas/vehicle'
import { tshirtResponseSchema } from '@/lib/schemas/tshirt'
import { gateDb } from './db'
import { classifyFailure, nextAttemptDelayMs, selectDrainBatch } from './outbox-policy'
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

async function drainOnce(): Promise<void> {
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
        const response = await fetch('/api/gate/vehicle', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entry.payload),
        })
        const body: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw { code: String(response.status), message: typeof body === 'object' && body !== null ? JSON.stringify(body) : 'sync failed' }
        }
        const result = vehicleEventResponseSchema.parse(body)
        await gateDb.outbox.update(entry.id, { status: 'done', result })
        continue
      }
      // ACC-197b: a T-shirt hand-over. Its own endpoint, no ledger row; the
      // server's answer (the first hand-over, if another phone got there first)
      // is what the roster keeps.
      if (entry.kind === 'tshirt_given') {
        const response = await fetch('/api/gate/tshirt', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(entry.payload),
        })
        const body: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          throw { code: String(response.status), message: typeof body === 'object' && body !== null ? JSON.stringify(body) : 'sync failed' }
        }
        const result = tshirtResponseSchema.parse(body)
        await gateDb.transaction('rw', gateDb.outbox, gateDb.roster, async () => {
          await gateDb.outbox.update(entry.id, { status: 'done', result })
          await gateDb.roster.where('personId').equals(result.personId).modify((row) => {
            row.tshirtGivenAt = result.occurredAt
          })
        })
        continue
      }
      const response = await fetch('/api/gate/issue', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry.payload),
      })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        throw { code: String(response.status), message: typeof body === 'object' && body !== null ? JSON.stringify(body) : 'sync failed' }
      }
      const result = gateIssueResultSchema.parse(body)
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
      await gateDb.outbox.update(entry.id, {
        status: kind === 'invalid' || attempts >= 8 ? 'failed' : 'pending',
        attempts,
        nextAttemptAt: Date.now() + nextAttemptDelayMs(attempts),
        lastError: error instanceof Error ? error.message : String(error),
      })
      // A failed action blocks every later action in the causal queue. Do not
      // let a reissue or vehicle event overtake work whose server result is
      // unknown, even when the failure is transient.
      break
    }
  }
  if (stickerIssued) await rebuildStickerIndex()
}
