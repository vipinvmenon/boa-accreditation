import { formatCountdown } from '@/lib/format'

/**
 * ACC-176b (ADR-026; round 4 of design/proposals, chosen by Vipin 28 Sep) —
 * one footer for the desk and the gate: the logo and the show date in the
 * poster's headline face, then build dates, where to get help, and the data
 * promise (non-negotiable #9, stated to the people it protects).
 *
 * It replaced two lines of staff policy ("Not registered, not approved, not
 * verified. Not inside." / "Artists handled at the hotel") that gave nobody a
 * way to get help — the audit's UX-18.
 *
 * 1 Oct UX review: everyone who sees this footer is an operator, so "Need help?
 * Ask the accreditation desk" told the desk to ask itself, and "Your data"
 * addressed a holder who never signs in. The columns now carry the dates an
 * operator works to and the data rule they apply (non-negotiable #9).
 *
 * 2 Oct (Vipin, option A of three): "Signed in as" is gone, the avatar menu
 * already says it. The base row carries the ACC-173 help line instead, and
 * each date says how far away it is on the desk's clock.
 *
 * Same day, round 2 ("cluttered even though we have space"): one line per
 * date, spread across the width; the data rule drops to the base row;
 * rocknrolloriginals.com is gone. The gate shows the same footer.
 */

const DATES = [
  { label: 'Gate live', day: 'Sun 4 Oct', start: '2026-10-04', end: '2026-10-04' },
  { label: 'Build', day: '5 to 9 Oct', start: '2026-10-05', end: '2026-10-09' },
  { label: 'Show', day: 'Sat 10 Oct', start: '2026-10-10', end: '2026-10-10' },
] as const

function HelpLink() {
  return (
    <a href="https://wa.me/918848724976" target="_blank" rel="noopener noreferrer">
      Something broken? WhatsApp Vipin · +91 88487 24976
    </a>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="sf-in">
        <div className="sf-brand">
          <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
        </div>
        <div className="sf-cols">
          {DATES.map((date) => (
            <div key={date.label}>
              <h2>{date.label}</h2>
              <p>
                {date.day}
                {/* The server and the phone can sit either side of midnight. */}
                <span className="sf-when" suppressHydrationWarning>{formatCountdown(date.start, date.end)}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
      <div className="sf-base">
        <HelpLink />
        <p className="sf-keep">We keep name, phone, role and vehicle number. Never an ID number, address or photo.</p>
      </div>
    </footer>
  )
}
