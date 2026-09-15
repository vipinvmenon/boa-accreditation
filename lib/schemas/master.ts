import { z } from 'zod'
import { ORG_KINDS, ORG_TYPE_CODES } from './org'

export const masterQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  inBms: z.enum(['all', 'true', 'false']).default('all'),
  format: z.enum(['json', 'csv']).default('json'),
})

export const masterRowSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  phone: z.string(),
  orgName: z.string(),
  orgKind: z.enum(ORG_KINDS),
  typeCode: z.enum(ORG_TYPE_CODES).nullable(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'voided']),
  passRef: z.string().nullable(),
  vehicleReg: z.string().nullable(),
  bandSerial: z.string().nullable(),
  stickerNo: z.string().nullable(),
  inBms: z.boolean(),
  collectedAt: z.string().nullable(),
  gateLabel: z.string().nullable(),
  decidedAt: z.string().nullable(),
})

export const masterResponseSchema = z.object({
  rows: z.array(masterRowSchema),
})

export type MasterRow = z.infer<typeof masterRowSchema>
