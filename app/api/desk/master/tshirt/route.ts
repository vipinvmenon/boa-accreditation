import { NextResponse } from 'next/server'
import { z } from 'zod'
import { gateSession, notAuthorized } from '@/lib/gate-auth'
import { tshirtResponseSchema } from '@/lib/schemas/tshirt'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ personId: z.string().uuid() })

// The desk marks a shirt as given after the fact (the person was scanned and
// collected first, the shirt went out later). Same RPC as the gate's hand-over:
// the operator's own session, the database decides (issuer/lead/admin),
// idempotent per person, so a second tap returns the first row.
export async function POST(request: Request) {
  const session = await gateSession()
  if (session.response) return session.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body' }, { status: 400 })

  const { data, error } = await session.supabase.rpc('boa_acc_gate_tshirt', {
    p_idempotency_key: crypto.randomUUID(),
    p_person_id: parsed.data.personId,
    p_occurred_at: null,
  })
  if (error) {
    if (error.code === '42501') return notAuthorized()
    if (error.code === '22023') return NextResponse.json({ error: 'invalid_tshirt' }, { status: 400 })
    if (error.code === 'P0002') return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const response = tshirtResponseSchema.safeParse(data)
  if (!response.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json({ occurredAt: response.data.occurredAt })
}
