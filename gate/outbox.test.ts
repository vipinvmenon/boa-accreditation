// @vitest-environment node
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gateDb } from './db'
import { drainOutbox } from './outbox'
import { enqueueIssue } from './client'
import { queueVehicleEvent } from './vehicle-flow'

const personId = '11111111-1111-4111-8111-111111111111'
const occurredAt = '2026-10-10T09:00:00+05:30'

beforeEach(async () => {
  await gateDb.delete()
  await gateDb.open()
  vi.restoreAllMocks()
})

describe('outbox drain routing (ACC-109)', () => {
  it('sends a vehicle event to /api/gate/vehicle and does not block the wristband issue behind it', async () => {
    const vehicle = await queueVehicleEvent(gateDb, {
      plate: 'KA05MJ8871',
      personId,
      stickerCheckinId: null,
      outcome: 'turned_away',
      reason: 'No sticker',
      checks: { sticker: false, wristband: true, plateVisual: false },
    })
    // Force creation order: the vehicle event is older than the issue.
    await gateDb.outbox.where('kind').equals('vehicle_event').modify({ createdAt: 1 })
    await enqueueIssue({
      idempotencyKey: '55555555-5555-4555-8555-555555555555',
      passToken: 'pass-1',
      kind: 'wristband',
      bandSerial: '',
      vehicleReg: null,
      isReissue: false,
    })

    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/gate/vehicle') {
        return new Response(JSON.stringify({
          id: '66666666-6666-4666-8666-666666666666',
          idempotencyKey: vehicle.idempotencyKey,
          plate: 'KA05MJ8871',
          personId,
          stickerCheckinId: null,
          outcome: 'turned_away',
          reason: 'No sticker',
          checks: { sticker: false, wristband: true, plateVisual: false },
          deviceId: '33333333-3333-4333-8333-333333333333',
          gateLabel: 'Vehicle gate',
          officerName: 'Ravi',
          occurredAt,
          postedAt: occurredAt,
        }), { status: 201, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        id: '77777777-7777-4777-8777-777777777777',
        personId,
        kind: 'wristband',
        idempotencyKey: '55555555-5555-4555-8555-555555555555',
        bandSerial: null,
        stickerNo: null,
        vehicleReg: null,
        deviceId: '33333333-3333-4333-8333-333333333333',
        gateLabel: 'Gate 1',
        volunteerName: 'Ravi',
        occurredAt,
        postedAt: occurredAt,
        isReissue: false,
        supervisorNote: null,
        voidsCheckinId: null,
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await drainOutbox('device-token')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/gate/vehicle', '/api/gate/issue'])
    const statuses = (await gateDb.outbox.orderBy('createdAt').toArray()).map((row) => [row.kind, row.status])
    expect(statuses).toEqual([['vehicle_event', 'done'], ['wristband', 'done']])
    // A vehicle event never writes a check-in ledger row; the wristband does.
    expect((await gateDb.ledger.toArray()).map((row) => row.kind)).toEqual(['wristband'])
  })
})
