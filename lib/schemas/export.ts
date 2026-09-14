import { z } from 'zod'

/**
 * GET /api/desk/export — the full, unfiltered, chronological
 * `boa_acc_checkin` ledger. Unlike /api/desk/master (which dedupes to the
 * latest checkin per person/kind and drops voided rows for display), this
 * export is for post-show reconciliation against the paper fallback
 * (ACC-072): every row, in the order it physically happened.
 */
export const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
})

export const exportRowSchema = z.object({
  id: z.string(),
  occurredAt: z.string(),
  postedAt: z.string(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  fullName: z.string(),
  phone: z.string(),
  orgName: z.string(),
  bandSerial: z.string().nullable(),
  stickerNo: z.string().nullable(),
  vehicleReg: z.string().nullable(),
  isReissue: z.boolean(),
  supervisorNote: z.string().nullable(),
  voidsCheckinId: z.string().nullable(),
  voidsDescription: z.string().nullable(),
  gateLabel: z.string(),
  volunteerName: z.string(),
})

export const exportResponseSchema = z.object({
  rows: z.array(exportRowSchema),
})

export type ExportRow = z.infer<typeof exportRowSchema>
