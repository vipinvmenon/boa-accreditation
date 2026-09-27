'use client'

/**
 * ACC-165 — the sign-in guard every `/gate/*` screen needs, not just `/gate`.
 *
 * `/gate` checked `checkGateSession()` on boot and sent a signed-out visitor
 * to `/desk/login?next=/gate`; `/gate/vehicle` never did, so signed out it
 * rendered the full vehicle screen and every write came back 401, silently.
 * This hook is the same mechanism (`redirectIfSignedOut`, which is exactly
 * what `/gate`'s boot effect now also calls), parameterised by the route to
 * return to.
 *
 * Offline, this is a no-op — a phone that has already pulled must keep
 * working with the radio off (non-negotiable #7). See gate/session.ts.
 */
import { useEffect } from 'react'
import { GATE_PATH, redirectIfSignedOut } from '@/gate/session'

export function useGateSessionGuard(next: string = GATE_PATH): void {
  useEffect(() => {
    void redirectIfSignedOut(next)
  }, [next])
}
