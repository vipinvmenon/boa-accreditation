'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useOutboxSync } from '@/gate/use-outbox-sync'
import { formatSyncStatus } from '@/lib/format-sync-status'

/**
 * The line is laid out with zero height and drawn into existing whitespace
 * (`top` is its offset from where it is mounted), so adding it moves nothing
 * in the v2 contract's layout — the design has no slot for it, and
 * OFFLINE-SYNC.md asks for the pull time beside the roster count.
 */
export function SyncStatus({ onSynced, top }: { onSynced?: () => void | Promise<void>; top?: number }) {
  const { status } = useOutboxSync(onSynced)
  // The age moves on its own, between pulls; a pull also re-renders.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(timer)
  }, [])

  const { text, title, stale } = formatSyncStatus(status, now)
  // No `top`: the caller has a slot for the line (the r10 gate screen), so it
  // is drawn in flow. With `top` it is the zero-height overlay described above.
  if (top === undefined) {
    // Before the first status read (and on the server) the line still takes
    // its height, a skeleton of the text it will hold, so the folds under the
    // card do not move down when it fills in.
    return (
      // Announced only when stale: "Synced 3 min ago" changes every minute.
      <p className="mono" data-sync-status data-stale={stale ? '' : undefined} role="status" aria-live={stale ? 'polite' : 'off'} title={title || undefined}>
        {text || <span className="sk" aria-hidden="true">Synced just now</span>}
      </p>
    )
  }
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
    color: 'var(--ink3)',
  }
  return (
    <div style={{ position: 'relative', height: 0, margin: 0 }}>
      <p className="mono" data-sync-status role="status" aria-live="polite" title={title || undefined} style={line}>
        {text}
      </p>
    </div>
  )
}
