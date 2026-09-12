// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { LedgerRow, RosterRow } from './db'
import { resolveScan, type PendingActionProjection } from './resolve'

const PERSON_ID = '11111111-1111-4111-8111-111111111111'
const ORG_ID = '22222222-2222-4222-8222-222222222222'
const TOKEN = 'token-123'
const AT = '2026-09-12T12:00:00.000Z'

const person: RosterRow = {
  passToken: TOKEN,
  personId: PERSON_ID,
  orgId: ORG_ID,
  status: 'approved',
  vehicleReg: 'KA01AB1234',
  updatedAt: AT,
  fullName: 'Test Person',
  roleText: 'Stage tech',
  orgName: 'Test Org',
  typeCode: 'stage',
  dayValidity: 'build_show',
}

const wristband: LedgerRow = {
  id: '33333333-3333-4333-8333-333333333333',
  personId: PERSON_ID,
  kind: 'wristband',
  occurredAt: AT,
  bandSerial: '0412',
  gateLabel: 'Gate 1',
  volunteerName: 'Ravi',
  isReissue: false,
}

const pendingWristband: PendingActionProjection = {
  personId: PERSON_ID,
  kind: 'wristband',
  bandSerial: '0412',
  gateLabel: 'Gate 1',
  volunteerName: 'Ravi',
  isReissue: false,
}

function maps(
  roster = new Map([[TOKEN, person]]),
  ledger = new Map(),
  pending = new Map(),
) {
  return { roster, ledger, pending }
}

describe('resolveScan', () => {
  it('rejects malformed and wrongly prefixed decoded text', () => {
    const projections = maps()

    expect(resolveScan('garbage', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'red',
      reason: 'invalid_token',
    })
    expect(resolveScan('BOA26:', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'red',
      reason: 'invalid_token',
    })
    expect(resolveScan('BOA25:token-123', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'red',
      reason: 'invalid_token',
    })
  })

  it('returns not_found for a well-formed token absent from the approved roster', () => {
    const projections = maps()

    expect(resolveScan('BOA26:other', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'red',
      reason: 'not_found',
    })
  })

  it('returns green and requires a sticker for a registered vehicle', () => {
    const projections = maps()
    expect(resolveScan('BOA26:token-123', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'green',
      person,
      stickerDue: true,
    })
  })

  it('does not require a sticker when the active ledger has one', () => {
    const sticker: LedgerRow = {
      id: '44444444-4444-4444-8444-444444444444',
      personId: PERSON_ID,
      kind: 'vehicle_sticker',
      occurredAt: AT,
      stickerNo: 'S-7',
      gateLabel: 'Gate 1',
      volunteerName: 'Ravi',
      isReissue: false,
    }
    const projections = maps(new Map([[TOKEN, person]]), new Map([[PERSON_ID, [sticker]]]))

    expect(resolveScan('BOA26:token-123', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'green',
      person,
      stickerDue: false,
    })
  })

  it('returns amber with the active ledger issue and source', () => {
    const projections = maps(new Map([[TOKEN, person]]), new Map([[PERSON_ID, wristband]]))

    expect(resolveScan('BOA26:token-123', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'amber',
      person,
      issue: wristband,
      source: 'ledger',
    })
  })

  it('returns amber for a pending wristband before the outbox drains', () => {
    const projections = maps(new Map([[TOKEN, person]]), new Map(), new Map([[PERSON_ID, pendingWristband]]))

    expect(resolveScan('BOA26:token-123', projections.roster, projections.ledger, projections.pending)).toEqual({
      status: 'amber',
      person,
      issue: pendingWristband,
      source: 'outbox',
    })
  })

  it('does not mutate any projection', () => {
    const roster = new Map([[TOKEN, person]])
    const ledger = new Map([[PERSON_ID, [wristband]]])
    const pending = new Map([[PERSON_ID, pendingWristband]])
    const before = {
      roster: [...roster.entries()],
      ledger: [...ledger.entries()],
      pending: [...pending.entries()],
    }

    resolveScan('BOA26:token-123', roster, ledger, pending)

    expect([...roster.entries()]).toEqual(before.roster)
    expect([...ledger.entries()]).toEqual(before.ledger)
    expect([...pending.entries()]).toEqual(before.pending)
  })

  it('rejects malformed projection rows at the Zod boundary', () => {
    const projections = maps(new Map([[TOKEN, person]]), new Map([[PERSON_ID, { ...wristband, gateLabel: '' }]]))

    expect(() => resolveScan('BOA26:token-123', projections.roster, projections.ledger, projections.pending)).toThrow()
  })
})
