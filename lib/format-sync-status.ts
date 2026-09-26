import type { SyncStatus } from '@/gate/sync-scheduler'

function clock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })
}

/** The gate pill owns queue/auth state; this line only reports pull freshness. */
export function formatSyncStatus(
  status: Pick<SyncStatus, 'lastPullAt' | 'pending' | 'needsLogin'> | null,
): string {
  if (status === null) return ''
  return status.lastPullAt === null ? 'Not synced yet' : `Last synced ${clock(status.lastPullAt)}`
}
