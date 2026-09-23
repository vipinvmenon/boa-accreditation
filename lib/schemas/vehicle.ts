import { z } from 'zod'

export const vehiclePlateSchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
  .pipe(z.string().regex(/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/))

export const vehicleOutcomeSchema = z.enum(['cleared', 'turned_away'])

export const vehicleChecksSchema = z.object({
  sticker: z.boolean(),
  wristband: z.boolean(),
  plateVisual: z.boolean(),
})

export const vehicleEventRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  plate: vehiclePlateSchema,
  personId: z.string().uuid().nullable().optional(),
  stickerCheckinId: z.string().uuid().nullable().optional(),
  outcome: vehicleOutcomeSchema,
  reason: z.string().trim().max(240).nullable().optional(),
  checks: vehicleChecksSchema,
  occurredAt: z.string().datetime({ offset: true }).nullable().optional(),
})

export const vehicleEventResponseSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  plate: vehiclePlateSchema,
  personId: z.string().uuid().nullable(),
  stickerCheckinId: z.string().uuid().nullable(),
  outcome: vehicleOutcomeSchema,
  reason: z.string().nullable(),
  checks: vehicleChecksSchema,
  /** The operator who recorded the event (ACC-150). */
  operatorId: z.string().uuid(),
  gateLabel: z.string().min(1),
  officerName: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  postedAt: z.string().datetime({ offset: true }),
})

export type VehicleEventRequest = z.infer<typeof vehicleEventRequestSchema>
export type VehicleChecks = z.infer<typeof vehicleChecksSchema>
