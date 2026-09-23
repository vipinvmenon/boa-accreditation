import { describe, expect, it } from 'vitest'
import { TIERS, ZONES } from '@/lib/design'
import { DECIDABLE_TIERS, REQUESTABLE_TIER_CODES, zoneChips } from '@/lib/desk-tiers'
import { orgCreateSchema } from '@/lib/schemas/org'
// @ts-expect-error -- plain .mjs; allowJs is off
import { ORG_TYPE_CODES as IMPORT_TYPE_CODES } from '../../scripts/validate-org-import.mjs'

/**
 * ACC-115 · the desk's views over the pack (ADR-018). These are filters of
 * lib/design.ts's TIERS, so the pack itself is proven by
 * accreditation-contract.test.ts; this proves the desk-side rules on top.
 */

describe('desk tiers', () => {
  it('a single decision offers every tier except General Admission, in sort order', () => {
    expect(DECIDABLE_TIERS.map((t) => t.code)).toEqual(TIERS.map((t) => t.code).filter((c) => c !== 'general_admission'))
  })

  it('org defaults offer the requestable tiers only', () => {
    expect([...REQUESTABLE_TIER_CODES]).toEqual(['stage', 'promoters_lounge', 'crew', 'photo', 'eddies_lounge'])
    const org = { name: 'Org', kind: 'vendor', contactName: 'Ab', contactPhone: '+919812345678' }
    expect(orgCreateSchema.safeParse({ ...org, defaultType: 'artist' }).success).toBe(false)
    expect(orgCreateSchema.safeParse({ ...org, defaultType: 'photo' }).success).toBe(true)
  })

  it('the org importer carries the same requestable list', () => {
    expect(IMPORT_TYPE_CODES).toEqual([...REQUESTABLE_TIER_CODES])
  })

  it('zone chips: six zones in sheet order, + ID and the 22:00 window where the pack prints them', () => {
    const promoters = zoneChips('promoters_lounge')
    expect(promoters.map((z) => z.zone)).toEqual(ZONES.map((z) => z.code))
    expect(promoters.map((z) => [z.held, z.text])).toEqual([
      [true, 'Festival Area'],
      [false, "Eddie's Lounge"],
      [true, 'Promoters Lounge + ID'],
      [false, 'Photo Pit'],
      [true, 'Backstage + ID after 22:00'],
      [false, 'Main Stage'],
    ])
    expect(zoneChips('artist').filter((z) => z.text.endsWith('+ ID'))).toHaveLength(5)
    expect(zoneChips('general_admission').filter((z) => z.held)).toHaveLength(1)
  })
})
