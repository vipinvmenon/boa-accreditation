import { z } from 'zod'

/** boa_acc_operator_role, from 202609110001_boa_acc_core.sql. */
export const operatorRoleSchema = z.enum(['lead', 'approver', 'admin'])

export const inviteOperatorSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().min(2).max(80),
  role: operatorRoleSchema,
})

export type InviteOperatorInput = z.infer<typeof inviteOperatorSchema>

/**
 * Mirrors the column grant on `public.boa_acc_operator`
 * (202609110002_boa_acc_lock_down_privileges.sql: `user_id, role,
 * display_name, active, created_at`) — the only columns a session can read.
 */
export const operatorRowSchema = z.object({
  user_id: z.string(),
  role: operatorRoleSchema,
  display_name: z.string(),
  active: z.boolean(),
  created_at: z.string(),
})

export type OperatorRow = z.infer<typeof operatorRowSchema>

/** Body of PATCH /api/desk/operators/[id] — set_operator_active's p_active. */
export const setOperatorActiveSchema = z.object({
  active: z.boolean(),
})

/** Shape of boa_acc_set_operator_active's returned row. */
export const setOperatorActiveResultSchema = z.object({
  user_id: z.string(),
  role: operatorRoleSchema,
  display_name: z.string(),
  active: z.boolean(),
})
