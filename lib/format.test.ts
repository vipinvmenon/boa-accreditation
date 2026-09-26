// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatRecentLedgerRow } from './format'

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
