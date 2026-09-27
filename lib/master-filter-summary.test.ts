import { describe, expect, it } from 'vitest'
import { masterCountLabel, masterFilterSummary } from './format'

/**
 * ACC-154 — a filter the operator cannot see is a bug. ACC-152 established
 * that for `?org=`; this covers both filters and the four ways each can land
 * (loading, rows, empty, and the two together).
 */

const base = { orgFiltered: false, orgName: null, inBms: 'all' as const, loading: false, empty: false }

describe('masterFilterSummary', () => {
  it('says nothing when the list is unfiltered — the one state needing no explanation', () => {
    expect(masterFilterSummary(base)).toBeNull()
    expect(masterFilterSummary({ ...base, loading: true })).toBeNull()
    expect(masterFilterSummary({ ...base, empty: true })).toBeNull()
  })

  describe('organisation only — the ACC-152 wording, unchanged', () => {
    it('names the company once its rows arrive', () => {
      expect(masterFilterSummary({ ...base, orgFiltered: true, orgName: 'Sound' }))
        .toBe('Showing Sound only')
    })

    it('says it is filtering while the rows are in flight', () => {
      expect(masterFilterSummary({ ...base, orgFiltered: true, loading: true, empty: true }))
        .toBe('Filtering by organisation…')
    })

    it('does not look broken when the company has nobody yet', () => {
      expect(masterFilterSummary({ ...base, orgFiltered: true, empty: true }))
        .toBe('No one from this organisation yet')
    })
  })

  describe('BMS only — what "14 not in BMS" leads to', () => {
    it('says which way the flag is filtered', () => {
      expect(masterFilterSummary({ ...base, inBms: 'false' })).toBe('Showing people not yet in BMS')
      expect(masterFilterSummary({ ...base, inBms: 'true' })).toBe('Showing people already in BMS')
    })

    it('reports an empty outstanding list as the good news it is', () => {
      expect(masterFilterSummary({ ...base, inBms: 'false', empty: true }))
        .toBe('Everyone approved is already in BMS')
    })

    it('reports an empty entered list as nobody entered yet', () => {
      expect(masterFilterSummary({ ...base, inBms: 'true', empty: true }))
        .toBe('Nobody has been added to BMS yet')
    })

    it('says it is filtering while the rows are in flight', () => {
      expect(masterFilterSummary({ ...base, inBms: 'false', loading: true, empty: true }))
        .toBe('Filtering by BMS…')
    })
  })

  describe('both at once', () => {
    it('names the company and the flag', () => {
      expect(masterFilterSummary({ ...base, orgFiltered: true, orgName: 'Sound', inBms: 'false' }))
        .toBe('Showing Sound, people not yet in BMS')
    })

    it('does not blame one filter when the pair is what emptied the list', () => {
      expect(masterFilterSummary({ ...base, orgFiltered: true, inBms: 'false', empty: true }))
        .toBe('Nobody matches both filters')
    })

    it('says it is filtering while the rows are in flight', () => {
      expect(masterFilterSummary({ ...base, orgFiltered: true, inBms: 'true', loading: true, empty: true }))
        .toBe('Filtering…')
    })
  })

  it('never returns an empty string — the banner is shown on truthiness', () => {
    for (const orgFiltered of [true, false]) {
      for (const inBms of ['all', 'true', 'false'] as const) {
        for (const loading of [true, false]) {
          for (const empty of [true, false]) {
            for (const orgName of ['Sound', null]) {
              const summary = masterFilterSummary({ orgFiltered, orgName, inBms, loading, empty })
              expect(summary === null || summary.length > 0).toBe(true)
            }
          }
        }
      }
    }
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
