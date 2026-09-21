import { z } from 'zod'
import { tierCodeSchema } from './accreditation'
import { requestableTierCodeSchema } from './org'

export const QUEUE_FILTERS = ['pending', 'approved', 'rejected', 'aaa'] as const
export const queueFilterSchema = z.enum(QUEUE_FILTERS)
export type QueueFilter = z.infer<typeof queueFilterSchema>

/** Any of the pack's eight tiers (ADR-018) — what a decided row may carry. */
export const queueTypeSchema = tierCodeSchema
export const queueDayValiditySchema = z.enum(['build', 'show', 'build_show'])

export const queueOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  kind: z.string(),
  contactName: z.string(),
  contactPhone: z.string(),
  used: z.number().int().nonnegative(),
  quota: z.number().int().nonnegative(),
  defaultType: queueTypeSchema,
  status: z.enum(['open', 'submitted', 'approved', 'closed']),
})

export const queueNextOrgSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
})

export const queueRowSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  org_name: z.string(),
  org_kind: z.string(),
  full_name: z.string(),
  phone: z.string(),
  role_text: z.string(),
  vehicle_reg: z.string().nullable(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'voided']),
  type_code: queueTypeSchema.nullable(),
  day_validity: queueDayValiditySchema.nullable(),
  decision_reason: z.string().nullable(),
  created_at: z.string(),
  submitted_at: z.string().nullable(),
})

export const queueResponseSchema = z.object({
  rows: z.array(queueRowSchema),
  selectedLabel: z.string(),
  approvedCount: z.number().int().nonnegative(),
  orgs: z.array(queueOrgSchema),
  nextOrg: queueNextOrgSchema.nullable(),
  counts: z.object({
    pending: z.number().int().nonnegative(),
    approved: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    aaa: z.number().int().nonnegative(),
  }),
})

export const queueActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('decide'),
    personId: z.string().uuid(),
    approve: z.boolean(),
    typeCode: queueTypeSchema.nullable().optional(),
    dayValidity: queueDayValiditySchema.nullable().optional(),
    reason: z.string().trim().max(300).nullable().optional(),
  }),
  z.object({
    action: z.literal('approve_org'),
    orgId: z.string().uuid(),
    // Bulk approval is for requestable tiers only. The database refuses aaa
    // here regardless; Artist and General Admission are refused as an affordance.
    typeCode: requestableTierCodeSchema,
    dayValidity: queueDayValiditySchema,
  }),
  z.object({
    action: z.literal('reject_org'),
    orgId: z.string().uuid(),
    reason: z.string().trim().min(1).max(300),
  }),
])

export type QueueRow = z.infer<typeof queueRowSchema>
export type QueueAction = z.infer<typeof queueActionSchema>
