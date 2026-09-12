import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { supabaseServer } from '@/lib/supabase-server'
import { inviteOperatorSchema } from '@/lib/schemas/operator'

export const dynamic = 'force-dynamic'

/**
 * Comma-separated emails permitted to invite the FIRST operator(s), from
 * .env.example: "the BOOTSTRAP only — once an operator exists, the caller's
 * own boa_acc_operator row is the control, not this list."
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

  // Zero rows: nobody can be authenticated as an operator yet, so the normal
  // "caller must already be lead/admin" check is impossible to satisfy. Fall
  // back to the bootstrap allowlist for this one case only.
  const { count, error: countError } = await admin
    .from('boa_acc_operator')
    .select('user_id', { count: 'exact', head: true })
  if (countError) return NextResponse.json({ error: 'internal' }, { status: 500 })

  if ((count ?? 0) === 0) {
    if (!bootstrapEmails().includes(parsed.data.email)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
  } else {
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
    return NextResponse.json({ error: 'invite_failed' }, { status: 502 })
  }

  const { error: insertError } = await admin.from('boa_acc_operator').insert({
    user_id: invited.user.id,
    role: parsed.data.role,
    display_name: parsed.data.displayName,
  })
  if (insertError) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ id: invited.user.id }, { status: 201 })
}
