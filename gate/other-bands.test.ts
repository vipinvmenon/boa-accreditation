import { describe, expect, it } from 'vitest'
import { describeOtherBands } from './other-bands'

describe('describeOtherBands', () => {
  it('says nothing when no other band exists', () => {
    expect(describeOtherBands([])).toBeNull()
  })

  it('names who issued the first band, and when', () => {
    const text = describeOtherBands([
      { bandSerial: '0388', gateLabel: 'Check-in', volunteerName: 'Asha', occurredAt: '2026-10-08T07:55:00Z' },
    ])
    expect(text).toContain('Asha')
    expect(text).toContain('0388')
    expect(text).toContain('two')
  })

  it('copes with a band that had no serial typed, and with several', () => {
    const text = describeOtherBands([
      { bandSerial: null, gateLabel: 'Check-in', volunteerName: 'Ravi', occurredAt: '2026-10-08T07:55:00Z' },
      { bandSerial: null, gateLabel: 'Check-in', volunteerName: 'Asha', occurredAt: '2026-10-08T07:58:00Z' },
    ])
    expect(text).toContain('Ravi')
    expect(text).not.toContain('serial')
    expect(text).toContain('1 more')
  })
})
