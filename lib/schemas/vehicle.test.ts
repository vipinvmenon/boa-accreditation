import { describe, expect, it } from 'vitest'
import { vehicleEventResponseSchema, vehicleEventRpcSchema } from './vehicle'

// What boa_acc_gate_vehicle returned for a real turn-away on 29 Sep: the
// stored checks keep the database's `plate_visual`.
const rpcAnswer = {
  id: '9e046a25-ad39-4bf2-961f-13069b0d0ce8',
  idempotencyKey: '77edcea4-557e-4c81-93fc-a7711f810010',
  plate: 'KL70',
  personId: null,
  stickerCheckinId: null,
  outcome: 'turned_away',
  reason: 'No sticker',
  checks: { sticker: false, wristband: true, plate_visual: true },
  operatorId: 'e37b8c1f-4699-4bed-afdb-f07ac97f010e',
  gateLabel: 'Vehicle gate',
  officerName: 'Ravi',
  occurredAt: '2026-09-29T12:40:09.54+00:00',
  postedAt: '2026-09-29T12:40:10.057635+00:00',
}

describe('the vehicle RPC answer (7 Oct)', () => {
  it('parses, and comes out in the shape the phone expects', () => {
    const parsed = vehicleEventRpcSchema.parse(rpcAnswer)

    expect(parsed.checks).toEqual({ sticker: false, wristband: true, plateVisual: true })
    expect(vehicleEventResponseSchema.safeParse(parsed).success).toBe(true)
  })

  it('is what the response schema alone used to reject, answering 500 for a recorded event', () => {
    expect(vehicleEventResponseSchema.safeParse(rpcAnswer).success).toBe(false)
  })
})
