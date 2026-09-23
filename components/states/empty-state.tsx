import type { ReactNode } from 'react'

/**
 * ACC-122/124: the shared "nothing here, and here is what to do about it"
 * block. Reuses `.empty` (app/v2.css) — the master list's original empty
 * state — rather than inventing a new visual language; screens that already
 * render inline `<p>` copy for this (orgs, users, passes) route through this
 * component so the wording lives with the screen but the shape is shared.
 *
 * `action` is a plain ReactNode (a `<button>`/`<a>` the caller styles with
 * the screen's own classes — `.linkbtn`, `.btn`) rather than a fixed
 * label/href pair, so this never has to guess a new button style.
 */
export function EmptyState({
  message,
  action,
  className = '',
}: {
  message: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`empty ${className}`.trim()} role="status">
      <p style={{ margin: 0 }}>{message}</p>
      {action}
    </div>
  )
}
