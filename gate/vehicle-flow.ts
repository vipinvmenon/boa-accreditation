import { z } from 'zod'
import type { GateDatabase, LedgerRow, StickerRow } from './db'
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

export function stickerForPlate(db: GateDatabase, plate: string): Promise<StickerRow | undefined> {
  return db.sticker.get(normalizePlate(plate))
}
