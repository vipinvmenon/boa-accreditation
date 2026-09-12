// @vitest-environment node
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { gateDb, rosterRowSchema } from './db'
import { pullGate } from './client'

const personId = '11111111-1111-4111-8111-111111111111'
const orgId = '22222222-2222-4222-8222-222222222222'
const occurredAt = '2026-10-10T09:00:00+05:30'

beforeEach(async () => {
  await gateDb.delete()
  await gateDb.open()
  vi.restoreAllMocks()
})

describe('gate pull boundary', () => {
  it('does not empty an existing cache when a pull is empty', async () => {
    const existing = rosterRowSchema.parse({
      passToken: 'existing',
      personId,
      orgId,
      status: 'approved',
      updatedAt: occurredAt,
    })
    await gateDb.roster.put(existing)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        deviceId: '33333333-3333-4333-8333-333333333333',
        gateLabel: 'Gate 1',
        volunteerName: 'Ravi',
        scope: 'crew',
        roster: [],
        ledger: [],
        rosterAsOf: occurredAt,
        ledgerAsOf: occurredAt,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ))

    await expect(pullGate('device-token')).rejects.toThrow('empty_roster')
    await expect(gateDb.roster.get('existing')).resolves.toEqual(existing)
  })

  it('validates and caches a non-empty pull, including blank serials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        deviceId: '33333333-3333-4333-8333-333333333333',
        gateLabel: 'Gate 1',
        volunteerName: 'Ravi',
        scope: 'crew',
        roster: [{ passToken: 'pass-1', personId, orgId, status: 'approved', vehicleReg: null, updatedAt: occurredAt }],
        ledger: [{ id: '44444444-4444-4444-8444-444444444444', personId, kind: 'wristband', occurredAt, bandSerial: '', stickerNo: null, gateLabel: 'Gate 1', volunteerName: 'Ravi', isReissue: false }],
        rosterAsOf: occurredAt,
        ledgerAsOf: occurredAt,
      }), { status: 200, headers: { 'content-type': 'application/json' } }),
    ))

    const result = await pullGate('device-token')
    expect(result.roster).toHaveLength(1)
    await expect(gateDb.ledger.toArray()).resolves.toHaveLength(1)
    await expect(gateDb.meta.get('rosterAsOf')).resolves.toEqual({ key: 'rosterAsOf', value: occurredAt })
  })
})
