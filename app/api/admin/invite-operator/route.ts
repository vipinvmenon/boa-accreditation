import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabaseServer } from '@/lib/supabase-server'
import { inviteOperatorSchema } from '@/lib/schemas/operator'
import { checkRateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * Comma-separated emails permitted to invite an operator without an
 * authenticated caller — the trusted batch Vipin sets in Vercel, not
 * anything a request can influence. Originally scoped to "only while
 * boa_acc_operator is empty," which turned out to be too narrow for its own
 * purpose: bootstrapping four accounts (Bhoopesh, Salman, two approvers)
 * means the second, third and fourth call all happen after the first
 * operator row exists, and none of those four people can sign in yet to
 * satisfy the normal check. The allowlist itself is already the trust
 * boundary — it is Vercel env, not request input — so checking "is this
 * target email on the list" is exactly as safe at any operator count as it
 * was at zero, and unblocks the real bootstrap batch that motivated this
 * endpoint. See .env.example.
 *
 * That trust is bounded, not unlimited: security review (12 Sep 2026) found
 * that an unauthenticated caller who knows one bootstrap email could call
 * this endpoint repeatedly — every call upserts, so a bootstrap address
 * already set to `approver` could be silently re-promoted to `admin`, and
 * every call also re-triggers a real invite email with no throttle, an
 * unauthenticated remote email-send trigger. Fixed below: the rate limit
 * applies here too, and the unauthenticated path may create a new operator
 * or resend an identical invite, but can no longer change an existing
 * operator's role or name — that always requires an authenticated lead/admin.
 */
function bootstrapEmails(): string[] {
  return (process.env['BOA_ACC_OPERATOR_BOOTSTRAP'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function POST(request: Request) {
  // A generous ceiling for a handful of desk operators, ever — this is not
  // the 38-vendor invite path (that is boa_acc_mint_invite). Mainly a floor
  // under the unauthenticated bootstrap branch below.
  const limited = checkRateLimit(clientIp(request.headers), 10, 60 * 60_000)
  if (!limited.ok) {
    return NextResponse.json(
      { error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = inviteOperatorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const isAuthenticatedCaller = !bootstrapEmails().includes(parsed.data.email)

  if (isAuthenticatedCaller) {
    const server = await supabaseServer()
    const { data: sessionData } = await server.auth.getUser()
    if (!sessionData.user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { data: callerOp } = await admin
      .from('boa_acc_operator')
      .select('role, active')
      .eq('user_id', sessionData.user.id)
      .maybeSingle()

    if (!callerOp?.active || (callerOp.role !== 'lead' && callerOp.role !== 'admin')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  }

  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL'] ?? ''
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { redirectTo: `${siteUrl}/desk/login` },
  )
  if (inviteError || !invited.user) {
    // Logged, not returned: auth.admin.inviteUserByEmail's error can include
    // provider/rate-limit detail (e.g. "email rate limit exceeded" — the
    // Supabase Auth rate_limit_email_sent config, separate from SMTP setup
    // and separate from lib/rate-limit.ts) that is useful server-side but
    // not something to hand back over this API.
    console.error('[invite-operator] inviteUserByEmail failed:', inviteError?.message)
    return NextResponse.json({ error: 'invite_failed' }, { status: 502 })
  }

  const { data: existingOperator } = await admin
    .from('boa_acc_operator')
    .select('role, display_name')
    .eq('user_id', invited.user.id)
    .maybeSingle()

  // The unauthenticated bootstrap path may create a new operator, or resend
  // an identical invite — never silently change an existing one's role or
  // name. That always needs an authenticated lead/admin caller.
  if (
    existingOperator &&
    !isAuthenticatedCaller &&
    (existingOperator.role !== parsed.data.role || existingOperator.display_name !== parsed.data.displayName)
  ) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { error: upsertError } = await admin.from('boa_acc_operator').upsert({
    user_id: invited.user.id,
    role: parsed.data.role,
    display_name: parsed.data.displayName,
  })
  if (upsertError) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ id: invited.user.id }, { status: 201 })
}
