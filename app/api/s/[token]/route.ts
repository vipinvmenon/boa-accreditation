import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { submissionSchema } from '@/lib/schemas/submission'
import { orgViewSchema } from '@/lib/schemas/org-view'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/** Maps the Postgres errcode raised by boa_acc_org_view / boa_acc_submit to an HTTP response. */
function errorResponse(error: { code?: string; message?: string }) {
  const message = error.message ?? ''
  if (error.code === 'P0002' || message.includes('not found')) {
    // 404, not 403 — a 403 confirms a token exists (see ARCHITECTURE.md).
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (message.includes('rate_limited')) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }
  if (message.includes('quota_exceeded')) {
    return NextResponse.json({ error: 'quota_exceeded' }, { status: 409 })
  }
  if (message.includes('org_closed')) {
    return NextResponse.json({ error: 'org_closed' }, { status: 403 })
  }
  if (message.includes('duplicate_phone')) {
    return NextResponse.json({ error: 'duplicate_phone' }, { status: 409 })
  }
  return NextResponse.json({ error: 'internal' }, { status: 500 })
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
  const { data, error } = await supabaseAdmin().rpc('boa_acc_org_view', {
    p_token: token,
  })

  if (error) return errorResponse(error)

  const row = orgViewSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!row.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json(row.data)
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

  if (error) return errorResponse(error)

  return NextResponse.json({ id: data }, { status: 201 })
}
