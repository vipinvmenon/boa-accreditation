import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { GateDatabase } from './db'
import { findActiveWristband, normalizePlate, queueVehicleEvent, resolvePlate } from './vehicle-flow'

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

  /**
   * ACC-159 — `resolvePlate` is what the officer reads BEFORE pressing and what
   * `recordEvent` gates on afterwards. These cover the four states the barrier
   * actually produces, because a panel that says "ready" over a refusal (or the
   * reverse) is worse than the pre-ACC-159 behaviour of saying nothing at all.
   */
  describe('resolvePlate (ACC-159)', () => {
    const PLATE = 'KA05MJ8871'
    const personId = '55555555-5555-4555-8555-000000000182'

    async function seedHolder() {
      await db.roster.add({
        passToken: 'tok-182',
        personId,
        orgId: '44444444-4444-4444-8444-000000000001',
        status: 'approved',
        updatedAt: '2026-10-09T02:00:00.000Z',
        fullName: 'Ganesh Rao',
        roleText: 'Working crew',
        orgName: 'Stagecraft',
        typeCode: 'crew',
        dayValidity: 'build_show',
      })
      await db.sticker.add({
        plate: PLATE,
        stickerNo: 'V-0231',
        personId,
        issuedAt: '2026-10-09T02:00:00.000Z',
      })
    }

    function ledgerRow(kind: 'wristband' | 'vehicle_sticker', extra: Record<string, unknown> = {}) {
      return {
        id: crypto.randomUUID(),
        personId,
        kind,
        occurredAt: '2026-10-09T02:44:00.000Z',
        gateLabel: 'Gate 1',
        volunteerName: 'Ravi',
        isReissue: false,
        ...extra,
      }
    }

    it('a plate with nothing against it resolves to no sticker, no holder, no band', async () => {
      const facts = await resolvePlate(db, PLATE)
      expect(facts).toMatchObject({
        plate: PLATE,
        stickerOk: false,
        wristbandOk: false,
        stickerNo: null,
        personId: null,
        holderName: null,
        wristbandDetail: null,
      })
    })

    it('a sticker issued AND in the ledger, with a live band, is ready to clear', async () => {
      await seedHolder()
      await db.ledger.bulkAdd([
        ledgerRow('vehicle_sticker', { stickerNo: 'V-0231' }),
        ledgerRow('wristband', { bandSerial: '#0416' }),
      ])
      const facts = await resolvePlate(db, PLATE)
      expect(facts.stickerOk).toBe(true)
      expect(facts.wristbandOk).toBe(true)
      expect(facts.stickerNo).toBe('V-0231')
      expect(facts.holderName).toBe('Ganesh Rao')
      expect(facts.personId).toBe(personId)
      // The exact string the cleared verdict renders, so the panel and the
      // post-press card cannot drift apart.
      expect(facts.wristbandDetail).toBe('Crew · purple · band #0416')
    })

    it('the defect the gate exists to catch: a sticker with no wristband does not clear', async () => {
      await seedHolder()
      await db.ledger.add(ledgerRow('vehicle_sticker', { stickerNo: 'V-0231' }))
      const facts = await resolvePlate(db, PLATE)
      expect(facts.stickerOk).toBe(true)
      expect(facts.wristbandOk).toBe(false)
      expect(facts.wristbandDetail).toBeNull()
      expect(facts.holderName).toBe('Ganesh Rao')
    })

    it('a sticker row with no matching ledger issue is not a valid sticker', async () => {
      await seedHolder()
      await db.ledger.add(ledgerRow('vehicle_sticker', { stickerNo: 'V-9999' }))
      const facts = await resolvePlate(db, PLATE)
      expect(facts.stickerOk).toBe(false)
      expect(facts.stickerNo).toBeNull()
    })

    it('resolving reads only — it queues nothing, so it is safe to run on every keystroke', async () => {
      await seedHolder()
      await db.ledger.add(ledgerRow('wristband', { bandSerial: '#0416' }))
      await resolvePlate(db, PLATE)
      await resolvePlate(db, PLATE)
      expect(await db.outbox.toArray()).toHaveLength(0)
    })

    it('a band with no serial still counts as live, and says so in words', async () => {
      await seedHolder()
      await db.ledger.bulkAdd([
        ledgerRow('vehicle_sticker', { stickerNo: 'V-0231' }),
        ledgerRow('wristband'),
      ])
      const facts = await resolvePlate(db, PLATE)
      expect(facts.wristbandOk).toBe(true)
      expect(facts.wristbandDetail).toBe('Crew · purple · band blank serial')
    })
  })
})
