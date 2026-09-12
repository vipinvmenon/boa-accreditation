import { gateIssueResultSchema } from '@/lib/schemas/gate'
import { gateDb } from './db'
import { classifyFailure, nextAttemptDelayMs, selectDrainBatch } from './outbox-policy'

export async function drainOutbox(deviceToken: string): Promise<void> {
  const entries = await gateDb.outbox.toArray()
  const batch = selectDrainBatch(entries, Date.now())
  for (const selected of batch) {
    const entry = await gateDb.outbox.get(selected.id)
    if (!entry) continue
    await gateDb.outbox.update(entry.id, { status: 'syncing' })
    try {
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
      if (kind === 'invalid') break
    }
  }
}
