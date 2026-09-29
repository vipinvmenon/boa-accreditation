import { z } from 'zod'
import type { GateDatabase, LedgerRow } from './db'
import { gateBandCard } from './band-card'
import {
  vehicleChecksSchema,
  vehiclePlateSchema,
  vehicleOutcomeSchema,
} from '@/lib/schemas/vehicle'

const vehicleActionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  plate: vehiclePlateSchema,
  personId: z.string().uuid().nullable(),
  stickerCheckinId: z.string().uuid().nullable(),
  outcome: vehicleOutcomeSchema,
  reason: z.string().nullable(),
  checks: vehicleChecksSchema,
  occurredAt: z.string().datetime({ offset: true }),
})

export type VehicleAction = z.infer<typeof vehicleActionSchema>

export function normalizePlate(value: string): string {
  return vehiclePlateSchema.parse(value)
}

export function findActiveWristband(
  ledger: readonly LedgerRow[],
  personId: string,
): LedgerRow | undefined {
  return ledger
    .filter((row) => row.personId === personId && row.kind === 'wristband')
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
}

export async function queueVehicleEvent(
  db: GateDatabase,
  input: Omit<VehicleAction, 'idempotencyKey' | 'occurredAt'>,
): Promise<VehicleAction> {
  const action = vehicleActionSchema.parse({
    ...input,
    idempotencyKey: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
  })
  await db.outbox.add({
    id: crypto.randomUUID(),
    kind: 'vehicle_event',
    idempotencyKey: action.idempotencyKey,
    status: 'pending',
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
    payload: action,
    attempts: 0,
  })
  return action
}

/**
 * ACC-159 / ADR-022 — what a plate resolves to, read from the local cache only.
 *
 * This exists so that the panel the officer reads BEFORE deciding and the
 * refusal the code enforces AFTER the press are computed by the same function.
 * Before ACC-159 the lookup lived inline in `recordEvent`, so the only way to
 * learn whether a vehicle would be let in was to press the permissive green
 * button and be refused. Showing the officer one thing while enforcing another
 * would be worse than that, so there is deliberately no second copy of this
 * logic: the screen renders these fields and `recordEvent` gates on the same
 * two booleans.
 *
 * Non-negotiable #7: every read is from Dexie, so this works with the radio
 * off. It writes nothing — resolving a plate is not an event.
 */
export type PlateResolution = {
  /** The normalised plate this resolution is for. */
  plate: string
  /** A sticker is issued to this plate AND the issue is in the local ledger. */
  stickerOk: boolean
  /** That sticker's holder has an active wristband. */
  wristbandOk: boolean
  stickerNo: string | null
  stickerIssuedAt: string | null
  stickerCheckinId: string | null
  personId: string | null
  /** The holder's name, or null when the plate resolves to nobody. */
  holderName: string | null
  /** "Working crew · royal blue · band #0416", or null when there is no live band. */
  wristbandDetail: string | null
}

export async function resolvePlate(
  db: GateDatabase,
  normalizedPlate: string,
): Promise<PlateResolution> {
  const sticker = await db.sticker.get(normalizedPlate)
  const ledger = await db.ledger
    .where('personId')
    .equals(sticker?.personId ?? '')
    .toArray()
  const stickerIssue = ledger.find(
    (row) => row.kind === 'vehicle_sticker' && row.stickerNo === sticker?.stickerNo,
  )
  const wristband = sticker ? findActiveWristband(ledger, sticker.personId) : undefined
  const holder = sticker
    ? await db.roster.where('personId').equals(sticker.personId).first()
    : undefined
  const holderCard = holder ? gateBandCard(holder.typeCode) : undefined

  return {
    plate: normalizedPlate,
    stickerOk: Boolean(sticker && stickerIssue),
    wristbandOk: Boolean(wristband),
    stickerNo: stickerIssue?.stickerNo ?? null,
    stickerIssuedAt: stickerIssue?.occurredAt ?? null,
    stickerCheckinId: stickerIssue?.id ?? null,
    personId: sticker?.personId ?? null,
    holderName: holder?.fullName ?? null,
    wristbandDetail:
      holderCard && wristband
        ? `${holderCard.label} · ${holderCard.band} · band ${wristband.bandSerial ?? 'blank serial'}`
        : null,
  }
}
