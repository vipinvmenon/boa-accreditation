// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { TIER_CODES, ZONES } from '@/lib/design'
import { gatePullSchema } from '@/lib/schemas/gate'
import { rosterRowSchema } from './db'
import { gateBandCard } from './band-card'

const row = {
  passToken: 'pass-promoter',
  personId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  status: 'approved' as const,
  updatedAt: '2026-10-09T12:00:00.000+05:30',
  fullName: 'Test Promoter',
  roleText: 'Promoter',
  orgName: 'Test Org',
  typeCode: 'promoters_lounge',
  dayValidity: 'show' as const,
}

describe('gate band card (ACC-115, ADR-018)', () => {
  it('a promoters_lounge roster row parses on the wire and in the Dexie cache', () => {
    const pulled = gatePullSchema.parse({
      deviceId: '33333333-3333-4333-8333-333333333333',
      gateLabel: 'Gate 1',
      volunteerName: 'Ravi',
      scope: 'crew',
      roster: [{ ...row, vehicleReg: null }],
      ledger: [],
      rosterAsOf: null,
      ledgerAsOf: null,
    })
    expect(pulled.roster[0]?.typeCode).toBe('promoters_lounge')
    expect(rosterRowSchema.parse(row).typeCode).toBe('promoters_lounge')
  })

  it('renders the promoters_lounge card and its six-zone strip in sheet order', () => {
    const card = gateBandCard(rosterRowSchema.parse(row).typeCode)
    expect(card.label).toBe('Promoters Lounge')
    expect(card.handOver).toBe('Hand over a royal blue band')
    expect(card.zones.map((z) => z.zone)).toEqual(ZONES.map((z) => z.code))
    expect(card.zones).toEqual([
      { zone: 'festival_area', held: true, text: 'Festival Area' },
      { zone: 'eddies_lounge', held: false, text: "—— Eddie's Lounge" },
      { zone: 'promoters_lounge', held: true, text: 'Promoters Lounge · + ID' },
      { zone: 'photo_pit', held: false, text: '—— Photo Pit' },
      { zone: 'backstage', held: true, text: 'Backstage · + ID · after 22:00' },
      { zone: 'main_stage', held: false, text: '—— Main Stage' },
    ])
  })

  it('still parses rows cached under the v1 three-type enum', () => {
    for (const code of ['crew', 'stage', 'aaa']) {
      expect(rosterRowSchema.parse({ ...row, typeCode: code }).typeCode).toBe(code)
    }
  })

  it('rejects a code that is not one of the eight tiers', () => {
    expect(rosterRowSchema.safeParse({ ...row, typeCode: 'working_crew' }).success).toBe(false)
  })

  it('every tier yields six chips, AAA holding all six', () => {
    for (const code of TIER_CODES) expect(gateBandCard(code).zones).toHaveLength(6)
    expect(gateBandCard('aaa').zones.every((z) => z.held)).toBe(true)
  })
})
