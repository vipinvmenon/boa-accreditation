import { z } from 'zod'

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
  roleText: z.string().min(1),
  orgName: z.string().min(1),
  typeCode: z.enum(['crew', 'stage', 'aaa']),
  dayValidity: z.enum(['build', 'show', 'build_show']),
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

export const gatePullSchema = z.object({
  deviceId: z.string().uuid(),
  gateLabel: z.string(),
  volunteerName: z.string(),
  scope: z.enum(['crew', 'vehicle', 'both']),
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
  deviceId: z.string().uuid(),
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
