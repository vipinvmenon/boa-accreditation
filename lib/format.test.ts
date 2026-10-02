// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatCountdown, formatRecentLedgerRow } from './format'

const occurredAt = '2026-09-26T13:44:00'

describe('formatRecentLedgerRow', () => {
  it('preserves known wristband history copy', () => {
    expect(formatRecentLedgerRow({
      kind: 'wristband',
      holderName: 'Ravi Kumar',
      holderLabel: 'Working Crew',
      serial: '#0412',
      occurredAt,
    })).toEqual({
      name: 'Ravi Kumar',
      detail: 'Working Crew, band 0412, 13:44',
    })
  })

  it('labels a known vehicle sticker as a sticker, not a band', () => {
    expect(formatRecentLedgerRow({
      kind: 'vehicle_sticker',
      holderName: 'Ravi Kumar',
      holderLabel: 'Working Crew',
      serial: '#V-0231',
      occurredAt,
    }).detail).toBe('Working Crew, sticker V-0231, 13:44')
  })

  it('names an unknown wristband holder without repeating the kind', () => {
    expect(formatRecentLedgerRow({
      kind: 'wristband',
      holderName: null,
      holderLabel: null,
      serial: undefined,
      occurredAt,
    })).toEqual({
      name: 'Holder not on this phone’s list',
      detail: 'wristband, no serial, 13:44',
    })
  })

  it('names an unknown vehicle sticker holder clearly', () => {
    expect(formatRecentLedgerRow({
      kind: 'vehicle_sticker',
      holderName: null,
      holderLabel: null,
      serial: '#V-0231',
      occurredAt,
    })).toEqual({
      name: 'Holder not on this phone’s list',
      detail: 'vehicle sticker, sticker V-0231, 13:44',
    })
  })
})

describe('formatCountdown', () => {
  // 2 Oct 2026, 23:30 in Bangalore is already 2 Oct there but 18:00 UTC.
  const lateOnTheSecond = new Date('2026-10-02T18:00:00Z')

  it('counts calendar days on the desk clock', () => {
    expect(formatCountdown('2026-10-04', '2026-10-04', lateOnTheSecond)).toBe('in 2 days')
    expect(formatCountdown('2026-10-03', '2026-10-03', lateOnTheSecond)).toBe('tomorrow')
    expect(formatCountdown('2026-10-02', '2026-10-02', lateOnTheSecond)).toBe('today')
  })

  it('turns over at midnight in Bangalore, not UTC', () => {
    expect(formatCountdown('2026-10-03', '2026-10-03', new Date('2026-10-02T18:31:00Z'))).toBe('today')
  })

  it('says a range is on now, and anything past is done', () => {
    const build = (iso: string) => formatCountdown('2026-10-05', '2026-10-09', new Date(iso))
    expect(build('2026-10-07T06:00:00Z')).toBe('on now')
    expect(build('2026-10-09T17:00:00Z')).toBe('on now')
    expect(build('2026-10-10T06:00:00Z')).toBe('done')
  })
})
