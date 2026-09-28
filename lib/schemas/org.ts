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

// ADR-019 / ACC-140g (22 Sep 2026): quotas were dropped — nothing enforces
// `boa_acc_org.quota` any more. It is no longer collected from the operator;
// POST /api/desk/orgs passes ORG_QUOTA_NON_ENFORCING (below) to
// `boa_acc_create_org`, whose `p_quota` argument the RPC still requires (no
// migration to change its signature — out of scope here; see ROADMAP/ADR-019).
export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ORG_KINDS),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+91[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number'),
  defaultType: requestableTierCodeSchema.optional(),
})

export type OrgCreateInput = z.infer<typeof orgCreateSchema>

/**
 * The value POST /api/desk/orgs passes for `boa_acc_create_org`'s required
 * `p_quota` argument now that nothing reads or enforces it (ADR-019,
 * ACC-140g, 22 Sep 2026). The column's CHECK still requires 0-500; 500 (the
 * ceiling) reads as "no real ceiling" rather than as a number anyone chose.
 */
export const ORG_QUOTA_NON_ENFORCING = 500

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

/**
 * The row above, plus the two counts ADR-019 makes the point of this screen:
 * how many people the organisation has sent (any status their import/desk
 * work landed them in) and how many of those are approved. Computed in
 * GET /api/desk/orgs from `boa_acc_person`, not stored — never a fixture.
 */
export const orgRowWithCountsSchema = orgRowSchema.extend({
  submittedCount: z.number().int().min(0),
  approvedCount: z.number().int().min(0),
  /**
   * How many of this org's people have a live wristband checkin (the same
   * void-aware ledger read as GET /api/desk/master's `bandSerial`), i.e.
   * physically collected. r10 (design/source/r10/r8-orgs.html) shows this as
   * its own "Collected" column with a progress meter against `approvedCount`.
   */
  collectedCount: z.number().int().min(0),
})

export type OrgRow = z.infer<typeof orgRowSchema>
export type OrgRowWithCounts = z.infer<typeof orgRowWithCountsSchema>

// Invite-link minting (mintInviteSchema / mintedInviteSchema / inviteRowSchema)
// was removed with the invite-link UI and its API route (ADR-019, 22 Sep):
// organisations are now real records the admin creates on this screen, not a
// list of vendor-link generators. boa_acc_mint_invite and boa_acc_org_invite
// stay in the database (no migration in this change) but nothing in the app
// calls them any more.
