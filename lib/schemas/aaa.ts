import { z } from 'zod'

export const aaaNominationInputSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+91[6-9][0-9]{9}$/),
  orgHint: z.string().trim().max(120).optional().or(z.literal('').transform(() => undefined)),
})

export const aaaNominationIdSchema = z.object({
  id: z.string().uuid(),
})

export const aaaNominationSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string(),
  phone: z.string(),
  org_hint: z.string().nullable(),
  nominated_by: z.string().uuid().nullable(),
  nominated_at: z.string(),
  approved: z.boolean(),
  approved_at: z.string().nullable(),
  approved_by: z.string().uuid().nullable(),
  person_id: z.string().uuid().nullable(),
})

export type AaaNomination = z.infer<typeof aaaNominationSchema>
