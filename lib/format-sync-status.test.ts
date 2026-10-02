// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { formatSyncStatus } from './format-sync-status'

const syncedAt = Date.parse('2026-09-26T09:00:00.000Z')
const after = (minutes: number) => syncedAt + minutes * 60_000
const online = { lastPullAt: syncedAt, online: true }

describe('formatSyncStatus', () => {
  it('is empty before the scheduler has reported a status', () => {
    expect(formatSyncStatus(null).text).toBe('')
  })

  it('reports when the device has never pulled', () => {
    expect(formatSyncStatus({ lastPullAt: null, online: true }, after(0))).toEqual({ text: 'Not synced yet', title: '', stale: false })
  })

  it('says how long ago, not what time, and keeps the clock time for the tooltip', () => {
    expect(formatSyncStatus(online, after(0.5))).toEqual({ text: 'Synced just now', title: 'Last synced 14:30', stale: false })
    expect(formatSyncStatus(online, after(4))).toEqual({ text: 'Synced 4 min ago', title: 'Last synced 14:30', stale: false })
  })

  it('goes stale at five minutes, and says what to do only when there is signal', () => {
    expect(formatSyncStatus(online, after(5))).toMatchObject({ text: 'List is 5 min old · not updating, call a lead', stale: true })
    expect(formatSyncStatus({ ...online, online: false }, after(12))).toMatchObject({ text: 'List is 12 min old', stale: true })
  })

  it('counts hours past the hour', () => {
    expect(formatSyncStatus({ ...online, online: false }, after(135)).text).toBe('List is 2 h old')
  })

  it('never shows a negative age when the phone clock runs behind', () => {
    expect(formatSyncStatus(online, after(-2)).text).toBe('Synced just now')
  })
})
