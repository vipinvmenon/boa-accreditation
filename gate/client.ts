import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb } from './db'
import { drainOutbox } from './outbox'
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


