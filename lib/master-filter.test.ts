import { describe, expect, it } from 'vitest'
import { masterCountLabel } from './format'
import {
  masterFilterOptions,
  masterFiltersToParams,
  matchesMasterFilters,
  parseMasterFilters,
  presetFilters,
  MASTER_PRESETS,
  EMPTY_MASTER_FILTERS,
} from './master-filter'
import type { MasterRow } from './schemas/master'

/**
 * The banner ("Showing Sound only", "Show everyone") that used to describe the
 * filters was removed to match r8-master.html: the removable chips are the
 * description now. What is tested here is what replaced it: the URL round trip
 * the Control room links depend on, and the predicates behind each preset.
 */

function row(over: Partial<MasterRow> = {}): MasterRow {
  return {
    id: 'p', fullName: 'A', orgId: 'org-1', phone: '+91', orgName: 'Sound', role: 'Rigger', tshirtSize: null, tshirtGivenAt: null, dayValidity: 'show',
    orgKind: 'vendor', typeCode: 'crew', status: 'approved', passRef: 'BOA26-0001', vehicleReg: null,
    bandSerial: null, stickerNo: null, inBms: false, collectedAt: null, gateLabel: null, decidedAt: null, ...over,
  }
}
const params = (qs: string) => parseMasterFilters(new URLSearchParams(qs))

describe('parseMasterFilters / masterFiltersToParams', () => {
  it('reads the links the Control room and Organisations send', () => {
    expect(params('status=not_collected').status).toEqual(['not_collected'])
    expect(params('tier=aaa').tier).toEqual(['aaa'])
    expect(params('vehicle=yes').vehicle).toEqual(['yes'])
    // ADR-031: the sticker states are gone; an old link opens the unfiltered list.
    expect(params('vehicle=pending').vehicle).toEqual([])
    expect(params('org=abc&status=not_collected')).toMatchObject({ org: ['abc'], status: ['not_collected'] })
  })

  it('keeps ?in_bms=true|false meaning "in BMS" / "not in BMS"', () => {
    expect(params('in_bms=false').bms).toEqual(['out'])
    expect(params('in_bms=true').bms).toEqual(['in'])
  })

  it('drops values it does not know instead of failing', () => {
    expect(params('tier=nonsense&status=collected').tier).toEqual([])
    expect(params('tier=nonsense&status=collected').status).toEqual(['collected'])
    expect(params('in_bms=maybe').bms).toEqual([])
  })

  it('round-trips through the address bar', () => {
    const f = presetFilters({ tier: ['crew', 'aaa'], bms: ['out'], role: ['Truck driver, night'] })
    expect(params(masterFiltersToParams(f).toString())).toEqual(f)
  })
})

describe('matchesMasterFilters', () => {
  const collected = row({ bandSerial: '#0388', collectedAt: '2026-10-08T07:55:00Z', vehicleReg: 'KA 01', stickerNo: '12', inBms: true })
  const preset = (label: string) => presetFilters(MASTER_PRESETS.find((p) => p.label === label)?.filters ?? {})

  it('Not in BMS ignores people who are not approved', () => {
    expect(matchesMasterFilters(row(), preset('Not in BMS'))).toBe(true)
    expect(matchesMasterFilters(row({ status: 'rejected' }), preset('Not in BMS'))).toBe(false)
    expect(matchesMasterFilters(collected, preset('Not in BMS'))).toBe(false)
  })

  it('a band issued with no serial typed still counts as Collected', () => {
    const blank = row({ bandSerial: null, collectedAt: '2026-10-08T07:55:00Z' })
    expect(matchesMasterFilters(blank, presetFilters({ status: ['collected'] }))).toBe(true)
    expect(matchesMasterFilters(blank, preset('Not collected'))).toBe(false)
  })

  it('Not collected is approved and no band; Voided is its own status', () => {
    expect(matchesMasterFilters(row(), preset('Not collected'))).toBe(true)
    expect(matchesMasterFilters(collected, preset('Not collected'))).toBe(false)
    expect(matchesMasterFilters(row({ status: 'voided' }), preset('Not collected'))).toBe(false)
    expect(matchesMasterFilters(row({ status: 'voided' }), preset('Voided'))).toBe(true)
  })

  it('Has a vehicle, whether or not a sticker is recorded; No vehicle is the rest', () => {
    expect(matchesMasterFilters(row(), preset('Has a vehicle'))).toBe(false)
    expect(matchesMasterFilters(collected, preset('Has a vehicle'))).toBe(true)
    expect(matchesMasterFilters(row({ vehicleReg: 'KA 02' }), preset('Has a vehicle'))).toBe(true)
    expect(matchesMasterFilters(row(), params('vehicle=no'))).toBe(true)
  })

  it('different filters narrow, values within one widen', () => {
    expect(matchesMasterFilters(row(), params('tier=crew&tier=aaa'))).toBe(true)
    expect(matchesMasterFilters(row(), params('tier=aaa'))).toBe(false)
    expect(matchesMasterFilters(row(), params('tier=crew&org=other'))).toBe(false)
    expect(matchesMasterFilters(row(), EMPTY_MASTER_FILTERS)).toBe(true)
  })

  it('the Add-filter counts come from the same predicates', () => {
    const rows = [row(), collected, row({ role: 'Driver' })]
    expect(masterFilterOptions(rows, 'status').find((o) => o.value === 'collected')?.count).toBe(1)
    expect(masterFilterOptions(rows, 'role')[0]).toMatchObject({ value: 'Rigger', count: 2 })
    expect(masterFilterOptions(rows, 'tier').map((o) => o.value)).toEqual(['crew'])
  })
})

describe('masterCountLabel (ACC-162)', () => {
  it('names both numbers when a filter is hiding rows', () => {
    expect(masterCountLabel(14, 612)).toBe('Showing 14 of 612 people')
  })

  it('says "all" rather than "612 of 612", which reads as a filter', () => {
    expect(masterCountLabel(612, 612)).toBe('All 612 people')
  })

  it('an empty result still states the population it was drawn from', () => {
    expect(masterCountLabel(0, 612)).toBe('None of 612 people')
  })

  it('an empty roster is not a filter problem and does not pretend to be one', () => {
    expect(masterCountLabel(0, 0)).toBe('Nobody on the roster yet')
  })

  it('counts one person in the singular', () => {
    expect(masterCountLabel(1, 1)).toBe('All 1 person')
    expect(masterCountLabel(0, 1)).toBe('None of 1 person')
  })

  it('never reports more shown than exist, even if a caller passes nonsense', () => {
    expect(masterCountLabel(700, 612)).toBe('All 612 people')
  })
})
