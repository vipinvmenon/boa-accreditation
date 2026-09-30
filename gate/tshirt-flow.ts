import type { GateDatabase } from './db'
import { tshirtRequestSchema, type TshirtRequest } from '@/lib/schemas/tshirt'

/**
 * ACC-197b: the volunteer taps "T-shirt handed over".
 *
 * Non-negotiable #7: the write goes to the outbox like every other gate write,
 * radio or not, and the roster row is marked at once so the screen answers
 * before the server does. The mark is monotonic: gate/roster.ts never lets a
 * pull clear it, because the server row this queues is never deleted.
 */
export async function queueTshirtGiven(db: GateDatabase, personId: string): Promise<TshirtRequest> {
  const action = tshirtRequestSchema.parse({
    idempotencyKey: crypto.randomUUID(),
    personId,
    occurredAt: new Date().toISOString(),
  })
  const now = Date.now()
  await db.transaction('rw', db.outbox, db.roster, async () => {
    await db.outbox.add({
      id: crypto.randomUUID(),
      kind: 'tshirt_given',
      idempotencyKey: action.idempotencyKey,
      status: 'pending',
      nextAttemptAt: now,
      createdAt: now,
      payload: action,
      attempts: 0,
    })
    await db.roster.where('personId').equals(personId).modify((row) => {
      row.tshirtGivenAt ??= action.occurredAt ?? new Date(now).toISOString()
    })
  })
  return action
}
