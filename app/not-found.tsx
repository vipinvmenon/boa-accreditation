/**
 * One 404 for every miss, and it says nothing about why.
 *
 * This page is what an unknown, revoked, expired, rejected or simply
 * mistyped token gets. That is deliberate: a 403 on a real token and a 404
 * on a fake one would let anyone probe which 22-character strings exist.
 * See docs/SECURITY.md.
 */
export default function NotFound() {
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
      <div style={{ maxWidth: '46ch' }}>
        <h1
          style={{
            fontFamily: "'Anton',sans-serif",
            fontSize: 'clamp(34px, 5vw, 46px)',
            lineHeight: 0.94,
            textTransform: 'uppercase',
            color: 'var(--ink, #F2EFE2)',
            margin: '0 0 14px',
          }}
        >
          This link is not valid
        </h1>
        <p
          style={{
            fontSize: '14.5px',
            lineHeight: 1.55,
            color: 'var(--ink3, rgba(242,239,226,0.52))',
            margin: 0,
          }}
        >
          It may have been mistyped, replaced by a newer link, or closed. Ask the person
          who sent it to you for a current one.
        </p>
      </div>
    </main>
  )
}
