import { NextResponse } from 'next/server'
import { gateSession } from '@/lib/gate-auth'
import { canUseGate, gateSessionSchema, operatorRoleSchema } from '@/lib/schemas/operator'

export const dynamic = 'force-dynamic'

/**
 * "Who is signed in at this gate?" (ACC-150). The gate page asks on load,
 * while online, and sends a 401 or 403 to the login page. A usability
 * affordance only — the control is in the database, where every gate RPC
 * refuses anyone who is not an active issuer, lead or admin.
 *
 * Reads the caller's own boa_acc_operator row through RLS
 * (boa_acc_operator_read always shows an operator their own row).
 */
export async function GET() {
  const session = await gateSession()
  if (session.response) return session.response

  const { data, error } = await session.supabase
    .from('boa_acc_operator')
    .select('role, display_name, active')
    .eq('user_id', session.user.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'internal' }, { status: 500 })

  const role = operatorRoleSchema.safeParse(data?.role)
  if (!data?.active || !role.success || !canUseGate(role.data)) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
  }

  const body = gateSessionSchema.safeParse({
    operatorId: session.user.id,
    displayName: data.display_name,
    role: role.data,
  })
  if (!body.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json(body.data, { headers: { 'cache-control': 'no-store' } })
}
