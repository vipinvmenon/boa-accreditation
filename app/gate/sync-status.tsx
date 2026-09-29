'use client'

import type { CSSProperties } from 'react'
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

  const text = formatSyncStatus(status)
  // No `top`: the caller has a slot for the line (the r10 gate screen), so it
  // is drawn in flow. With `top` it is the zero-height overlay described above.
  if (top === undefined) {
    return (
      <p className="mono" data-sync-status role="status" aria-live="polite" title={text}>
        {text}
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
      <p className="mono" data-sync-status role="status" aria-live="polite" title={text} style={line}>
        {text}
      </p>
    </div>
  )
}
