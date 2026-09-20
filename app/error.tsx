'use client'

/**
 * A failure must never look like an answer.
 *
 * The rule this page exists to keep: an empty roster because the network dropped
 * and an empty roster because nobody is approved must not look the same
 * (bar-control, OFFLINE-SYNC.md). So this shows an error, not a friendly blank.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="utility-auth">
      <div className="utility-inner">
        <div className="tag" style={{ color: 'var(--bad)', background: 'var(--badbg)' }}>Something failed</div>
        <h1
          className="h1"
        >
          This screen did not load
        </h1>
        <p className="lede">
          Nothing was saved and nothing was changed. Try again — if it keeps failing, tell
          the accreditation lead rather than working around it.
        </p>
        {error.digest ? (
          <p className="mono" style={{ margin: '22px 0' }}>
            Reference {error.digest}
          </p>
        ) : null}
        <button type="button" onClick={reset} className="btn go solo hov-invert-grn">
          Try again
        </button>
      </div>
    </main>
  )
}
