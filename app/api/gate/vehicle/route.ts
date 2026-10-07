import { NextResponse } from 'next/server'
import { gateSession, notAuthorized } from '@/lib/gate-auth'
import {
  vehicleEventRequestSchema,
  vehicleEventRpcSchema,
} from '@/lib/schemas/vehicle'

export const dynamic = 'force-dynamic'

type SupabaseError = { code?: string; message?: string }

function errorResponse(error: SupabaseError) {
  const message = error.message ?? ''
  if (error.code === '42501') return notAuthorized()
  if (error.code === '22023' || message.includes('required') || message.includes('mismatch')) {
    return NextResponse.json({ error: 'invalid_vehicle_event' }, { status: 400 })
  }
  if (error.code === 'P0002') {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}

// ACC-150: the operator's own session (lib/gate-auth.ts), never the service
// role. Until ACC-150 this route read `Authorization: Bearer` while the
// outbox sent `x-boa-device-token`, so a queued vehicle event could never be
// accepted; the session cookie is now the only credential on both sides.
export async function POST(request: Request) {
  const session = await gateSession()
  if (session.response) return session.response

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
  const { data, error } = await session.supabase.rpc('boa_acc_gate_vehicle', {
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

  const response = vehicleEventRpcSchema.safeParse(data)
  if (!response.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  return NextResponse.json(response.data, { status: 201 })
}
