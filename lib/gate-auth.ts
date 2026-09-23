import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

/**
 * The gate's route-level authentication (ACC-150, ADR-020). The same
 * mechanism as the desk: the Supabase session cookie, read by
 * lib/supabase-server.ts with the publishable key. No device token, and no
 * service role — every gate RPC runs as the signed-in operator, so the
 * database sees auth.uid() and decides (private.boa_acc_gate_operator:
 * active issuer, lead or admin). This helper only answers "is anyone signed
 * in?"; it is not the authorisation.
 *
 * A 401 is what the outbox keeps queued work on (gate/outbox-policy.ts), so
 * a session that lapsed offline loses nothing: the writes wait for a login.
 */
export async function gateSession() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      supabase: null,
      user: null,
      response: NextResponse.json({ error: 'not_authenticated' }, { status: 401 }),
    } as const
  }
  return { supabase, user, response: null } as const
}

/** 42501 from a gate RPC: signed in, but not an active gate operator. */
export function notAuthorized() {
  return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
}
