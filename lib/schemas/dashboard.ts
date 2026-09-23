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

/**
 * One row per tier, in boa_acc_type.sort_order (ADR-018). `count` is the RPC's;
 * `note` is boa_acc_type.note, merged in by /api/desk/dashboard (absent when
 * that read fails — the card simply omits it). Label, band and colour come
 * from lib/design.ts's pack mirror.
 */
export const dashboardTypeSchema = z.object({
  code: z.enum(ORG_TYPE_CODES),
  count: z.number(),
  note: z.string().nullable().optional(),
})

/** The columns /api/desk/dashboard reads from boa_acc_type to enrich `types`. */
export const dashboardTypeNoteSchema = z.object({
  code: z.enum(ORG_TYPE_CODES),
  note: z.string().nullable(),
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
  /**
   * ACC-148 (202609221300): people holding two or more live, non-reissue
   * wristbands. Defaults to 0 only so the Control room still renders if the
   * app deploys before the migration is pushed; `db:state`'s WITNESS row is
   * what says whether the function exists.
   */
  doubleIssues: z.number().int().nonnegative().default(0),
  types: z.array(dashboardTypeSchema),
  orgs: z.array(dashboardOrgSchema),
})

const isoDateTime = z.string().datetime({ offset: true })

/**
 * One live wristband row inside a double-issue warning. `issuerName` is the
 * operator's display name when the ledger row names an operator (ACC-150),
 * else the device volunteer_name the gate RPC wrote (`issuerKind` says which).
 */
export const doubleIssueBandSchema = z.object({
  checkinId: z.string().uuid(),
  bandSerial: z.string().nullable(),
  issuerName: z.string(),
  issuerKind: z.enum(['operator', 'device']),
  operatorId: z.string().uuid().nullable(),
  deviceId: z.string().uuid().nullable(),
  gateLabel: z.string().nullable(),
  occurredAt: isoDateTime,
  postedAt: isoDateTime,
  isReissue: z.boolean(),
})

/** One element of `public.boa_acc_double_issues()` (202609221300): one person. */
export const doubleIssueSchema = z.object({
  personId: z.string().uuid(),
  fullName: z.string(),
  orgName: z.string(),
  typeCode: z.enum(ORG_TYPE_CODES).nullable(),
  liveBands: z.number().int().min(2),
  issues: z.array(doubleIssueBandSchema).min(2),
})

export const doubleIssueListSchema = z.array(doubleIssueSchema)

/**
 * What /api/desk/dashboard returns: the RPC's payload, plus the double-issue
 * list, which the route fetches only when `doubleIssues` is non-zero. `null`
 * means the count is known but the list read failed — the screen still warns.
 */
export const dashboardResponseSchema = dashboardSchema.extend({
  doubleIssueList: doubleIssueListSchema.nullable().default([]),
})

export type Dashboard = z.infer<typeof dashboardSchema>
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>
export type DoubleIssue = z.infer<typeof doubleIssueSchema>
export type DoubleIssueBand = z.infer<typeof doubleIssueBandSchema>
export type DashboardOrg = z.infer<typeof dashboardOrgSchema>
export type DashboardType = z.infer<typeof dashboardTypeSchema>
