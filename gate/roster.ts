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

export async function pullGate(deviceToken: string): Promise<GateSnapshot> {
  const response = await fetch('/api/gate/pull', {
    method: 'POST',
    headers: { 'x-boa-device-token': deviceToken },
    cache: 'no-store',
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(response.status === 401 ? 'invalid_device' : 'pull_failed')
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
      { key: 'deviceTokenHint' as const, value: deviceToken.slice(-6) },
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
