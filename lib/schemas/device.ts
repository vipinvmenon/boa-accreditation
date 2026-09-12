import { z } from 'zod'

/**
 * Mirrors the CHECK constraints on `public.boa_acc_device`
 * (202609110001_boa_acc_core.sql) and the parameters of
 * `public.boa_acc_mint_device` / `public.boa_acc_revoke_device`
 * (202609121900). The usability affordance only — the database enforces
 * the same rule regardless (non-negotiable #3).
 */
export const DEVICE_SCOPES = ['crew', 'vehicle', 'both'] as const

export const deviceMintSchema = z.object({
  gateLabel: z.string().trim().min(1).max(40),
  volunteerName: z.string().trim().min(2).max(60),
  scope: z.enum(DEVICE_SCOPES).default('crew'),
  // ISO datetime string. Omitted -> the RPC's own default (the show's own
  // end time). Never a bare column write — the function validates it is in
  // the future before it ever reaches the CHECK-constrained column.
  expiresAt: z
    .string()
    .datetime()
    .optional()
    .or(z.literal('').transform(() => undefined)),
})

export type DeviceMintInput = z.infer<typeof deviceMintSchema>

/** Shape of boa_acc_mint_device's row — the raw token is returned once. */
export const mintedDeviceSchema = z.object({
  device_id: z.string(),
  token: z.string(),
  token_hint: z.string(),
  gate_label: z.string(),
  volunteer_name: z.string(),
  scope: z.enum(DEVICE_SCOPES),
  expires_at: z.string(),
})

export type MintedDevice = z.infer<typeof mintedDeviceSchema>

/**
 * Shape of one row from `boa_acc_device`, as selected by GET /api/desk/devices.
 * NEVER includes token_hash — the column grant to `authenticated` omits it
 * (202609110002), and this schema must not invite anyone to select it back.
 */
export const deviceRowSchema = z.object({
  id: z.string(),
  token_hint: z.string(),
  gate_label: z.string(),
  volunteer_name: z.string(),
  scope: z.enum(DEVICE_SCOPES),
  created_at: z.string(),
  created_by: z.string().nullable(),
  last_seen_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  expires_at: z.string(),
})

export type DeviceRow = z.infer<typeof deviceRowSchema>
