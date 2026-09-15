import { z } from 'zod'

/**
 * Mirrors the CHECK constraints on `public.boa_acc_person`
 * (202609110001_boa_acc_core.sql). This is the usability affordance only —
 * the database enforces the same rule regardless (non-negotiable #3).
 *
 * Collects exactly name, phone, role and vehicle registration — nothing else
 * (non-negotiable #9).
 */
export const submissionSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z
    .string()
    .trim()
    .regex(/^\+91[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number'),
  roleText: z.string().trim().min(2).max(60),
  vehicleReg: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export type SubmissionInput = z.infer<typeof submissionSchema>

export const rosterRowSchema = z.object({
  fullName: z.string(),
  roleText: z.string(),
  status: z.enum(['approved', 'submitted', 'rejected']),
})

export const submissionResponseSchema = z.object({
  org: z.object({
    org_id: z.string(),
    name: z.string(),
    kind: z.string(),
    status: z.string(),
    quota: z.number(),
    used: z.number(),
    remaining: z.number(),
    default_type: z.string(),
  }),
  roster: z.array(rosterRowSchema),
})

export type RosterRow = z.infer<typeof rosterRowSchema>

export const submitResultSchema = z.object({ id: z.string() })
