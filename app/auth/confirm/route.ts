import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// The only two types our own email templates ever send (config/auth's
// mailer_templates_invite_content / ..._recovery_content) — not the full
// Supabase EmailOtpType union, which includes flows this app doesn't use.
const otpTypeSchema = z.enum(['invite', 'recovery'])

// Only an in-app relative path — never an absolute URL. `next` is
// attacker-controllable (it rides in the emailed link), and a bare
// `new URL(next, origin)` treats a scheme-qualified `next` as absolute,
// ignoring `origin` entirely: `?next=https://evil.example` would redirect a
// just-authenticated session straight off-site. `//host/path` (a
// protocol-relative URL) is rejected the same way — browsers resolve it
// against the current scheme, so it is exactly as off-site as an absolute one.
function safeNextPath(value: string | null): string {
  if (value && value.startsWith('/') && !value.startsWith('//')) return value
  return '/desk/login'
}

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
  const parsedType = otpTypeSchema.safeParse(searchParams.get('type'))
  const next = safeNextPath(searchParams.get('next'))

  if (tokenHash && parsedType.success) {
    const type = parsedType.data
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const redirectUrl = new URL(next, origin)
      redirectUrl.searchParams.set('flow', type)
      return NextResponse.redirect(redirectUrl)
    }
  }

  return NextResponse.redirect(new URL('/desk/login?error=invalid_link', origin))
}
