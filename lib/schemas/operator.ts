import { z } from 'zod'

/**
 * boa_acc_operator_role: 'lead' | 'approver' | 'admin' from
 * 202609110001_boa_acc_core.sql, plus 'issuer' from
 * 202609221200_boa_acc_issuer_role.sql (ACC-150, ADR-020) — a gate-only role:
 * pull the roster, issue bands, log vehicle events. The database enforces
 * what each role may do; this list only validates the shape.
 */
export const operatorRoleSchema = z.enum(['lead', 'approver', 'admin', 'issuer'])

/**
 * Roles the gate RPCs accept (private.boa_acc_gate_operator in
 * 202609221201). A usability affordance for routing a signed-in person to
 * the right screen — never the control; the database refuses everyone else.
 */
export const GATE_ROLES = ['issuer', 'lead', 'admin'] as const satisfies readonly z.infer<typeof operatorRoleSchema>[]

export function canUseGate(role: z.infer<typeof operatorRoleSchema>): boolean {
  return (GATE_ROLES as readonly string[]).includes(role)
}

export const OPERATOR_ROLE_COPY = {
  lead: {
    label: 'Lead',
    description: 'Manage the desk, approve and import people, send passes, and use the gate.',
    canUseGate: true,
  },
  approver: {
    label: 'Approver',
    description: 'Review and approve people in the desk; cannot use the gate.',
    canUseGate: false,
  },
  admin: {
    label: 'Admin',
    description: 'Manage users and desk operations, and use the gate.',
    canUseGate: true,
  },
  issuer: {
    label: 'Issuer',
    description: 'Check people in, issue wristbands, and log vehicle events; gate only.',
    canUseGate: true,
  },
} as const satisfies Record<
  z.infer<typeof operatorRoleSchema>,
  { label: string; description: string; canUseGate: boolean }
>

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

/** Body of PATCH /api/desk/operators/[id] — exactly one mutation. */
export const setOperatorActiveSchema = z.object({
  active: z.boolean(),
}).strict()

export const setOperatorRoleSchema = z.object({
  role: operatorRoleSchema,
}).strict()

export const patchOperatorSchema = z.union([setOperatorActiveSchema, setOperatorRoleSchema])

/** Shape of boa_acc_set_operator_active / boa_acc_set_operator_role. */
export const setOperatorActiveResultSchema = z.object({
  user_id: z.string(),
  role: operatorRoleSchema,
  display_name: z.string(),
  active: z.boolean(),
  created_at: z.string().optional(),
})

/** GET /api/gate/session — the signed-in gate operator (ACC-150). */
export const gateSessionSchema = z.object({
  operatorId: z.string().uuid(),
  displayName: z.string(),
  role: z.enum(GATE_ROLES),
})

export type GateSession = z.infer<typeof gateSessionSchema>
