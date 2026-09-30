import { z } from 'zod'
import { tierCodeSchema } from '@/lib/schemas/accreditation'

const isoDateTime = z.string().datetime({ offset: true })

export const gateIssueSchema = z.object({
  idempotencyKey: z.string().uuid(),
  passToken: z.string().min(1),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  bandSerial: z.string().trim().max(80).nullable().optional(),
  stickerNo: z.string().trim().max(80).nullable().optional(),
  vehicleReg: z.string().trim().max(20).nullable().optional(),
  occurredAt: isoDateTime.nullable().optional(),
  isReissue: z.boolean().default(false),
  supervisorNote: z.string().trim().max(240).nullable().optional(),
  voidsCheckinId: z.string().uuid().nullable().optional(),
})

export type GateIssue = z.infer<typeof gateIssueSchema>

const gateRosterRowSchema = z.object({
  passToken: z.string().min(1),
  personId: z.string().uuid(),
  orgId: z.string().uuid(),
  status: z.literal('approved'),
  vehicleReg: z.string().nullable(),
  updatedAt: isoDateTime,
  fullName: z.string().min(1),
  /** For the gate's offline search by phone; shown masked to four digits. */
  phone: z.string().min(1),
  roleText: z.string().min(1),
  orgName: z.string().min(1),
  // The pack's eight tiers (ADR-018). Widened from v1's three; every v1 code
  // is still a tier, so rows cached before the widening still parse.
  typeCode: tierCodeSchema,
  dayValidity: z.enum(['build', 'show', 'build_show']),
  /** ACC-197: the crew T-shirt the desk chose for this person, else null. Gate-only. */
  tshirtSize: z.enum(['S', 'M', 'L', 'XL', 'XXL', '3XL']).nullable().optional(),
})

const gateLedgerRowSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  kind: z.enum(['wristband', 'vehicle_sticker']),
  occurredAt: isoDateTime,
  bandSerial: z.string().nullable(),
  stickerNo: z.string().nullable(),
  gateLabel: z.string(),
  volunteerName: z.string(),
  isReissue: z.boolean(),
})

/**
 * boa_acc_gate_pull() (202609221201, ACC-150): answered for the calling
 * operator's own session. `volunteerName` is the signed-in operator's display
 * name; there is no device and no device scope any more.
 */
export const gatePullSchema = z.object({
  operatorId: z.string().uuid(),
  operatorRole: z.enum(['issuer', 'lead', 'admin']),
  gateLabel: z.string(),
  volunteerName: z.string(),
  roster: gateRosterRowSchema.array(),
  ledger: gateLedgerRowSchema.array(),
  rosterAsOf: isoDateTime.nullable(),
  ledgerAsOf: isoDateTime.nullable(),
})

export const gateIssueResultSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  idempotencyKey: z.string().uuid(),
  bandSerial: z.string().nullable(),
  stickerNo: z.string().nullable(),
  vehicleReg: z.string().nullable(),
  /** The operator who recorded the row — every ledger row names one (ACC-150). */
  operatorId: z.string().uuid(),
  gateLabel: z.string(),
  volunteerName: z.string(),
  occurredAt: isoDateTime,
  postedAt: isoDateTime,
  isReissue: z.boolean(),
  supervisorNote: z.string().nullable(),
  voidsCheckinId: z.string().uuid().nullable(),
})

export type GatePull = z.infer<typeof gatePullSchema>
export type GateIssueResult = z.infer<typeof gateIssueResultSchema>
