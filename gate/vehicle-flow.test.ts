import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { GateDatabase } from './db'
import { findActiveWristband, normalizePlate, queueVehicleEvent } from './vehicle-flow'

describe('vehicle gate flow', () => {
  let db: GateDatabase

  beforeEach(async () => {
    db = new GateDatabase(`vehicle-${crypto.randomUUID()}`)
    await db.open()
  })

  it('normalizes an Indian registration and rejects malformed plates', () => {
    expect(normalizePlate('ka 05 mj 8871')).toBe('KA05MJ8871')
    expect(() => normalizePlate('not-a-plate')).toThrow()
  })

  it('finds a wristband from the cached ledger projection', () => {
    const issue = {
      id: crypto.randomUUID(),
      personId: crypto.randomUUID(),
      kind: 'wristband' as const,
      occurredAt: '2026-10-10T03:00:00.000Z',
      gateLabel: 'Gate 1',
      volunteerName: 'Ravi',
      isReissue: false,
    }
    expect(findActiveWristband([issue], issue.personId)).toEqual(issue)
    expect(findActiveWristband([], issue.personId)).toBeUndefined()
  })

  it('queues every vehicle event without making a network request', async () => {
    const action = await queueVehicleEvent(db, {
      plate: 'KA05MJ8871',
      personId: null,
      stickerCheckinId: null,
      outcome: 'turned_away',
      reason: 'No active sticker',
      checks: { sticker: false, wristband: false, plateVisual: true },
    })
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('vehicle_event')
    expect(rows[0]?.idempotencyKey).toBe(action.idempotencyKey)
    expect(rows[0]?.status).toBe('pending')
  })
})
