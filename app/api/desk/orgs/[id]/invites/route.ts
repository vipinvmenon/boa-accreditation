import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { mintInviteSchema, mintedInviteSchema, inviteRowSchema } from '@/lib/schemas/org'

// ACC-027. boa_acc_mint_invite (202609110004) already exists, checks
// lead/admin internally and grants EXECUTE to `authenticated` — so this route
// calls it via the operator's own session (lib/supabase-server.ts), exactly
// like boa_acc_create_org, never lib/supabase-admin.ts.
export const dynamic = 'force-dynamic'

const INVITE_COLUMNS =
  'id, org_id, token_hint, label, created_at, last_used_at, use_count, revoked_at, expires_at'

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

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('boa_acc_org_invite')
    .select(INVITE_COLUMNS)
    .eq('org_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const rows = inviteRowSchema.array().safeParse(data)
  if (!rows.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ invites: rows.data })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = mintInviteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('boa_acc_mint_invite', {
    p_org_id: id,
    p_label: parsed.data.label ?? null,
  })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  const row = mintedInviteSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!row.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // The raw token is returned exactly once, here. Only the hash and a 6-char
  // hint are ever stored (boa_acc_org_invite.token_hash / .token_hint).
  return NextResponse.json({ invite: row.data }, { status: 201 })
}
