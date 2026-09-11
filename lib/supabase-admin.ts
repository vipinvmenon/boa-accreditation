import { createClient } from '@supabase/supabase-js'

/**
 * Server-only, service-role client. Never import this from a Client
 * Component or anything under `app/` that is not a route handler or server
 * action — the service role bypasses RLS entirely, and `boa_acc_org_view` /
 * `boa_acc_submit` grant EXECUTE to `service_role` only (see
 * 202609110004_boa_acc_submit.sql). `SUPABASE_SERVICE_ROLE_KEY` has no
 * `NEXT_PUBLIC_` prefix on purpose; see .env.example.
 */
export function supabaseAdmin() {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
