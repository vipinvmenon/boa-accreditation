'use client'

import type { CSSProperties } from 'react'
import { useOutboxSync } from '@/gate/use-outbox-sync'

/**
 * ACC-149 — renders "Last synced HH:MM · N pending". The scheduler itself
 * (start/stop, ref-counted across every mounted consumer) now lives entirely
 * in gate/use-outbox-sync.ts (ACC-133): this component used to keep its own
 * copy of the same singleton, so a gate screen that both called
 * `useOutboxSync()` directly and rendered `<SyncStatus>` ran two independent
 * sync loops. There is exactly one now, shared by every consumer.
 */
function clock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  })
}

/**
 * The line is laid out with zero height and drawn into existing whitespace
 * (`top` is its offset from where it is mounted), so adding it moves nothing
 * in the v2 contract's layout — the design has no slot for it, and
 * OFFLINE-SYNC.md asks for the pull time beside the roster count.
 */
export function SyncStatus({ onSynced, top }: { onSynced?: () => void | Promise<void>; top: number }) {
  const { status } = useOutboxSync(onSynced)

  const last = status === null ? '' : status.lastPullAt === null ? 'Not synced yet' : `Last synced ${clock(status.lastPullAt)}`
  const text = status === null ? '' : `${last} · ${status.pending} pending${status.needsLogin ? ' · sign in' : ''}`
  const line: CSSProperties = {
    position: 'absolute',
    top,
    left: 0,
    right: 0,
    margin: 0,
    fontSize: 11,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    color: status?.needsLogin ? 'var(--gold)' : 'var(--ink3)',
  }
  return (
    <div style={{ position: 'relative', height: 0, margin: 0 }}>
      <p className="mono" data-sync-status role="status" aria-live="polite" title={text} style={line}>
        {text}
      </p>
    </div>
  )
}
