import { NextResponse } from 'next/server'
import { gateSession, notAuthorized } from '@/lib/gate-auth'
import { tshirtRequestSchema, tshirtResponseSchema } from '@/lib/schemas/tshirt'

export const dynamic = 'force-dynamic'

type SupabaseError = { code?: string; message?: string }

function errorResponse(error: SupabaseError) {
  if (error.code === '42501') return notAuthorized()
  if (error.code === '22023') return NextResponse.json({ error: 'invalid_tshirt' }, { status: 400 })
  if (error.code === 'P0002') return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}

// ACC-197b: the operator's own session, never the service role; the database
// decides (boa_acc_gate_tshirt checks the gate role). Idempotent per person:
// a second phone handing the same shirt over gets the first row back.
export async function POST(request: Request) {
  const session = await gateSession()
  if (session.response) return session.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const parsed = tshirtRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const { data, error } = await session.supabase.rpc('boa_acc_gate_tshirt', {
    p_idempotency_key: parsed.data.idempotencyKey,
    p_person_id: parsed.data.personId,
    p_occurred_at: parsed.data.occurredAt ?? null,
  })
  if (error) return errorResponse(error)

  const response = tshirtResponseSchema.safeParse(data)
  if (!response.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json(response.data, { status: 201 })
}
