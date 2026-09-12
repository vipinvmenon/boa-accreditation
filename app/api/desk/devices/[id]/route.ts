import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

// ACC-045. public.boa_acc_revoke_device (202609121900) checks lead/admin
// internally and grants EXECUTE to `authenticated` — same shape as
// boa_acc_create_org, called via the operator's own session, never the
// service-role client.
export const dynamic = 'force-dynamic'

function mapError(error: { code?: string; message?: string }): { status: number; body: { error: string } } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('not authorized')) {
    return { status: 403, body: { error: 'not_authorized' } }
  }
  if (error.code === 'P0002' || message.includes('not found')) {
    return { status: 404, body: { error: 'not_found' } }
  }
  return { status: 500, body: { error: 'internal' } }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { error } = await supabase.rpc('boa_acc_revoke_device', { p_id: id })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  return NextResponse.json({ ok: true })
}
