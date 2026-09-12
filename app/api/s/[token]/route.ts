import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { submissionSchema } from '@/lib/schemas/submission'
import { orgViewSchema, type OrgView } from '@/lib/schemas/org-view'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

type ApiError = { status: number; body: { error: string } }

/** Maps the Postgres errcode raised by boa_acc_org_view / boa_acc_submit to an HTTP status + body. */
function mapError(error: { code?: string; message?: string }): ApiError {
  const message = error.message ?? ''
  if (error.code === 'P0002' || message.includes('not found')) {
    // 404, not 403 — a 403 confirms a token exists (see ARCHITECTURE.md).
    return { status: 404, body: { error: 'not_found' } }
  }
  if (message.includes('rate_limited')) return { status: 429, body: { error: 'rate_limited' } }
  if (message.includes('quota_exceeded')) return { status: 409, body: { error: 'quota_exceeded' } }
  if (message.includes('org_closed')) return { status: 403, body: { error: 'org_closed' } }
  if (message.includes('duplicate_phone')) return { status: 409, body: { error: 'duplicate_phone' } }
  return { status: 500, body: { error: 'internal' } }
}

/**
 * Resolves a token to its org projection via boa_acc_org_view — the one place
 * this RPC is called. Exported for two callers: this file's own GET (a real
 * browser/API request) and app/s/[token]/page.tsx, which calls this directly
 * in-process rather than fetching its own /api/s/[token] over the network.
 *
 * page.tsx originally fetched its own API route instead. That self-fetch was
 * replaced with this in-process call after production repeatedly appeared to
 * 404 a known-valid token — but the "appeared to" is doing real work in that
 * sentence: the actual cause was a case-sensitive string check in this
 * session's own verification commands (checking for "REGISTER YOUR CREW"
 * against text that renders uppercase via CSS but is "Register your crew" in
 * the DOM), not a real bug. Whether the self-fetch would have worked all
 * along was never conclusively settled either way. Kept anyway: avoiding a
 * Vercel Function fetching its own deployment's URL is sound regardless (that
 * pattern is a documented source of Deployment-Protection interception — the
 * *.vercel.app alias does redirect to a Vercel SSO login for that kind of
 * traffic, confirmed independently of the false alarm), and calling the
 * resolver directly is simpler than a same-origin HTTP round trip either way.
 * page.tsx still never imports lib/supabase-admin — only this file and
 * scripts/** are exempted from that eslint rule — so the credential stays
 * exactly where docs/ARCHITECTURE.md's layering intends.
 */
export async function resolveOrgView(token: string): Promise<{ ok: true; data: OrgView } | { ok: false; error: ApiError }> {
  const { data, error } = await supabaseAdmin().rpc('boa_acc_org_view', { p_token: token })
  if (error) return { ok: false, error: mapError(error) }

  const row = orgViewSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!row.success) {
    return { ok: false, error: { status: 500, body: { error: 'internal' } } }
  }

  return { ok: true, data: row.data }
}

function throttle(request: Request) {
  const ip = clientIp(request.headers)
  // A generous ceiling: this only guards against token-guessing on a single
  // warm instance. The real limits (quota, 60/hour per token) are enforced
  // in the database under a row lock — see boa_acc_submit.
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
  { params }: { params: Promise<{ token: string }> },
) {
  const limited = throttle(request)
  if (limited) return limited

  const { token } = await params
  const result = await resolveOrgView(token)
  if (!result.ok) return NextResponse.json(result.error.body, { status: result.error.status })
  return NextResponse.json(result.data)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const limited = throttle(request)
  if (limited) return limited

  const { token } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = submissionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.issues },
      { status: 400 },
    )
  }

  const { data, error } = await supabaseAdmin().rpc('boa_acc_submit', {
    p_token: token,
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_role_text: parsed.data.roleText,
    p_vehicle_reg: parsed.data.vehicleReg ?? null,
  })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  return NextResponse.json({ id: data }, { status: 201 })
}
