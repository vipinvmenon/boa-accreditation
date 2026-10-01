import { describe, expect, it } from 'vitest'
import { collectedPersonIds, collectionCounts, type LedgerRow } from '@/lib/collection'

const band = (id: string, person: string): LedgerRow => ({ id, person_id: person, kind: 'wristband', voids_checkin_id: null })
const sticker = (id: string, person: string): LedgerRow => ({ id, person_id: person, kind: 'vehicle_sticker', voids_checkin_id: null })
const voids = (id: string, person: string, target: string): LedgerRow => ({ id, person_id: person, kind: 'void', voids_checkin_id: target })

describe('collectedPersonIds', () => {
  it('counts a person with a live wristband', () => {
    expect([...collectedPersonIds([band('c1', 'p1')])]).toEqual(['p1'])
  })

  it('a later vehicle sticker does not un-collect the band', () => {
    expect(collectedPersonIds([band('c1', 'p1'), sticker('c2', 'p1')]).has('p1')).toBe(true)
  })

  it('a voided band is not collected, a reissue after it is', () => {
    expect(collectedPersonIds([band('c1', 'p1'), voids('c2', 'p1', 'c1')]).has('p1')).toBe(false)
    expect(collectedPersonIds([band('c1', 'p1'), voids('c2', 'p1', 'c1'), band('c3', 'p1')]).has('p1')).toBe(true)
  })

  it('a sticker alone is not a band', () => {
    expect(collectedPersonIds([sticker('c1', 'p1')]).size).toBe(0)
  })
})

describe('collectionCounts', () => {
  const people = [
    { id: 'p1', org_id: 'o1', status: 'approved', type_code: 'aaa' },
    { id: 'p2', org_id: 'o1', status: 'approved', type_code: 'aaa' },
    { id: 'p3', org_id: 'o2', status: 'approved', type_code: 'crew' },
    { id: 'p4', org_id: 'o2', status: 'submitted', type_code: 'crew' },
    { id: 'p5', org_id: 'o2', status: 'rejected', type_code: 'crew' },
  ]

  it('counts approved people and their collections by tier and by organisation', () => {
    const counts = collectionCounts(people, [band('c1', 'p1'), band('c2', 'p5')])
    expect(counts.tiers).toEqual(expect.arrayContaining([
      { code: 'aaa', approved: 2, collected: 1 },
      { code: 'crew', approved: 1, collected: 0 },
    ]))
    expect(counts.orgs).toEqual(expect.arrayContaining([
      { id: 'o1', approved: 2, collected: 1 },
      { id: 'o2', approved: 1, collected: 0 },
    ]))
  })
})
