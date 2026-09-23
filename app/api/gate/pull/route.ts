import { NextResponse } from 'next/server'
import { gateSession, notAuthorized } from '@/lib/gate-auth'
import { gatePullSchema } from '@/lib/schemas/gate'

export const dynamic = 'force-dynamic'

// ACC-150: the operator's own session (lib/gate-auth.ts), never the service
// role. boa_acc_gate_pull() checks the role in the database.
export async function POST() {
  const session = await gateSession()
  if (session.response) return session.response

  const { data, error } = await session.supabase.rpc('boa_acc_gate_pull')
  if (error) {
    if (error.code === '42501') return notAuthorized()
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const parsed = gatePullSchema.safeParse(data)
  if (!parsed.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  return NextResponse.json(parsed.data, { headers: { 'cache-control': 'no-store' } })
}
