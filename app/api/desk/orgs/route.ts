import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { orgCreateSchema, orgRowSchema } from '@/lib/schemas/org'

// ACC-027. Every write to boa_acc_org goes through boa_acc_create_org
// (202609120009) — there is no insert RLS policy, deliberately (see that
// migration's header). This route holds the publishable-key, cookie-backed
// client (lib/supabase-server.ts), never lib/supabase-admin.ts: the RPC
// checks lead/admin itself via the caller's own auth.uid(), the same way
// boa_acc_mint_invite already does, so there is no reason for /desk/orgs to
// carry the service role at all.
export const dynamic = 'force-dynamic'

const ORG_COLUMNS =
  'id, name, kind, quota, default_type, contact_name, contact_phone, status, notes, created_at, updated_at'

/** Maps a Postgres/PostgREST error to an HTTP status + body. */
function mapError(error: { code?: string; message?: string }): { status: number; body: { error: string } } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('not authorized')) {
    return { status: 403, body: { error: 'not_authorized' } }
  }
  if (message.includes('duplicate_name')) {
    return { status: 409, body: { error: 'duplicate_name' } }
  }
  // A CHECK constraint violation the zod schema let through some other way
  // (e.g. a name Postgres still rejects on length after trimming).
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

  // RLS (boa_acc_org_read) restricts this to active operators already; a
  // signed-in non-operator gets an empty list rather than an error, which is
  // consistent with "the database enforces the same rule" (non-negotiable #3).
  const { data, error } = await supabase
    .from('boa_acc_org')
    .select(ORG_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const rows = orgRowSchema.array().safeParse(data)
  if (!rows.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ orgs: rows.data })
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
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = orgCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const { data: orgId, error } = await supabase.rpc('boa_acc_create_org', {
    p_name: parsed.data.name,
    p_kind: parsed.data.kind,
    p_quota: parsed.data.quota,
    p_contact_name: parsed.data.contactName,
    p_contact_phone: parsed.data.contactPhone,
    p_default_type: parsed.data.defaultType ?? 'crew',
  })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  // boa_acc_create_org returns only the new id; read the row back through the
  // same authenticated, RLS-scoped client rather than re-deriving the row from
  // the request body, so the response always reflects what the database
  // actually stored (e.g. the trimmed/normalised name and phone).
  const { data: row, error: readError } = await supabase
    .from('boa_acc_org')
    .select(ORG_COLUMNS)
    .eq('id', orgId as string)
    .single()

  if (readError) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const parsedRow = orgRowSchema.safeParse(row)
  if (!parsedRow.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ org: parsedRow.data }, { status: 201 })
}
