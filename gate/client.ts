import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb } from './db'
import { drainOutbox } from './outbox'
import { hasAuthStoppedEntry } from './outbox-policy'
import { pullGate, type GateSnapshot } from './roster'

export { drainOutbox, pullGate }
export type { GateSnapshot }

export async function readGateSnapshot(): Promise<GateSnapshot> {
  const [roster, ledger, metaRows] = await Promise.all([
    gateDb.roster.toArray(),
    gateDb.ledger.toArray(),
    gateDb.meta.toArray(),
  ])
  const meta = new Map(metaRows.map((row) => [row.key, row.value]))
  const rosterAsOf = meta.get('rosterAsOf')
  const ledgerAsOf = meta.get('ledgerAsOf')
  return {
    roster,
    ledger,
    meta: {
      gateLabel: String(meta.get('gateLabel') ?? 'Gate'),
      volunteerName: String(meta.get('volunteerName') ?? 'Volunteer'),
      rosterAsOf: typeof rosterAsOf === 'string' ? rosterAsOf : null,
      ledgerAsOf: typeof ledgerAsOf === 'string' ? ledgerAsOf : null,
    },
  }
}

export async function enqueueIssue(action: GateIssue): Promise<void> {
  const parsed = gateIssueSchema.parse(action)
  const now = Date.now()
  await gateDb.outbox.put({
    id: crypto.randomUUID(),
    kind: parsed.kind,
    idempotencyKey: parsed.idempotencyKey,
    status: 'pending',
    nextAttemptAt: now,
    createdAt: now,
    payload: parsed,
    attempts: 0,
  })
}

export async function queuedCount(): Promise<number> {
  return gateDb.outbox.where('status').anyOf('pending', 'syncing').count()
}

/**
 * True when queued work is waiting for a login: the last drain was refused
 * with a 401/403 (gate/outbox-policy.ts). Read from Dexie, so it survives a
 * reload with the radio off.
 */
export async function needsLogin(): Promise<boolean> {
  return hasAuthStoppedEntry(await gateDb.outbox.where('status').equals('pending').toArray())
}

