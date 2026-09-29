import { z } from 'zod'
import { ORG_KINDS, ORG_TYPE_CODES } from './org'
import { EMPTY_MASTER_FILTERS, masterFiltersSchema } from '../master-filter'

export const masterQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  format: z.enum(['json', 'csv']).default('json'),
  /**
   * The screen filters the whole roster in the browser (r8-master.html does),
   * so these only shape the CSV: the download is what the operator is looking
   * at. `org` is EXACT org ids, never a name match (ADR-021) — a company called
   * "Sound" must not drag in "Soundcheck Ltd".
   */
  filters: masterFiltersSchema.default(() => EMPTY_MASTER_FILTERS),
})

export const masterRowSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  /** The organisation's id, so the screen can filter by it exactly. */
  orgId: z.string(),
  phone: z.string(),
  orgName: z.string(),
  /** `boa_acc_person.role_text`, as the pass shows it. */
  role: z.string(),
  /** `boa_acc_person.day_validity`; null until the person is approved. */
  dayValidity: z.enum(['build', 'show', 'build_show']).nullable(),
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
