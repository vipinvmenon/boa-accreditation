import { z } from 'zod'
import { TIER_CODES } from '@/lib/design'
import { REQUESTABLE_TIER_CODES } from '@/lib/desk-tiers'

/**
 * Mirrors the CHECK constraints on `public.boa_acc_org`
 * (202609110001_boa_acc_core.sql) and the parameters of
 * `public.boa_acc_create_org` (202609120009). The usability affordance only —
 * the database enforces the same rule regardless (non-negotiable #3).
 */
export const ORG_KINDS = [
  'vendor',
  'crew',
  'sponsor',
  'media',
  'security',
  'contractor',
] as const

/**
 * Every tier boa_acc_type_code can hold (ADR-018). What an org row may carry
 * when READ — the column is the enum, so all eight can appear.
 */
export const ORG_TYPE_CODES = TIER_CODES

/** What an operator may SET as an org's default: the requestable tiers. */
export const requestableTierCodeSchema = z.enum(REQUESTABLE_TIER_CODES)

export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ORG_KINDS),
  quota: z.coerce.number().int().min(0).max(500),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+91[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number'),
  defaultType: requestableTierCodeSchema.optional(),
})

export type OrgCreateInput = z.infer<typeof orgCreateSchema>

/** Shape of one row from `boa_acc_org`, as selected by GET /api/desk/orgs. */
export const orgRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ORG_KINDS),
  quota: z.number(),
  default_type: z.enum(ORG_TYPE_CODES),
  contact_name: z.string(),
  contact_phone: z.string(),
  status: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export type OrgRow = z.infer<typeof orgRowSchema>

// Invite-link minting (mintInviteSchema / mintedInviteSchema / inviteRowSchema)
// was removed with the invite-link UI and its API route (ADR-019, 22 Sep):
// organisations are now real records the admin creates on this screen, not a
// list of vendor-link generators. boa_acc_mint_invite and boa_acc_org_invite
// stay in the database (no migration in this change) but nothing in the app
// calls them any more.
