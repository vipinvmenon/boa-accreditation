import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { gateIssueResultSchema, gateIssueSchema } from '@/lib/schemas/gate'

export const dynamic = 'force-dynamic'

function deviceToken(request: Request): string | null {
  const token = request.headers.get('x-boa-device-token')?.trim()
  return token ? token : null
}

function mapError(error: { code?: string; message?: string }): { status: number; error: string } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('invalid device')) {
    return { status: 401, error: 'invalid_device' }
  }
  if (error.code === 'P0002' || message.includes('not found')) {
    return { status: 404, error: 'not_found' }
  }
  if (error.code === '23514' || error.code === '22023') {
    return { status: 422, error: 'invalid_action' }
  }
  if (error.code === '23505') {
    return { status: 409, error: 'duplicate' }
  }
  return { status: 500, error: 'internal' }
}

export async function POST(request: Request) {
  const token = deviceToken(request)
  if (token === null) {
    return NextResponse.json({ error: 'invalid_device' }, { status: 401 })
  }

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
  const { data, error } = await supabaseAdmin().rpc('boa_acc_gate_issue', {
    p_device_token: token,
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
  if (error) {
    const mapped = mapError(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const result = gateIssueResultSchema.safeParse(data)
  if (!result.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  return NextResponse.json(result.data, { status: 201 })
}
