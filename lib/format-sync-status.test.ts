// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatSyncStatus } from './format-sync-status'

const syncedAt = Date.parse('2026-09-26T09:00:00.000Z')

describe('formatSyncStatus', () => {
  it('is empty before the scheduler has reported a status', () => {
    expect(formatSyncStatus(null)).toBe('')
  })

  it('reports when the device has never pulled', () => {
    expect(formatSyncStatus({ lastPullAt: null, pending: 0, needsLogin: false })).toBe('Not synced yet')
  })

  it('reports only the last successful pull after syncing', () => {
    expect(formatSyncStatus({ lastPullAt: syncedAt, pending: 0, needsLogin: false })).toBe('Last synced 14:30')
  })

  it('does not repeat pending or sign-in state from the gate pill', () => {
    const status = { lastPullAt: syncedAt, pending: 3, needsLogin: true }
    expect(formatSyncStatus(status)).toBe('Last synced 14:30')
  })
})
