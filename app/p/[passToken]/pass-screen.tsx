import { CheckinGuide, CheckinGuideCue } from '@/components/checkin-guide'
import { PassTicket } from '@/components/pass-ticket'
import type { PassViewWithQr } from '@/lib/schemas/pass-view'

/**
 * ACC-144 — the person's own pass, at /p/[passToken]. The one screen anyone
 * outside BOA staff is ever handed a link to (docs/WHATSAPP.md), so it gets
 * no desk chrome (ADR-009). It is a server component — the data is already
 * resolved by page.tsx before this renders, so there is nothing to fetch and
 * no client JS for a screen nobody interacts with.
 *
 * ACC-174 (ADR-025, round 6 of design/proposals, chosen by Vipin 28 Sep): a
 * ticket over the festival poster, built to be opened from WhatsApp and read
 * on ONE screen with no scrolling — the busiest tier fits the in-app browser
 * at 390×706. The ticket is components/pass-ticket.tsx (variant "live": glass
 * and the light sweep), shared with the desk's pass sheet; this page adds the
 * logo and the poster behind it.
 *
 * ACC-196: the check-in guide (components/checkin-guide.tsx) sits below the
 * ticket, reached by scrolling or the cue pill; the poster is now full strength
 * behind it, because the guide's glass is what keeps the text readable.
 *
 * Fixed dark theme: public surfaces carry no theme toggle (ADR-009).
 */

export function PassScreen({ pass }: { pass: PassViewWithQr }) {
  return (
    <main className="tk-page">
      <img className="tk-logo" src="/assets/boa-logo.png" alt="Bangalore Open Air" />
      <PassTicket {...pass} variant="live" />
      <CheckinGuideCue />
      <CheckinGuide />
      <style>{`
        .tk-page {
          position: relative;
          isolation: isolate;
          min-height: 100dvh;
          display: grid;
          align-content: start;
          justify-items: center;
          gap: 12px;
          padding: 14px 16px 24px;
          background: var(--bg, #0A0A0A);
        }
        /* The poster covers the whole viewport and never ends mid-page. */
        .tk-page::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -2;
          background: var(--bg, #0A0A0A) url(/assets/pass-poster.webp) 50% 18% / cover no-repeat;
          opacity: 1;
        }
        .tk-page::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -1;
          background: linear-gradient(180deg, rgba(10,10,10,.22), rgba(10,10,10,.3) 45%, rgba(10,10,10,.62));
        }
        .tk-logo { justify-self: start; width: 104px; height: auto; margin-left: max(4px, calc(50% - 206px)); }
      `}</style>
    </main>
  )
}
