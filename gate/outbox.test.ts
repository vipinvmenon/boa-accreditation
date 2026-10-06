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
          operatorId: '33333333-3333-4333-8333-333333333333',
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
        operatorId: '33333333-3333-4333-8333-333333333333',
        gateLabel: 'Check-in',
        volunteerName: 'Ravi',
        occurredAt,
        postedAt: occurredAt,
        isReissue: false,
        supervisorNote: null,
        voidsCheckinId: null,
      }), { status: 201, headers: { 'content-type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    await drainOutbox()

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/gate/vehicle', '/api/gate/issue'])
    const statuses = (await gateDb.outbox.orderBy('createdAt').toArray()).map((row) => [row.kind, row.status])
    expect(statuses).toEqual([['vehicle_event', 'done'], ['wristband', 'done']])
    // A vehicle event never writes a check-in ledger row; the wristband does.
    expect((await gateDb.ledger.toArray()).map((row) => row.kind)).toEqual(['wristband'])
  })

  it('a 401 (lapsed session) keeps the whole queue, consumes no attempt and sends nothing behind the head (ACC-149/ACC-150)', async () => {
    for (const [index, key] of ['88888888-8888-4888-8888-888888888881', '88888888-8888-4888-8888-888888888882'].entries()) {
      await enqueueIssue({ idempotencyKey: key, passToken: `pass-${index}`, kind: 'wristband', bandSerial: '', vehicleReg: null, isReissue: false })
      await gateDb.outbox.where('idempotencyKey').equals(key).modify({ createdAt: index + 1 })
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: 'not_authenticated' }), { status: 401, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await drainOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const rows = await gateDb.outbox.orderBy('createdAt').toArray()
    expect(rows.map((row) => [row.status, row.attempts])).toEqual([['pending', 0], ['pending', 0]])
    expect(rows[0]?.lastError).toBe('authentication required')
  })
})

/**
 * 6 Oct pre-festival test pass, findings 5–7: one stuck or refused entry used
 * to stop a gate phone sending for the rest of the day, with nothing on screen.
 */
describe('a gate phone never stops sending for good (6 Oct)', () => {
  const PERSON = '11111111-1111-4111-8111-111111111111'
  const KEYS = ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2']

  function accepted(key: string) {
    return new Response(JSON.stringify({
      id: crypto.randomUUID(), personId: PERSON, kind: 'wristband', idempotencyKey: key,
      bandSerial: null, stickerNo: null, vehicleReg: null,
      operatorId: '33333333-3333-4333-8333-333333333333', gateLabel: 'Check-in', volunteerName: 'Ravi',
      occurredAt, postedAt: occurredAt, isReissue: false, supervisorNote: null, voidsCheckinId: null,
    }), { status: 201, headers: { 'content-type': 'application/json' } })
  }

  /** Answers each POST with the key it carried. */
  function acceptAll() {
    return vi.fn(async (_url: string, init?: RequestInit) => accepted(JSON.parse(String(init?.body)).idempotencyKey))
  }

  async function queueTwo() {
    for (const [index, key] of KEYS.entries()) {
      await enqueueIssue({ idempotencyKey: key, passToken: `pass-${index}`, kind: 'wristband', bandSerial: '', vehicleReg: null, isReissue: false })
      await gateDb.outbox.where('idempotencyKey').equals(key).modify({ createdAt: index + 1 })
    }
  }

  const statuses = async () => (await gateDb.outbox.orderBy('createdAt').toArray()).map((row) => row.status)
  const due = () => gateDb.outbox.toCollection().modify({ nextAttemptAt: 0 })

  it('re-sends an entry a killed page left "syncing", with its own key, and the queue moves (finding 5)', async () => {
    await queueTwo()
    await gateDb.outbox.where('idempotencyKey').equals(KEYS[0]!).modify({ status: 'syncing' })
    const fetchMock = acceptAll()
    vi.stubGlobal('fetch', fetchMock)

    await drainOutbox()

    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).idempotencyKey)).toEqual(KEYS)
    expect(await statuses()).toEqual(['done', 'done'])
  })

  it('keeps an entry pending through any amount of no signal, then sends everything (finding 6)', async () => {
    await queueTwo()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed') }))
    for (let i = 0; i < 20; i++) {
      await due()
      await drainOutbox()
    }
    const head = (await gateDb.outbox.orderBy('createdAt').toArray())[0]
    expect([head?.status, head?.attempts]).toEqual(['pending', 20])

    const fetchMock = acceptAll()
    vi.stubGlobal('fetch', fetchMock)
    await due()
    await drainOutbox()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await statuses()).toEqual(['done', 'done'])
  })

  it('a gateway 503 is no signal too, not a strike against the entry', async () => {
    await queueTwo()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'offline' }), { status: 503 })))
    for (let i = 0; i < 12; i++) {
      await due()
      await drainOutbox()
    }
    expect(await statuses()).toEqual(['pending', 'pending'])
  })

  it('a refusal (404: withdrawn after the pull) fails at once, keeps its status, and the next entry still goes (finding 7)', async () => {
    await queueTwo()
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const key = JSON.parse(String(init?.body)).idempotencyKey
      return key === KEYS[0]
        ? new Response(JSON.stringify({ error: 'not_found' }), { status: 404 })
        : accepted(key)
    })
    vi.stubGlobal('fetch', fetchMock)

    await drainOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const rows = await gateDb.outbox.orderBy('createdAt').toArray()
    expect(rows.map((row) => [row.status, row.attempts])).toEqual([['failed', 1], ['done', 0]])
    expect(rows[0]?.lastError).toBe('HTTP 404: {"error":"not_found"}')

    // Never sent again.
    await due()
    await drainOutbox()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('an unexplained 500 is retried, fails after MAX_ATTEMPTS, and then lets the queue go', async () => {
    await queueTwo()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'internal' }), { status: 500 })))
    for (let i = 0; i < 8; i++) {
      await due()
      await drainOutbox()
    }
    expect(await statuses()).toEqual(['failed', 'pending'])

    vi.stubGlobal('fetch', acceptAll())
    await due()
    await drainOutbox()
    expect(await statuses()).toEqual(['failed', 'done'])
  })

  it('revives, once per page load, a row the old code failed for lack of signal', async () => {
    await queueTwo()
    // What the pre-fix drain left: failed after eight "Load failed", no HTTP status.
    await gateDb.outbox.where('idempotencyKey').equals(KEYS[0]!).modify({ status: 'failed', attempts: 8, lastError: 'Load failed' })
    vi.resetModules()
    const fresh = await import('./outbox')
    const fetchMock = acceptAll()
    vi.stubGlobal('fetch', fetchMock)

    await fresh.drainOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await statuses()).toEqual(['done', 'done'])
  })
})
