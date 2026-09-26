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
const ALLOWED_PATH = /^\/(gate|desk)(\/[A-Za-z0-9\-._~/]*)?$/
const MASTER_QUERY_KEYS = new Set(['org', 'in_bms', 'q'])

export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('//') || value.includes('\\') || value.includes('://')) return null
  const [path = '', query = ''] = value.split('?', 2)
  if (!ALLOWED_PATH.test(path)) return null
  if (!query) return query === '' && !value.includes('?') ? value : null
  if (path !== '/desk/master') return null

  const segments = query.split('&')
  if (segments.some((segment) => segment === '')) return null
  const params = new URLSearchParams(query)
  const keys = [...params.keys()]
  if (new Set(keys).size !== keys.length) return null
  if (keys.some((key) => !MASTER_QUERY_KEYS.has(key))) return null
  if (params.has('org') && !/^[0-9a-f-]{36}$/i.test(params.get('org') ?? '')) return null
  if (params.has('in_bms') && !['true', 'false'].includes(params.get('in_bms') ?? '')) return null
  return value
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
