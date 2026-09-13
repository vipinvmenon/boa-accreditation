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
 *
 * GET does not call verifyOtp. Confirmed via Supabase's own auth logs (13
 * Sep 2026): a `/verify` request for vipinmenon16@gmail.com's recovery token
 * came from an IP that was never his, minutes before he opened the email,
 * and burned the single-use token with `otp_expired` by the time he clicked
 * — a mail-security link-prescanner GETting every link in the message. Any
 * side-effecting action on a GET is fetchable by something other than the
 * recipient. GET here only renders a page with the token in a hidden field;
 * verifyOtp runs on POST, which a prescanner does not submit.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const parsedType = otpTypeSchema.safeParse(searchParams.get('type'))
  const next = safeNextPath(searchParams.get('next'))

  if (!tokenHash || !parsedType.success) {
    return NextResponse.redirect(new URL('/desk/login?error=invalid_link', origin))
  }

  const heading = parsedType.data === 'recovery' ? 'Reset your password' : 'Accept your invite'
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${heading}</title>
<style>
  body{background:var(--bg,#0A0A0A);color:var(--ink,#F2EFE2);font-family:Arial,Helvetica,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
  main{width:100%;max-width:360px}
  h1{font-size:22px;margin:0 0 12px}
  p{font-size:13.5px;color:var(--ink2,rgba(242,239,226,0.72));line-height:1.5}
  button{cursor:pointer;border:1px solid var(--grn,#00F5A5);background:var(--grn,#00F5A5);color:var(--on,#0A0A0A);padding:14px 22px;font-size:14px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;width:100%;margin-top:16px}
</style></head>
<body><main>
  <h1>${heading}</h1>
  <p>For your security, this link needs one more click from you before it takes effect — some mail providers scan links automatically, which would otherwise use up a one-time link before you ever see it.</p>
  <form method="POST">
    <input type="hidden" name="token_hash" value="${tokenHash.replace(/"/g, '&quot;')}">
    <input type="hidden" name="type" value="${parsedType.data}">
    <input type="hidden" name="next" value="${next.replace(/"/g, '&quot;')}">
    <button type="submit">Continue</button>
  </form>
</main></body></html>`

  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
}

export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const form = await request.formData()
  const tokenHash = form.get('token_hash')
  const parsedType = otpTypeSchema.safeParse(form.get('type'))
  const next = safeNextPath(typeof form.get('next') === 'string' ? (form.get('next') as string) : null)

  if (typeof tokenHash === 'string' && tokenHash && parsedType.success) {
    const type = parsedType.data
    const supabase = await supabaseServer()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      const redirectUrl = new URL(next, origin)
      redirectUrl.searchParams.set('flow', type)
      return NextResponse.redirect(redirectUrl, { status: 303 })
    }
  }

  return NextResponse.redirect(new URL('/desk/login?error=invalid_link', origin), { status: 303 })
}
