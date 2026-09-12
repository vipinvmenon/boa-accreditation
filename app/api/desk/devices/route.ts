import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { deviceMintSchema, mintedDeviceSchema, deviceRowSchema } from '@/lib/schemas/device'

// ACC-045. public.boa_acc_mint_device (202609121900) already exists, checks
// lead/admin internally and grants EXECUTE to `authenticated` — so this route
// calls it via the operator's own session (lib/supabase-server.ts), exactly
// like boa_acc_create_org and boa_acc_mint_invite, never lib/supabase-admin.ts.
export const dynamic = 'force-dynamic'

const DEVICE_COLUMNS =
  'id, token_hint, gate_label, volunteer_name, scope, created_at, created_by, last_seen_at, revoked_at, expires_at'

function mapError(error: { code?: string; message?: string }): { status: number; body: { error: string } } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('not authorized')) {
    return { status: 403, body: { error: 'not_authorized' } }
  }
  if (message.includes('invalid_expiry')) {
    return { status: 400, body: { error: 'invalid_expiry' } }
  }
  if (error.code === 'P0002' || message.includes('not found')) {
    return { status: 404, body: { error: 'not_found' } }
  }
  // A CHECK constraint violation the zod schema let through some other way.
  if (error.code === '23514') {
    return { status: 400, body: { error: 'invalid_body' } }
  }
  return { status: 500, body: { error: 'internal' } }
}

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // RLS (boa_acc_device_read) restricts this to active operators already; a
  // signed-in non-operator gets an empty list rather than an error, which is
  // consistent with "the database enforces the same rule" (non-negotiable #3).
  // NEVER select token_hash — it is not even in the column grant.
  const { data, error } = await supabase
    .from('boa_acc_device')
    .select(DEVICE_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const rows = deviceRowSchema.array().safeParse(data)
  if (!rows.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ devices: rows.data })
}

export async function POST(request: Request) {
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

  const parsed = deviceMintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('boa_acc_mint_device', {
    p_gate_label: parsed.data.gateLabel,
    p_volunteer_name: parsed.data.volunteerName,
    p_scope: parsed.data.scope,
    ...(parsed.data.expiresAt ? { p_expires_at: parsed.data.expiresAt } : {}),
  })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  const row = mintedDeviceSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!row.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // The raw token is returned exactly once, here. Only the hash and a 6-char
  // hint are ever stored (boa_acc_device.token_hash / .token_hint).
  return NextResponse.json({ device: row.data }, { status: 201 })
}
