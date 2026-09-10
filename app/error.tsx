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
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 18px',
        background: 'var(--bg, #0A0A0A)',
      }}
    >
      <div style={{ maxWidth: '52ch' }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--bad, #FF6B5A)',
            marginBottom: '14px',
          }}
        >
          Something failed
        </div>
        <h1
          style={{
            fontFamily: "'Anton',sans-serif",
            fontSize: 'clamp(30px, 4.4vw, 42px)',
            lineHeight: 0.94,
            textTransform: 'uppercase',
            color: 'var(--ink, #F2EFE2)',
            margin: '0 0 14px',
          }}
        >
          This screen did not load
        </h1>
        <p
          style={{
            fontSize: '14.5px',
            lineHeight: 1.55,
            color: 'var(--ink2, rgba(242,239,226,0.72))',
            margin: '0 0 22px',
          }}
        >
          Nothing was saved and nothing was changed. Try again — if it keeps failing, tell
          the accreditation lead rather than working around it.
        </p>
        {error.digest ? (
          <p
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '10.5px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink3, rgba(242,239,226,0.52))',
              margin: '0 0 22px',
            }}
          >
            Reference {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            cursor: 'pointer',
            border: '1px solid var(--grn, #00F5A5)',
            background: 'var(--grn, #00F5A5)',
            color: 'var(--on, #0A0A0A)',
            padding: '15px 22px',
            fontFamily: "'Oswald',sans-serif",
            fontSize: '13.5px',
            fontWeight: 600,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            minHeight: '50px',
          }}
        >
          Try again
        </button>
      </div>
    </main>
  )
}
