import { describe, expect, it } from 'vitest'
import { stickerRowsFrom, vehicleRowsFrom } from './roster'
import type { LedgerRow, RosterRow } from './db'

/**
 * ACC-153 — the plate → sticker index the vehicle barrier checks a car
 * against. Before this, nothing in shipped code wrote `gateDb.sticker`, so
 * every plate came back "No sticker is issued to this plate. Not logged."
 */

const PERSON = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

function person(personId: string, vehicleReg: string | undefined): RosterRow {
  return {
    passToken: `token-${personId}`,
    personId,
    orgId: '33333333-3333-4333-8333-333333333333',
    status: 'approved',
    fullName: 'Ranjith Kumar',
    phone: '+919886104422',
    roleText: 'Stage tech',
    orgName: 'Chakra Sound & Light',
    typeCode: 'stage',
    dayValidity: 'build_show',
    updatedAt: '2026-10-09T08:00:00.000+05:30',
    ...(vehicleReg ? { vehicleReg } : {}),
  }
}

function issue(overrides: Partial<LedgerRow> & Pick<LedgerRow, 'id' | 'personId' | 'kind' | 'occurredAt'>): LedgerRow {
  return {
    gateLabel: 'Gate 1',
    volunteerName: 'Ravi',
    isReissue: false,
    ...overrides,
  }
}

describe('stickerRowsFrom', () => {
  it('binds a sticker to the registration on its holder’s roster row', () => {
    const rows = stickerRowsFrom(
      [person(PERSON, 'KA 05 MJ 8871')],
      [issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' })],
    )
    expect(rows).toEqual([
      { plate: 'KA05MJ8871', stickerNo: '#V-0231', personId: PERSON, issuedAt: '2026-10-09T08:14:00.000+05:30' },
    ])
  })

  it('normalises the registration the way the barrier types it', () => {
    // The roster carries "KA 05 MJ 8871"; the officer types "ka05mj8871".
    const [row] = stickerRowsFrom(
      [person(PERSON, ' ka 05 mj 8871 ')],
      [issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' })],
    )
    expect(row?.plate).toBe('KA05MJ8871')
  })

  it('keeps the latest sticker for a plate, because a reissue appends', () => {
    const rows = stickerRowsFrom(
      [person(PERSON, 'KA05MJ8871')],
      [
        issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' }),
        issue({ id: 'a0000000-0000-4000-8000-000000000002', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0402', occurredAt: '2026-10-09T11:02:00.000+05:30', isReissue: true }),
      ],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.stickerNo).toBe('#V-0402')
  })

  it('keeps the latest even when the ledger arrives out of order', () => {
    const rows = stickerRowsFrom(
      [person(PERSON, 'KA05MJ8871')],
      [
        issue({ id: 'a0000000-0000-4000-8000-000000000002', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0402', occurredAt: '2026-10-09T11:02:00.000+05:30', isReissue: true }),
        issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' }),
      ],
    )
    expect(rows[0]?.stickerNo).toBe('#V-0402')
  })

  it('ignores wristbands — only a sticker binds a plate', () => {
    expect(stickerRowsFrom(
      [person(PERSON, 'KA05MJ8871')],
      [issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'wristband', bandSerial: '0412', occurredAt: '2026-10-09T08:14:00.000+05:30' })],
    )).toEqual([])
  })

  it('skips a holder with no registration rather than inventing a plate', () => {
    expect(stickerRowsFrom(
      [person(PERSON, undefined)],
      [issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' })],
    )).toEqual([])
  })

  it('skips a holder who is not on this phone’s roster', () => {
    expect(stickerRowsFrom(
      [person(OTHER, 'KA05MJ8871')],
      [issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' })],
    )).toEqual([])
  })

  it('drops one unparseable registration without costing the phone the rest', () => {
    const rows = stickerRowsFrom(
      [person(PERSON, 'NOT A PLATE!'), person(OTHER, 'KA51CQ0043')],
      [
        issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', stickerNo: '#V-0231', occurredAt: '2026-10-09T08:14:00.000+05:30' }),
        issue({ id: 'a0000000-0000-4000-8000-000000000002', personId: OTHER, kind: 'vehicle_sticker', stickerNo: '#V-0299', occurredAt: '2026-10-09T08:20:00.000+05:30' }),
      ],
    )
    expect(rows).toEqual([
      { plate: 'KA51CQ0043', stickerNo: '#V-0299', personId: OTHER, issuedAt: '2026-10-09T08:20:00.000+05:30' },
    ])
  })

  it('skips a sticker row with no sticker number', () => {
    expect(stickerRowsFrom(
      [person(PERSON, 'KA05MJ8871')],
      [issue({ id: 'a0000000-0000-4000-8000-000000000001', personId: PERSON, kind: 'vehicle_sticker', occurredAt: '2026-10-09T08:14:00.000+05:30' })],
    )).toEqual([])
  })
})

describe('vehicleRowsFrom (ADR-031)', () => {
  const waiting = { plate: 'KA04AF2029', personId: OTHER, fullName: 'AMARESH', orgName: 'TRAVEL DESTINATION INC', roleText: 'Driver', status: 'submitted' as const }

  it('keeps every pulled plate, including a holder still waiting for approval', () => {
    expect(vehicleRowsFrom([waiting], [])).toEqual([waiting])
  })

  it('adds approved roster plates, normalised, so a database without the migration still gives them', () => {
    expect(vehicleRowsFrom([], [person(PERSON, 'ka 05 mj 8871')])).toEqual([
      { plate: 'KA05MJ8871', personId: PERSON, fullName: 'Ranjith Kumar', orgName: 'Chakra Sound & Light', roleText: 'Stage tech', status: 'approved' },
    ])
  })

  it('one row per plate, and the server row wins; an unparseable registration is skipped', () => {
    const rows = vehicleRowsFrom([waiting], [person(PERSON, 'KA04AF2029'), person('44444444-4444-4444-8444-444444444444', 'not a plate')])
    expect(rows).toEqual([waiting])
  })
})
