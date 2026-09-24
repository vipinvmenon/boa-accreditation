'use client'

/**
 * A failure must never look like an answer.
 *
 * The rule this page exists to keep: an empty roster because the network dropped
 * and an empty roster because nobody is approved must not look the same
 * (bar-control, OFFLINE-SYNC.md). So this shows an error, not a friendly blank.
 *
 * ACC-128: wired to `retry`, not `reset`. This Next version's error boundary
 * still passes both (node_modules/next/dist/client/components/error-boundary.js),
 * but `reset` only clears the boundary's local state — it does not refetch
 * anything. `retry` also calls the router's `refresh()` first, so a segment
 * whose error came from a stale server read actually gets a fresh one before
 * the boundary clears. node_modules/next/dist/docs' own examples for both
 * error.js and global-error.js use `retry`; `reset` is the older, weaker
 * name. See CLAUDE.md, "This is NOT the Next.js you know".
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
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
        <button type="button" onClick={retry} className="btn go solo hov-invert-grn">
          Try again
        </button>
      </div>
    </main>
  )
}
