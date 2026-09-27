import { BAND_ART, ZONE_MAP_HEX, ZONES, bandArtSrc, tier, tierColour, zoneStrip } from '@/lib/design'
import { dayValidityCopy } from '@/lib/pass-copy'
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
 * at 390×706. Top to bottom: the logo; a dark glass ticket whose top edge is
 * the tier's woven band; the name, then organisation and role as one line;
 * the tier in its band colour beside the day; the zones this pass enters, in
 * the printed zone map's colours; a notched tear line; the QR on a light
 * plate with the pass reference under it.
 *
 * Deliberately not shown (Vipin, 28 Sep): the photo-ID and after-22:00
 * qualifiers. They stay in ZONE_ACCESS, on the printed zone sheets, and at
 * the gate; the pass lists where you may go, not the conditions.
 *
 * A slow light sweep crosses the ticket (React Bits' GlareHover, adapted to
 * run without hover): a screenshot cannot reproduce it, so a steward can tell
 * a live pass from a copy. It stops under prefers-reduced-motion.
 *
 * Fixed dark theme: public surfaces carry no theme toggle (ADR-009).
 */

const THEME = 'dark' as const

export function PassScreen({ pass }: { pass: PassViewWithQr }) {
  const type = tier(pass.typeCode)
  const zones = zoneStrip(pass.typeCode).filter((z) => z.held)
  const allZones = zones.length === ZONES.length
  const validity = dayValidityCopy(pass.dayValidity)

  return (
    <main className="tk-page">
      <img className="tk-logo" src="/assets/boa-logo.png" alt="Bangalore Open Air" />
      <article className="tk" style={{ '--c': tierColour(type.code, THEME) } as React.CSSProperties}>
        <div className="tk-top tk-glare">
          <img
            className="tk-band"
            src={bandArtSrc(type.code)}
            alt={`${type.label} wristband`}
            width={BAND_ART.width}
            height={BAND_ART.height}
          />
          <div className="tk-body">
            <div>
              <h1 className="tk-name">{pass.fullName}</h1>
              <p className="tk-who">
                {pass.orgName}, {pass.role}
              </p>
            </div>
            <p className="tk-line">
              <span className="tk-tier">{type.label}</span>
              <span className="tk-valid">
                {validity.label}, {validity.dates}
              </span>
            </p>
            <ul className="tk-zones" aria-label="Zones this pass enters">
              {allZones ? (
                <li>All zones</li>
              ) : (
                zones.map((z) => {
                  const colour = ZONE_MAP_HEX[ZONES.find((x) => x.code === z.zone)!.mapColour]
                  return (
                    <li key={z.zone}>
                      <i style={{ background: colour }} aria-hidden="true" />
                      {z.label}
                    </li>
                  )
                })
              )}
            </ul>
            {pass.vehicleReg && (
              <p className="tk-vehicle">
                Vehicle <b>{pass.vehicleReg}</b>
              </p>
            )}
          </div>
        </div>
        <div className="tk-perf" aria-hidden="true" />
        <div className="tk-stub tk-glare">
          <div
            className="tk-qr"
            role="img"
            aria-label={`Pass QR code for ${pass.fullName}`}
            dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
          />
          <p className="tk-fine">Bring photo ID. One person, one pass, one band.</p>
          <span className="tk-ref">{pass.passRef}</span>
        </div>
      </article>

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
          opacity: .78;
        }
        .tk-page::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -1;
          background: linear-gradient(180deg, rgba(10,10,10,.15), rgba(10,10,10,.35) 50%, rgba(10,10,10,.7));
        }
        .tk-logo { justify-self: start; width: 104px; height: auto; margin-left: max(4px, calc(50% - 206px)); }
        .tk { width: min(420px, 100%); filter: drop-shadow(0 24px 34px rgba(0,0,0,.55)); }
        .tk-top, .tk-stub {
          position: relative;
          overflow: hidden;
          background: rgba(12,12,14,.72);
          -webkit-backdrop-filter: blur(14px) saturate(1.1);
          backdrop-filter: blur(14px) saturate(1.1);
          box-shadow: inset 0 0 0 1px rgba(227,187,114,.26);
        }
        .tk-top {
          border-radius: 22px 22px 0 0;
          -webkit-mask: radial-gradient(circle 12px at 0 100%, #0000 97%, #000) left/51% 100% no-repeat, radial-gradient(circle 12px at 100% 100%, #0000 97%, #000) right/51% 100% no-repeat;
          mask: radial-gradient(circle 12px at 0 100%, #0000 97%, #000) left/51% 100% no-repeat, radial-gradient(circle 12px at 100% 100%, #0000 97%, #000) right/51% 100% no-repeat;
        }
        .tk-stub {
          border-radius: 0 0 22px 22px;
          display: grid;
          justify-items: center;
          gap: 10px;
          padding: 16px 20px 14px;
          -webkit-mask: radial-gradient(circle 12px at 0 0, #0000 97%, #000) left/51% 100% no-repeat, radial-gradient(circle 12px at 100% 0, #0000 97%, #000) right/51% 100% no-repeat;
          mask: radial-gradient(circle 12px at 0 0, #0000 97%, #000) left/51% 100% no-repeat, radial-gradient(circle 12px at 100% 0, #0000 97%, #000) right/51% 100% no-repeat;
        }
        .tk-band {
          display: block;
          width: 100%;
          height: auto;
          aspect-ratio: 12 / 1;
          object-fit: cover;
          object-position: left center;
          opacity: .62;
          filter: saturate(.85);
          border-bottom: 1px solid rgba(227,187,114,.4);
        }
        .tk-body { display: grid; gap: 16px; padding: 20px 22px; }
        .tk-name {
          margin: 0;
          font-family: var(--display);
          font-weight: 400;
          font-size: 38px;
          line-height: .95;
          text-transform: uppercase;
          color: var(--ink);
          text-wrap: balance;
          overflow-wrap: anywhere;
        }
        .tk-who { margin: 6px 0 0; font-size: 15px; color: var(--ink2); }
        .tk-line {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: baseline;
          gap: 4px 12px;
          margin: 0;
          padding-top: 14px;
          border-top: 1px solid var(--hair);
        }
        .tk-tier { font-family: var(--display); font-size: 24px; line-height: 1; text-transform: uppercase; color: var(--c); }
        .tk-valid { font-size: 14px; color: var(--ink); }
        .tk-zones { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 0; padding: 0; list-style: none; }
        .tk-zones li { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink); }
        .tk-zones i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
        .tk-vehicle { margin: 0; font-size: 14px; color: var(--ink2); }
        .tk-vehicle b { font-family: var(--mono); font-weight: 700; color: var(--ink); letter-spacing: .04em; }
        .tk-perf { margin: 0 20px; border-top: 2px dashed rgba(227,187,114,.32); position: relative; top: -1px; }
        .tk-qr { padding: 13px; border-radius: 14px; background: var(--ink, #F2EFE2); }
        .tk-qr svg { display: block; width: min(200px, 52vw); height: min(200px, 52vw); }
        .tk-fine { margin: 0; font-size: 13px; color: var(--ink2); text-align: center; }
        .tk-ref { font-family: var(--mono); font-size: 12px; letter-spacing: .06em; color: var(--ink3); }
        .tk-glare::after {
          content: '';
          position: absolute;
          inset: -50%;
          pointer-events: none;
          background: linear-gradient(115deg, transparent 44%, rgba(255,255,255,.1) 50%, transparent 56%);
          transform: translateX(-60%);
          animation: tk-sweep 4.5s cubic-bezier(.6,0,.3,1) infinite;
        }
        @keyframes tk-sweep { 0%, 55% { transform: translateX(-60%); } 100% { transform: translateX(60%); } }
        @media (prefers-reduced-motion: reduce) { .tk-glare::after { animation: none; opacity: 0; } }
      `}</style>
    </main>
  )
}
