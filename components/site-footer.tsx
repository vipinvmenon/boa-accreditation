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
 *
 * 7 Oct (Vipin, option B of three, "bland, and the content is bad"): the three
 * date columns said "done / on now / in 3 days", so two of three said nothing.
 * Now three blocks an operator can use mid-shift: the show clock, a real
 * WhatsApp button, and the data rule as a list. The logo shares the row with the blocks.
 */

const SHOW = { day: 'Saturday 10 October', date: '2026-10-10' } as const

/** Big word for the show clock: "3 days", "tomorrow", "today", "done". */
function showClock(): string {
  return formatCountdown(SHOW.date).replace(/^in /, '')
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="sf-in">
        <div className="sf-brand">
          <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
        </div>
        <section className="sf-block">
          <h2>Show clock</h2>
          {/* The server and the phone can sit either side of midnight. */}
          <p className="sf-big" suppressHydrationWarning>{showClock()}</p>
          <p className="sf-sub">Show day is {SHOW.day}.</p>
        </section>
        <section className="sf-block">
          <h2>Need a hand</h2>
          <p>Scanner, pass or login not working? Message Vipin.</p>
          <a
            className="sf-help"
            href="https://wa.me/918848724976"
            target="_blank"
            rel="noopener noreferrer"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            WhatsApp Vipin
          </a>
        </section>
        <section className="sf-block">
          <h2>We hold</h2>
          <p>Name, phone, role and vehicle number.</p>
          <p className="sf-sub">Never an ID number, address or photo.</p>
        </section>
      </div>
    </footer>
  )
}
