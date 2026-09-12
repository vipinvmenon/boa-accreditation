import { z } from 'zod'
import { ORG_KINDS, ORG_TYPE_CODES } from './org'

/** One row of the dashboard's own org list. Aggregate only — no roster. */
export const dashboardOrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ORG_KINDS),
  defaultType: z.enum(ORG_TYPE_CODES),
  contactName: z.string(),
  contactPhone: z.string(),
  quota: z.number(),
  used: z.number(),
  status: z.string(),
})

/** One row of the three pass types. label/colour/etc come from lib/design.ts. */
export const dashboardTypeSchema = z.object({
  code: z.enum(ORG_TYPE_CODES),
  count: z.number(),
})

/**
 * Shape of `public.boa_acc_desk_dashboard()` (202609120010) —
 * "every Control-room number in one round trip" (DATA-MODEL.md).
 */
export const dashboardSchema = z.object({
  submittedTotal: z.number(),
  submittedOrgs: z.number(),
  approvedTotal: z.number(),
  pendingTotal: z.number(),
  bandsIssued: z.number(),
  bandsNotCollected: z.number(),
  stickersActive: z.number(),
  stickersPending: z.number(),
  bmsAdded: z.number(),
  bmsPending: z.number(),
  aaaStamped: z.number(),
  aaaNominatedApproved: z.number(),
  types: z.array(dashboardTypeSchema),
  orgs: z.array(dashboardOrgSchema),
})

export type Dashboard = z.infer<typeof dashboardSchema>
export type DashboardOrg = z.infer<typeof dashboardOrgSchema>
export type DashboardType = z.infer<typeof dashboardTypeSchema>
