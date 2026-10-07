import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  passTokenParamSchema,
  passViewSchema,
  passViewWithQrSchema,
  type PassViewWithQr,
} from '@/lib/schemas/pass-view'
import { passQrSvg } from '@/lib/pass-qr'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type ApiError = { status: number; body: { error: string } }

/** Maps the Postgres errcode raised by boa_acc_pass_view to an HTTP status + body. */
function mapError(error: { code?: string; message?: string }): ApiError {
  const message = error.message ?? ''
  if (error.code === 'P0002' || message.includes('not found')) {
    // 404, not 403 — a 403 confirms a token exists. Unknown, revoked and
    // not-yet-approved tokens all land here identically; see
    // docs/ARCHITECTURE.md.
    return { status: 404, body: { error: 'not_found' } }
  }
  return { status: 500, body: { error: 'internal' } }
}

/**
 * Resolves a pass token to its printable projection via boa_acc_pass_view —
 * the one place this RPC is called. Exported for two callers: this file's
 * own GET and app/p/[passToken]/page.tsx, which calls this directly
 * in-process rather than fetching its own /api/p/[passToken] over the
 * network — same reasoning as app/api/s/[token]/route.ts's resolveOrgView
 * (avoids a Vercel Function fetching its own deployment's URL, a documented
 * source of Deployment-Protection interception). page.tsx never imports
 * lib/supabase-admin directly; only route handlers and scripts/** are
 * exempted from that eslint rule (eslint.config.*).
 */
export async function resolvePassView(
  token: string,
): Promise<{ ok: true; data: PassViewWithQr } | { ok: false; error: ApiError }> {
  if (!passTokenParamSchema.safeParse(token).success) {
    return { ok: false, error: { status: 404, body: { error: 'not_found' } } }
  }

  const client = supabaseAdmin()
  const { data, error } = await client.rpc('boa_acc_pass_view', { p_token: token })
  if (error) return { ok: false, error: mapError(error) }

  const row = passViewSchema.safeParse(data)
  if (!row.success) return { ok: false, error: { status: 500, body: { error: 'internal' } } }

  const qrSvg = await passQrSvg(token)

  const parsed = passViewWithQrSchema.safeParse({ ...row.data, qrSvg })
  if (!parsed.success) return { ok: false, error: { status: 500, body: { error: 'internal' } } }
  return { ok: true, data: parsed.data }
}

function throttle(request: Request) {
  const ip = clientIp(request.headers)
  // Same generous, single-instance ceiling as /api/s/[token] — the real
  // defence is the token's own 128 bits of entropy (see PASS_TOKEN_RE above),
  // not this counter.
  const result = checkRateLimit(ip, 30, 60_000)
  if (!result.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(result.retryAfterSec) } },
    )
  }
  return null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ passToken: string }> },
) {
  const limited = throttle(request)
  if (limited) return limited

  const { passToken } = await params
  const result = await resolvePassView(passToken)
  if (!result.ok) {
    return NextResponse.json(result.error.body, {
      status: result.error.status,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  }
  return NextResponse.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } })
}
