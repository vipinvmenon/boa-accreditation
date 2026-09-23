import { z } from 'zod'
import { tierCodeSchema } from './accreditation'

/**
 * The public pass projection returned by boa_acc_pass_view
 * (202609221400_boa_acc_pass_view.sql) for /p/[passToken]. Deliberately
 * narrower than lib/schemas/pass.ts's passSchema (the desk's own printable
 * projection): no `id`, no `passToken` — the caller already holds the token
 * in the URL and nothing here should hand back a second credential — and,
 * same as every other surface, never a phone (non-negotiable #9).
 */
export const passViewSchema = z.object({
  fullName: z.string(),
  role: z.string(),
  vehicleReg: z.string().nullable(),
  orgName: z.string(),
  passRef: z.string(),
  typeCode: tierCodeSchema,
  dayValidity: z.enum(['build', 'show', 'build_show']),
})

export const passViewWithQrSchema = passViewSchema.extend({
  qrSvg: z.string(),
})

export type PassView = z.infer<typeof passViewSchema>
export type PassViewWithQr = z.infer<typeof passViewWithQrSchema>

/**
 * The URL path segment, validated before it ever reaches the database. A
 * real pass_token is exactly what private.boa_acc_new_token() mints
 * (202609110001_boa_acc_core.sql): 16 bytes from extensions.gen_random_bytes,
 * base64url-encoded to 22 characters — 128 bits of entropy. Anything else
 * cannot be a real token, so app/api/p/[passToken]/route.ts refuses it
 * before a round trip to boa_acc_pass_view.
 */
export const passTokenParamSchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/)
