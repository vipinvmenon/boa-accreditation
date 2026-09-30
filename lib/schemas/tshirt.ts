import { z } from 'zod'

/** ACC-197b: a volunteer hands a crew member their T-shirt. */
export const tshirtRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
  personId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }).nullable().optional(),
})

export const tshirtResponseSchema = z.object({
  id: z.string().uuid(),
  personId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  size: z.enum(['S', 'M', 'L', 'XL', 'XXL', '3XL']),
  operatorId: z.string().uuid(),
  gateLabel: z.string().min(1),
  volunteerName: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  postedAt: z.string().datetime({ offset: true }),
})

export type TshirtRequest = z.infer<typeof tshirtRequestSchema>
export type TshirtResponse = z.infer<typeof tshirtResponseSchema>
