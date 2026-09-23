import { operatorRoleSchema } from '@/lib/schemas/operator'
import type { z } from 'zod'

/**
 * Where to send someone after they sign in (ACC-150).
 *
 * `?next=` is attacker-controllable — it rides in a link — so it is an
 * allowlist of in-app paths, never "anything starting with /". A bare
 * `new URL(next, origin)` treats `https://evil.example` as absolute and
 * ignores the origin; `//host/path` and `/\host/path` are resolved by
 * browsers as off-site too. Only `/gate`, `/gate/...` and `/desk/...` are
 * accepted, and anything else falls back to the role's own home.
 */
const ALLOWED = /^\/(gate|desk)(\/[A-Za-z0-9\-._~/]*)?$/

export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('//') || value.includes('\\') || value.includes('://')) return null
  return ALLOWED.test(value) ? value : null
}

/** An issuer has no desk to go to — the gate is their whole app (ADR-020). */
export function homeForRole(role: z.infer<typeof operatorRoleSchema> | null): string {
  return role === 'issuer' ? '/gate' : '/desk'
}

export function destinationAfterLogin(
  next: string | null | undefined,
  role: z.infer<typeof operatorRoleSchema> | null,
): string {
  return safeNext(next) ?? homeForRole(role)
}
