'use client'

/**
 * The catch that `app/error.tsx` cannot be: an error boundary wraps every
 * layout and page *below* it, but never the root layout it lives beside
 * (node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md,
 * "It does not wrap the layout.js ... above it. To handle errors in the root
 * layout, use global-error.js."). Without this file, a throw in `app/layout.tsx`
 * itself — a font import failing, a bad env read at render time — had no
 * boundary at all and fell through to Next's own unstyled fallback. ACC-128.
 *
 * `global-error` *replaces* the root layout while it is active, so it must
 * define its own `<html>`/`<body>` and cannot rely on `app/layout.tsx`
 * having run. It imports the same stylesheets and fonts directly for that
 * reason — this is the documented pattern, not a duplication mistake — so
 * the one screen most likely to render after something else has already
 * gone wrong still reads as this app, in the same tag/h1/lede vocabulary as
 * `app/error.tsx` and `app/not-found.tsx`, not as a generic browser crash
 * page. No error detail beyond the digest is shown — same reasoning as
 * `app/error.tsx`: this is an operator's screen, not a diagnostic console.
 */
import '@fontsource/anton/400.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/600.css'
import '@fontsource/jetbrains-mono/500.css'
import './globals.css'
import './v2.css'

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  return (
    <html lang="en" data-theme="dark">
      <body
        style={{
          margin: 0,
          background: 'var(--bg, #0A0A0A)',
          fontFamily: "'Archivo', system-ui, sans-serif",
          color: 'var(--ink2, rgba(242,239,226,0.72))',
        }}
      >
        <main className="utility-auth">
          <div className="utility-inner">
            <div className="tag" style={{ color: 'var(--bad)', background: 'var(--badbg)' }}>Something failed</div>
            <h1 className="h1">The app did not load</h1>
            <p className="lede">
              Nothing was saved and nothing was changed. Reload — if it keeps failing, tell
              the accreditation lead rather than working around it.
            </p>
            {error.digest ? (
              <p className="mono" style={{ margin: '22px 0' }}>
                Reference {error.digest}
              </p>
            ) : null}
            <button type="button" onClick={retry} className="btn go solo hov-invert-grn">
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
