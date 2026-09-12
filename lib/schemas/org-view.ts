import { z } from 'zod'

/** Shape of boa_acc_org_view's row, as returned by GET /api/s/[token]. */
export const orgViewSchema = z.object({
  org_id: z.string(),
  name: z.string(),
  kind: z.string(),
  status: z.string(),
  quota: z.number(),
  used: z.number(),
  remaining: z.number(),
  default_type: z.string(),
})

export type OrgView = z.infer<typeof orgViewSchema>
