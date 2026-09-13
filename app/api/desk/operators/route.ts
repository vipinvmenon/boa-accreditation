import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { operatorRowSchema } from '@/lib/schemas/operator'

// ACC-049. boa_acc_operator already has a select policy (own row, or every
// row for a lead/admin — 202609110002) and an explicit column grant to
// `authenticated`, so this route reads through the operator's own session
// (lib/supabase-server.ts), never lib/supabase-admin.ts. A signed-in
// non-lead/admin operator gets back only their own row, which is RLS doing
// its job, not a bug in this route.
export const dynamic = 'force-dynamic'

const OPERATOR_COLUMNS = 'user_id, role, display_name, active, created_at'

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('boa_acc_operator')
    .select(OPERATOR_COLUMNS)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const rows = operatorRowSchema.array().safeParse(data)
  if (!rows.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ operators: rows.data, callerId: user.id })
}
