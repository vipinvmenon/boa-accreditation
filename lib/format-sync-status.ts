import type { SyncStatus } from '@/gate/sync-scheduler'

/** Pulls run every 45 s while online; five minutes is six missed in a row. */
export const SYNC_STALE_AFTER_MS = 5 * 60_000

function clock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })
}

function age(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`
}

export type SyncLine = {
  text: string
  /** the clock time of the last pull, for the title tooltip */
  title: string
  /** the phone's copy is older than SYNC_STALE_AFTER_MS */
  stale: boolean
}

/**
 * How old this phone's copy of the roster and ledger is (2 Oct, Vipin: "what
 * is the point of last synced"). A clock time made the volunteer do the sum;
 * the age does it for them, and turns amber once it is old.
 *
 * Offline is a designed mode, so a stale copy offline only states its age
 * (the status row already says "Offline · keep scanning"). Stale while online
 * means pulls are failing with signal, which nothing else reports: that one
 * says what to do.
 *
 * The gate pill owns queue and sign-in state; this line reports pull
 * freshness only.
 */
export function formatSyncStatus(
  status: Pick<SyncStatus, 'lastPullAt' | 'online'> | null,
  now: number = Date.now(),
): SyncLine {
  if (status === null) return { text: '', title: '', stale: false }
  if (status.lastPullAt === null) return { text: 'Not synced yet', title: '', stale: false }
  const elapsed = Math.max(0, now - status.lastPullAt)
  const title = `Last synced ${clock(status.lastPullAt)}`
  if (elapsed < 60_000) return { text: 'Synced just now', title, stale: false }
  if (elapsed < SYNC_STALE_AFTER_MS) return { text: `Synced ${age(elapsed)} ago`, title, stale: false }
  return {
    text: status.online
      ? `List is ${age(elapsed)} old · not updating, call a lead`
      : `List is ${age(elapsed)} old`,
    title,
    stale: true,
  }
}
