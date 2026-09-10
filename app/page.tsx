import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'BOA Accreditation' }

/**
 * The root is a deliberate dead end.
 *
 * Every real surface is reached by a credential someone already holds: a vendor
 * has an /s/<invite_token> link, a crew member has /p/<pass_token>, an approver
 * signs in at /desk/login, a volunteer has a device token pasted at /gate/setup.
 * There is nothing to discover here, so this page offers nothing to discover —
 * no login link, no route list, no "are you a vendor?" chooser that would tell a
 * stranger what surfaces exist.
 *
 * The line is the design's own footer text.
 */
export default function Home() {
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
            color: 'var(--grn, #00F5A5)',
            marginBottom: '18px',
          }}
        >
          Bangalore Open Air 2026
        </div>
        <h1
          style={{
            fontFamily: "'Anton',sans-serif",
            fontSize: 'clamp(38px, 6vw, 58px)',
            lineHeight: 0.92,
            letterSpacing: '0.01em',
            textTransform: 'uppercase',
            color: 'var(--ink, #F2EFE2)',
            margin: '0 0 18px',
          }}
        >
          Nobody walks in unlisted
        </h1>
        <p
          style={{
            fontSize: '15.5px',
            lineHeight: 1.55,
            color: 'var(--ink2, rgba(242,239,226,0.72))',
            margin: 0,
          }}
        >
          Accreditation is by invitation. If your company is working at BOA, your contact has
          been sent a registration link. If you are crew and expecting a pass, it will reach
          you on the number you were registered with.
        </p>
        <p
          style={{
            fontFamily: "'Oswald',sans-serif",
            fontSize: '10.5px',
            fontWeight: 500,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink3, rgba(242,239,226,0.52))',
            marginTop: '30px',
          }}
        >
          Not registered, not approved, not verified — not inside.
        </p>
      </div>
    </main>
  )
}
