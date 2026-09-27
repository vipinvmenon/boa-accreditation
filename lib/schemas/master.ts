import { z } from 'zod'
import { ORG_KINDS, ORG_TYPE_CODES } from './org'

export const masterQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  inBms: z.enum(['all', 'true', 'false']).default('all'),
  format: z.enum(['json', 'csv']).default('json'),
  /**
   * ADR-021: one place lists people. Organisations links here rather than
   * listing its own copy of the rows, so this is an EXACT org id, not the free
   * text `q` already matches org names with. A company called "Sound" must not
   * drag in "Soundcheck Ltd" when an operator clicked one specific row.
   * Empty means every organisation.
   */
  org: z.string().trim().max(64).default(''),
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
  /**
   * ACC-162: everyone on the roster, BEFORE `q`/`in_bms`/`org` are applied, so
   * the screen can say "showing 14 of 612" rather than leaving a volunteer to
   * wonder whether a filter ate the other 598. The route already reads every
   * person to build `rows`, so this costs no extra query.
   */
  total: z.number().int().nonnegative(),
})

export type MasterRow = z.infer<typeof masterRowSchema>
