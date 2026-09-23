import { z } from 'zod'
import { gatePullSchema } from '@/lib/schemas/gate'
import { gateDb, ledgerRowSchema, metaRowSchema, rosterRowSchema, type LedgerRow, type RosterRow } from './db'

export type GateSnapshot = {
  roster: RosterRow[]
  ledger: LedgerRow[]
  meta: { gateLabel: string; volunteerName: string; rosterAsOf: string | null; ledgerAsOf: string | null }
}

function localRoster(row: z.infer<typeof gatePullSchema>['roster'][number]): RosterRow {
  return rosterRowSchema.parse({ ...row, vehicleReg: row.vehicleReg ?? undefined })
}

function localLedger(row: z.infer<typeof gatePullSchema>['ledger'][number]): LedgerRow {
  return ledgerRowSchema.parse({ ...row, bandSerial: row.bandSerial ?? undefined, stickerNo: row.stickerNo ?? undefined })
}

/**
 * One pull of the approved roster, authorised by the signed-in operator's
 * session cookie (ACC-150; same-origin fetch sends it). `not_signed_in` on a
 * 401 and `not_authorized` on a 403 let the gate send the person to log in.
 */
export async function pullGate(): Promise<GateSnapshot> {
  const response = await fetch('/api/gate/pull', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'not_signed_in' : response.status === 403 ? 'not_authorized' : 'pull_failed')
  }
  const parsed = gatePullSchema.safeParse(body)
  if (!parsed.success || parsed.data.roster.length === 0) throw new Error('empty_roster')

  const snapshot: GateSnapshot = {
    roster: parsed.data.roster.map(localRoster),
    ledger: parsed.data.ledger.map(localLedger),
    meta: {
      gateLabel: parsed.data.gateLabel,
      volunteerName: parsed.data.volunteerName,
      rosterAsOf: parsed.data.rosterAsOf,
      ledgerAsOf: parsed.data.ledgerAsOf,
    },
  }
  await gateDb.transaction('rw', gateDb.roster, gateDb.ledger, gateDb.meta, async () => {
    await gateDb.roster.clear()
    await gateDb.ledger.clear()
    await gateDb.roster.bulkPut(snapshot.roster)
    await gateDb.ledger.bulkPut(snapshot.ledger)
    const rows = [
      { key: 'operatorId' as const, value: parsed.data.operatorId },
      { key: 'schemaVersion' as const, value: 1 },
      { key: 'gateLabel' as const, value: snapshot.meta.gateLabel },
      { key: 'volunteerName' as const, value: snapshot.meta.volunteerName },
      { key: 'rosterAsOf' as const, value: snapshot.meta.rosterAsOf },
      { key: 'ledgerAsOf' as const, value: snapshot.meta.ledgerAsOf },
    ].filter((row) => row.value !== null)
    await gateDb.meta.bulkPut(rows.map((row) => metaRowSchema.parse(row)))
  })
  return snapshot
}
