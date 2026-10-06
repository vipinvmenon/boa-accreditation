import { z } from 'zod'
import { gatePullSchema } from '@/lib/schemas/gate'
import { gateDb, ledgerRowSchema, metaRowSchema, rosterRowSchema, stickerRowSchema, type LedgerRow, type RosterRow, type StickerRow } from './db'
import { fetchJsonWithTimeout, PULL_TIMEOUT_MS } from './fetch-timeout'
import { normalizePlate } from './vehicle-flow'

export type GateSnapshot = {
  roster: RosterRow[]
  ledger: LedgerRow[]
  meta: { gateLabel: string; volunteerName: string; rosterAsOf: string | null; ledgerAsOf: string | null }
}

/**
 * ACC-153 — the plate → sticker index the vehicle screen checks a car against.
 *
 * Until this existed nothing wrote `gateDb.sticker` at all: the vehicle screen
 * and `stickerForPlate()` read it, `gate/db.test.ts` and the visual harness
 * seeded it, and no shipped code ever put a row in. So on a real phone
 * `gateDb.sticker.get(plate)` was always `undefined`, `stickerOk` always
 * false, and every vehicle was refused with "No sticker is issued to this
 * plate" — the vehicle gate could turn cars away and nothing else.
 *
 * The binding is already in the pull, so no migration and no new server
 * contract: a `vehicle_sticker` ledger row names the holder and carries the
 * sticker number, and that holder's roster row carries the registration the
 * sticker is stuck to. Derived rather than fetched also means the index can
 * never disagree with the ledger the same screen checks against.
 *
 * Two rules, both from the ledger being append-only (non-negotiable #2):
 * a reissue appends, so the LATEST sticker per plate wins; and a row whose
 * holder has left the roster, has no registration, or whose registration does
 * not parse is skipped rather than thrown — one bad registration must not
 * cost the phone its whole cache.
 */
export function stickerRowsFrom(
  roster: readonly RosterRow[],
  ledger: readonly LedgerRow[],
): StickerRow[] {
  const registrationOf = new Map(
    roster.filter((row) => row.vehicleReg).map((row) => [row.personId, row.vehicleReg!]),
  )
  const latest = new Map<string, StickerRow>()
  for (const row of ledger) {
    if (row.kind !== 'vehicle_sticker' || !row.stickerNo) continue
    const registration = registrationOf.get(row.personId)
    if (!registration) continue
    let plate: string
    try {
      plate = normalizePlate(registration)
    } catch {
      continue
    }
    const previous = latest.get(plate)
    if (previous && previous.issuedAt >= row.occurredAt) continue
    latest.set(plate, stickerRowSchema.parse({
      plate,
      stickerNo: row.stickerNo,
      personId: row.personId,
      issuedAt: row.occurredAt,
    }))
  }
  return [...latest.values()]
}

/**
 * Rebuild the index from whatever this phone now holds.
 *
 * `pullGate` derives it inside its own transaction, but the ledger also grows
 * between pulls: `drainOutbox` writes the row the server confirmed as soon as
 * an issue posts. Without this, a sticker handed over at the crew gate would
 * not be recognised at the vehicle barrier until the next roster pull.
 */
export async function rebuildStickerIndex(): Promise<void> {
  await gateDb.transaction('rw', gateDb.roster, gateDb.ledger, gateDb.sticker, async () => {
    const [roster, ledger] = await Promise.all([gateDb.roster.toArray(), gateDb.ledger.toArray()])
    await gateDb.sticker.clear()
    await gateDb.sticker.bulkPut(stickerRowsFrom(roster, ledger))
  })
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
  // A time limit, so a pull on a congested network cannot hold the sync cycle
  // open indefinitely (gate/fetch-timeout.ts). A timeout is an ordinary failed
  // pull: the cache is kept and the scheduler backs off.
  const { response, body } = await fetchJsonWithTimeout(
    '/api/gate/pull',
    { method: 'POST', credentials: 'same-origin', cache: 'no-store' },
    PULL_TIMEOUT_MS,
  )
  if (!response.ok) {
    throw new Error(response.status === 401 ? 'not_signed_in' : response.status === 403 ? 'not_authorized' : 'pull_failed')
  }
  const parsed = gatePullSchema.safeParse(body)
  if (!parsed.success || parsed.data.roster.length === 0) throw new Error('empty_roster')

  const pulledRoster = parsed.data.roster.map(localRoster)
  const snapshot: GateSnapshot = {
    roster: pulledRoster,
    ledger: parsed.data.ledger.map(localLedger),
    meta: {
      gateLabel: parsed.data.gateLabel,
      volunteerName: parsed.data.volunteerName,
      rosterAsOf: parsed.data.rosterAsOf,
      ledgerAsOf: parsed.data.ledgerAsOf,
    },
  }
  // ACC-153: the sticker index is derived from the two tables beside it, so it
  // is rebuilt in the same transaction. A cache where the ledger has moved on
  // and the index has not is the bug this replaces, in the other direction.
  const stickers = stickerRowsFrom(snapshot.roster, snapshot.ledger)
  await gateDb.transaction('rw', gateDb.roster, gateDb.ledger, gateDb.sticker, gateDb.meta, async () => {
    // ACC-197b: a hand-over tapped on this phone that the server has not
    // acknowledged yet must survive the pull. The server's row is never
    // deleted, so keeping a local mark can only ever be early, never wrong.
    const before = new Map((await gateDb.roster.toArray()).map((row) => [row.personId, row.tshirtGivenAt]))
    snapshot.roster = pulledRoster.map((row) => {
      const local = before.get(row.personId)
      return !row.tshirtGivenAt && local ? { ...row, tshirtGivenAt: local } : row
    })
    await gateDb.roster.clear()
    await gateDb.ledger.clear()
    await gateDb.sticker.clear()
    await gateDb.roster.bulkPut(snapshot.roster)
    await gateDb.ledger.bulkPut(snapshot.ledger)
    await gateDb.sticker.bulkPut(stickers)
    const rows = [
      { key: 'operatorId' as const, value: parsed.data.operatorId },
      // The pull has always carried the role and thrown it away. Caching it
      // is what lets the gate draw a lead's chrome rather than a volunteer's
      // after an offline boot (gate/use-operator.ts). Display only — every
      // authorisation decision is still the database's.
      { key: 'operatorRole' as const, value: parsed.data.operatorRole },
      { key: 'operatorName' as const, value: parsed.data.volunteerName },
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
