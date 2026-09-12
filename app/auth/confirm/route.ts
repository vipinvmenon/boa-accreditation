import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import type { EmailOtpType } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Where the invite/recovery email templates now point (config/auth's
 * mailer_templates_invite_content), instead of {{ .ConfirmationURL }} —
 * Supabase's own hosted `/auth/v1/verify` redirect, which hands the browser
 * an implicit-flow `#access_token=...` fragment. `@supabase/ssr`'s
 * `createBrowserClient` hardcodes `flowType: "pkce"` (confirmed by reading
 * its source, 12 Sep 2026 — an `auth.flowType` option passed in is silently
 * overwritten) and PKCE only recognises `?code=`, so that fragment was never
 * even parsed: no session, no cookie, no error, silently falling through to
 * the plain sign-in form.
 *
 * The fix is Supabase's own documented pattern for this exact situation:
 * verify server-side with `token_hash` + `type` (both plain query params,
 * not a fragment) via the SSR server client, which persists the session as a
 * cookie before the browser ever runs a line of client JS. No flow-type
 * mismatch is possible because no client-side URL parsing happens at all.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/desk/login'

  if (tokenHash && type) {
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const redirectUrl = new URL(next, origin)
      if (type === 'invite' || type === 'recovery') redirectUrl.searchParams.set('flow', type)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return NextResponse.redirect(new URL('/desk/login?error=invalid_link', origin))
}
