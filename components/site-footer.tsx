/**
 * ACC-176b (ADR-026; round 4 of design/proposals, chosen by Vipin 28 Sep) —
 * one footer for the desk and the gate: the logo and the show date in the
 * poster's headline face, then build dates, where to get help, and the data
 * promise (non-negotiable #9, stated to the people it protects). The base row
 * says who is signed in.
 *
 * It replaced two lines of staff policy ("Not registered, not approved, not
 * verified. Not inside." / "Artists handled at the hotel") that gave nobody a
 * way to get help — the audit's UX-18.
 *
 * Help is plain text until ACC-173 gives the desk a WhatsApp number; a link
 * that goes nowhere would be worse than none.
 */
export function SiteFooter({ signedInAs }: { signedInAs?: string | null }) {
  return (
    <footer className="site-footer">
      <div className="sf-in">
        <div className="sf-brand">
          <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
          <p className="sf-date">
            Show <span>10 Oct</span> 2026
          </p>
        </div>
        <div className="sf-cols">
          <div>
            <h2>Build</h2>
            <p>5 to 9 October.</p>
          </div>
          <div>
            <h2>Need help</h2>
            <p>Ask the accreditation desk.</p>
          </div>
          <div>
            <h2>Your data</h2>
            <p>We keep your name, phone, role and vehicle number. Nothing else.</p>
          </div>
        </div>
      </div>
      <div className="sf-base">
        <span>{signedInAs ? `Signed in as ${signedInAs}` : 'Bangalore Open Air accreditation'}</span>
        <a href="https://rocknrolloriginals.com" target="_blank" rel="noopener noreferrer">
          rocknrolloriginals.com
        </a>
      </div>
    </footer>
  )
}
