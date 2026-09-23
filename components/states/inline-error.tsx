/**
 * ACC-122/124: one error affordance for every desk screen, `role="alert"` so
 * it is announced the moment it appears (matching the `role="alert"` `<p>`
 * every screen already hand-rolled), with an optional inline Retry — never a
 * dead end the operator has to reload the page to escape.
 *
 * Deliberately unstyled beyond `.inline-error` (app/v2.css, `color: var(--bad)`
 * — an existing token, no new colour): callers pass their own layout class
 * (e.g. `utility-error`) where one already existed, so this consolidates the
 * markup without moving pixels.
 */
export function InlineError({
  message,
  onRetry,
  retryLabel = 'Retry',
  className = '',
}: {
  message: string
  onRetry?: () => void
  retryLabel?: string
  className?: string
}) {
  return (
    <p role="alert" className={`inline-error ${className}`.trim()}>
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="linkbtn inline-error-retry">
          {retryLabel}
        </button>
      )}
    </p>
  )
}
