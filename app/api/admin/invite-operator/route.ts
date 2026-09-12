import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabaseServer } from '@/lib/supabase-server'
import { inviteOperatorSchema } from '@/lib/schemas/operator'

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
 */
function bootstrapEmails(): string[] {
  return (process.env['BOA_ACC_OPERATOR_BOOTSTRAP'] ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function POST(request: Request) {
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

  if (!bootstrapEmails().includes(parsed.data.email)) {
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

  // upsert, not insert: inviteUserByEmail on an existing, unconfirmed user
  // resends the email against the same user id rather than erroring, which
  // is the normal way to get someone a fresh link — the operator row must
  // tolerate that instead of failing on the primary key.
  const { error: insertError } = await admin
    .from('boa_acc_operator')
    .upsert({
      user_id: invited.user.id,
      role: parsed.data.role,
      display_name: parsed.data.displayName,
    })
  if (insertError) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ id: invited.user.id }, { status: 201 })
}
