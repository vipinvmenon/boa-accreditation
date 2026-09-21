import { gateIssueResultSchema } from '@/lib/schemas/gate'
import { vehicleEventResponseSchema } from '@/lib/schemas/vehicle'
import { gateDb } from './db'
import { classifyFailure, nextAttemptDelayMs, selectDrainBatch } from './outbox-policy'

/**
 * One drain at a time per page. Since ACC-109 a drain can start from the
 * `online` event, the 30 s timer and an issue at nearly the same moment; two
 * concurrent drains could both read an entry as 'pending' before either marks
 * it 'syncing' and send it twice. Idempotency keys make that harmless on the
 * server, but it is wasted radio time at the gate — so callers share one.
 */
let inFlight: Promise<void> | null = null

export function drainOutbox(deviceToken: string): Promise<void> {
  inFlight ??= drainOnce(deviceToken).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function drainOnce(deviceToken: string): Promise<void> {
  const entries = await gateDb.outbox.toArray()
  const batch = selectDrainBatch(entries, Date.now())
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
          headers: { 'content-type': 'application/json', 'x-boa-device-token': deviceToken },
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
      const response = await fetch('/api/gate/issue', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-boa-device-token': deviceToken },
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
        await gateDb.outbox.update(entry.id, { status: 'pending', lastError: 'authentication required' })
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
}
