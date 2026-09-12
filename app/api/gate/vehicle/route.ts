import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  vehicleEventRequestSchema,
  vehicleEventResponseSchema,
} from '@/lib/schemas/vehicle'

export const dynamic = 'force-dynamic'

type SupabaseError = { code?: string; message?: string }

function errorResponse(error: SupabaseError) {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('device scope')) {
    return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
  }
  if (error.code === '22023' || message.includes('required') || message.includes('mismatch')) {
    return NextResponse.json({ error: 'invalid_vehicle_event' }, { status: 400 })
  }
  if (error.code === 'P0002') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}

function deviceToken(request: Request): string | null {
  const value = request.headers.get('authorization')
  if (!value?.startsWith('Bearer ')) return null
  const token = value.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export async function POST(request: Request) {
  const token = deviceToken(request)
  if (token === null) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = vehicleEventRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const event = parsed.data
  const { data, error } = await supabaseAdmin().rpc('boa_acc_gate_vehicle', {
    p_device_token: token,
    p_idempotency_key: event.idempotencyKey,
    p_plate: event.plate,
    p_outcome: event.outcome,
    p_person_id: event.personId ?? null,
    p_sticker_checkin_id: event.stickerCheckinId ?? null,
    p_checks: {
      sticker: event.checks.sticker,
      wristband: event.checks.wristband,
      plate_visual: event.checks.plateVisual,
    },
    p_reason: event.reason ?? null,
    p_occurred_at: event.occurredAt ?? null,
  })

  if (error) return errorResponse(error)

  const response = vehicleEventResponseSchema.safeParse(data)
  if (!response.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  return NextResponse.json(response.data, { status: 201 })
}
