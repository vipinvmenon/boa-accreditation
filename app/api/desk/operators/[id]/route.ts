import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { patchOperatorSchema, setOperatorActiveResultSchema } from '@/lib/schemas/operator'

// ACC-049. public.boa_acc_set_operator_active (202609130900) checks
// lead/admin internally and grants EXECUTE to `authenticated` — same shape
// as boa_acc_mint_device/boa_acc_revoke_device, called via the operator's
// own session, never the service-role client.
export const dynamic = 'force-dynamic'

function mapError(error: { code?: string; message?: string }): { status: number; body: { error: string } } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('not authorized')) {
    return { status: 403, body: { error: 'not_authorized' } }
  }
  if (message.includes('cannot_deactivate_self')) {
    return { status: 409, body: { error: 'cannot_deactivate_self' } }
  }
  if (message.includes('cannot_deactivate_last_admin')) {
    return { status: 409, body: { error: 'cannot_deactivate_last_admin' } }
  }
  if (message.includes('cannot_change_own_role')) {
    return { status: 409, body: { error: 'cannot_change_own_role' } }
  }
  if (message.includes('cannot_demote_last_admin')) {
    return { status: 409, body: { error: 'cannot_demote_last_admin' } }
  }
  if (error.code === 'P0002' || message.includes('not found')) {
    return { status: 404, body: { error: 'not_found' } }
  }
  return { status: 500, body: { error: 'internal' } }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const parsed = patchOperatorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const { data, error } = 'role' in parsed.data
    ? await supabase.rpc('boa_acc_set_operator_role', {
        p_user_id: id,
        p_role: parsed.data.role,
      })
    : await supabase.rpc('boa_acc_set_operator_active', {
        p_user_id: id,
        p_active: parsed.data.active,
      })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  const row = setOperatorActiveResultSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!row.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ operator: row.data })
}
