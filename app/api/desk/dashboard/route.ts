import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { dashboardSchema } from '@/lib/schemas/dashboard'

// ACC-033. Every Control-room number comes from boa_acc_desk_dashboard()
// (202609120010) in one call — holds lib/supabase-server.ts (the operator's
// own cookie session), never the service-role client, same as /api/desk/orgs.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('boa_acc_desk_dashboard')

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const parsed = dashboardSchema.safeParse(data)
  if (!parsed.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json(parsed.data)
}
