import { z } from 'zod'

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

export const ORG_TYPE_CODES = ['crew', 'stage', 'aaa'] as const

export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ORG_KINDS),
  quota: z.coerce.number().int().min(0).max(500),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+91[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number'),
  defaultType: z.enum(ORG_TYPE_CODES).optional(),
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

/** Body of POST /api/desk/orgs/[id]/invites — a label is optional. */
export const mintInviteSchema = z.object({
  label: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

/** Shape of boa_acc_mint_invite's row — the raw token is returned once. */
export const mintedInviteSchema = z.object({
  invite_id: z.string(),
  token: z.string(),
  token_hint: z.string(),
  expires_at: z.string(),
})

export type MintedInvite = z.infer<typeof mintedInviteSchema>

/** Shape of one row from `boa_acc_org_invite`, as selected by GET .../invites. */
export const inviteRowSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  token_hint: z.string(),
  label: z.string().nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
  use_count: z.number(),
  revoked_at: z.string().nullable(),
  expires_at: z.string(),
})

export type InviteRow = z.infer<typeof inviteRowSchema>
