/**
 * ACC-150 (ADR-020) — who is at this gate.
 *
 * Replaces gate/device-token.ts. There is no pasted secret any more: an
 * issuer logs in like the desk does, and the Supabase session cookie rides
 * every same-origin request. Nothing here is a control — the database
 * refuses anyone who is not an active issuer, lead or admin
 * (private.boa_acc_gate_operator). This only decides where to send a person
 * whose session the server has just refused.
 */
import { gateSessionSchema, type GateSession } from '@/lib/schemas/operator'

export const GATE_PATH = '/gate'

/** The desk login page, returning here afterwards. */
export function loginHref(next: string = GATE_PATH): string {
  return `/desk/login?next=${encodeURIComponent(next)}`
}

export type GateSessionCheck =
  | { state: 'ok'; session: GateSession }
  /** no session, or it has expired: log in */
  | { state: 'not_signed_in' }
  /** signed in, but not a gate role (an approver, say) */
  | { state: 'not_authorized' }
  /** no answer — offline, or the server is unreachable. Say nothing, keep working. */
  | { state: 'unknown' }

/**
 * Ask the server who is signed in. Called on load while online; offline it is
 * never called, because a phone that has already pulled must keep working
 * with the radio off (non-negotiable #7) and a cached gate is exactly what
 * ADR-020 accepts: the session is checked again by the server on the next
 * write, and until then the outbox holds everything.
 */
export async function checkGateSession(): Promise<GateSessionCheck> {
  let response: Response
  try {
    response = await fetch('/api/gate/session', { credentials: 'same-origin', cache: 'no-store' })
  } catch {
    return { state: 'unknown' }
  }
  if (response.status === 401) return { state: 'not_signed_in' }
  if (response.status === 403) return { state: 'not_authorized' }
  if (!response.ok) return { state: 'unknown' }
  const parsed = gateSessionSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? { state: 'ok', session: parsed.data } : { state: 'unknown' }
}

/**
 * ACC-165 — the one mechanism every `/gate/*` screen uses to send a
 * signed-out visitor to login, extracted so `/gate/vehicle` (and anything
 * after it) shares it rather than copying `/gate`'s inline check.
 *
 * Offline this never redirects (non-negotiable #7): a phone that has
 * already pulled must keep resolving scans and logging vehicle events with
 * the radio off, and the server checks the session again on the next
 * write — until then the outbox holds everything. Returns `true` only when
 * it actually navigated away, so a caller mid-boot knows to stop.
 */
export async function redirectIfSignedOut(next: string = GATE_PATH): Promise<boolean> {
  if (!navigator.onLine) return false
  const check = await checkGateSession()
  if (check.state !== 'not_signed_in' && check.state !== 'not_authorized') return false
  // A real navigation, not a router.replace: the service worker serves
  // /gate/* from cache, and the login page is outside its scope.
  window.location.assign(loginHref(next))
  return true
}
