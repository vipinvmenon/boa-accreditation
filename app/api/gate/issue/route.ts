import { NextResponse } from 'next/server'
import { gateSession, notAuthorized } from '@/lib/gate-auth'
import { gateIssueResultSchema, gateIssueSchema } from '@/lib/schemas/gate'

export const dynamic = 'force-dynamic'

function mapError(error: { code?: string; message?: string }): NextResponse {
  const message = error.message ?? ''
  if (error.code === '42501') return notAuthorized()
  if (error.code === 'P0002' || message.includes('not found')) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (error.code === '23514' || error.code === '22023') {
    return NextResponse.json({ error: 'invalid_action' }, { status: 422 })
  }
  if (error.code === '23505') {
    return NextResponse.json({ error: 'duplicate' }, { status: 409 })
  }
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}

// ACC-150: the operator's own session (lib/gate-auth.ts), never the service
// role. boa_acc_gate_issue checks the role and records operator_id.
export async function POST(request: Request) {
  const session = await gateSession()
  if (session.response) return session.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = gateIssueSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const action = parsed.data
  const { data, error } = await session.supabase.rpc('boa_acc_gate_issue', {
    p_idempotency_key: action.idempotencyKey,
    p_pass_token: action.passToken,
    p_kind: action.kind,
    p_band_serial: action.bandSerial ?? null,
    p_sticker_no: action.stickerNo ?? null,
    p_vehicle_reg: action.vehicleReg ?? null,
    p_occurred_at: action.occurredAt ?? null,
    p_is_reissue: action.isReissue,
    p_supervisor_note: action.supervisorNote ?? null,
    p_voids_checkin_id: action.voidsCheckinId ?? null,
  })
  if (error) return mapError(error)

  const result = gateIssueResultSchema.safeParse(data)
  if (!result.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  return NextResponse.json(result.data, { status: 201 })
}
