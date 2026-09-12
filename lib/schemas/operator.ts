import { z } from 'zod'

/** boa_acc_operator_role, from 202609110001_boa_acc_core.sql. */
export const operatorRoleSchema = z.enum(['lead', 'approver', 'admin'])

export const inviteOperatorSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(2).max(80),
  role: operatorRoleSchema,
})

export type InviteOperatorInput = z.infer<typeof inviteOperatorSchema>
