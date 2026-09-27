import { BAND_ART, bandArtSrc, tier, tierColour } from '@/lib/design'
import { zoneChips } from '@/lib/desk-tiers'
import { dayValidityCopy } from '@/lib/pass-copy'
import type { PassViewWithQr } from '@/lib/schemas/pass-view'

/**
 * ACC-144 — the person's own pass, at /p/[passToken]. The one screen anyone
 * outside BOA staff is ever handed a link to (docs/WHATSAPP.md), so it gets
 * no desk chrome (ADR-009) and is built to be read off a phone screen in
 * hand, outdoors, once: one big card, one big QR, no navigation, nothing to
 * tap. It is a server component — the data is already resolved by
 * page.tsx before this renders, so there is nothing to fetch and no reason
 * to ship client JS for a screen nobody interacts with.
 *
 * The card markup (`.pass .pl`, `.ph`, `.who`, `.bandbox`, `.zones`, `.qr`,
 * `.vehbox`, `.fine`) is the same DOM the desk's /desk/passes "Pass sheet"
 * screen uses (app/desk/passes/passes-screen.tsx, design/source/
 * boa_design_v2.html lines 568-819) — that IS the pixel contract for one
 * pass; there is no separate single-pass mock in the design source. What is
 * new here (documented, not hidden): the page-scoped <style> below enlarges
 * the card and the QR, and lifts contrast, because this screen has a
 * requirement the desk sheet never had — legible in direct sunlight, at
 * arm's length, on one phone — derived from the v2 primitives (theme
 * tokens, type scale, the same `.qr`/`.bandbox` shapes) rather than the
 * source having a scan-in-sunlight variant to copy.
 *
 * ACC-174 (ADR-025): the pass leads with the tier's woven wristband artwork —
 * a full-bleed strip across the top of the card, and the same artwork tiled
 * behind the page — because the steward checks the band on the wrist against
 * the band on the phone. The card itself stays a solid surface: no text ever
 * sits on the artwork. The tinted `.bandbox` is kept as the plain-text tier
 * name (the General Admission band prints no tier name at all).
 *
 * Fixed dark theme, same as /s/[token]'s SubmissionScreen: public surfaces
 * carry no theme toggle (that toggle is desk/review furniture — see
 * lib/design.ts's MOBILE_BREAKPOINT_PX comment and ADR-009).
 */

const THEME = 'dark' as const

export function PassScreen({ pass }: { pass: PassViewWithQr }) {
  const type = tier(pass.typeCode)
  const zones = zoneChips(pass.typeCode)
  const validity = dayValidityCopy(pass.dayValidity)

  return (
    <main className="pass-page" style={{ '--band-art': `url(${bandArtSrc(type.code)})` } as React.CSSProperties}>
      <article className="pass pass-page-card" style={{ '--c': tierColour(type.code, THEME) } as React.CSSProperties}>
        <img
          className="pass-page-band"
          src={bandArtSrc(type.code)}
          alt={`${type.label} wristband`}
          width={BAND_ART.width}
          height={BAND_ART.height}
        />
        <div className="pl">
          <div className="ph">
            <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
            <span className="mono">{pass.passRef}</span>
          </div>
          <div className="who">
            <div className="nm">{pass.fullName}</div>
            <div className="sub" style={{ marginTop: '8px' }}>
              {pass.orgName}
              <br />
              {pass.role}
            </div>
          </div>
          <div className="bandbox">
            <b>{type.label}</b>
            <small>{type.band} band</small>
          </div>
          <div className="pass-page-validity">
            <span className="mono">Valid</span>
            <b>{validity.label}</b>
            <span>{validity.dates}</span>
          </div>
          <div className="zones">
            {zones.map((zone) => (
              <span key={zone.zone} className={zone.held ? undefined : 'off'}>
                {zone.text}
              </span>
            ))}
          </div>
          <div
            className="qr qr-wrap"
            role="img"
            aria-label={`Pass QR code for ${pass.fullName}`}
            dangerouslySetInnerHTML={{ __html: pass.qrSvg }}
          />
          {pass.vehicleReg && (
            <div className="vehbox">
              <span className="mono">Vehicle</span>
              <b>{pass.vehicleReg}</b>
            </div>
          )}
          <p className="fine">
            Bring this and a valid photo ID. Non-transferable. One person, one pass, one
            check-in, one wristband.
          </p>
          <p className="fine pass-page-instruction">
            Show this at the crew check-in desk. No collection on anyone else&rsquo;s behalf.
          </p>
        </div>
      </article>

      <style>{`
        .pass-page {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px 40px;
          background: var(--bg, #0A0A0A);
        }
        /* The tier's band, tiled like a crate of them and tilted, well under
           the card. Decorative only; the scrim keeps it from competing. */
        .pass-page::before {
          content: '';
          position: fixed;
          inset: -30%;
          z-index: -2;
          background: var(--band-art) 0 0 / auto 72px repeat;
          transform: rotate(-12deg);
          opacity: .32;
        }
        .pass-page::after {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -1;
          background: color-mix(in srgb, var(--bg, #0A0A0A) 62%, transparent);
        }
        .pass-page-card {
          width: min(420px, 100%);
          overflow: hidden;
          border-radius: var(--r-out);
          background: var(--panel, #101012);
          box-shadow: inset 0 0 0 1px var(--rule), var(--lift);
        }
        /* The whole band is ~17:1 — 20px tall on a phone. Show its first
           ~60% (tier name, horns, BANGALORE mark) at 10:1 instead; the
           repeated ".COM" end is what gets cropped. */
        .pass-page-band {
          display: block;
          width: 100%;
          height: auto;
          aspect-ratio: 10 / 1;
          object-fit: cover;
          object-position: left center;
        }
        .pass-page-card .bandbox {
          background: none;
          box-shadow: none;
          padding: 0;
        }
        /* One surface under the band, not the shared bezel's inner panel —
           and no hover lift on a card nobody interacts with. */
        .pass-page-card .pl,
        .pass-page-card:hover .pl {
          padding: 24px 24px 28px;
          gap: 20px;
          border-radius: 0;
          background: none;
          box-shadow: none;
          transform: none;
        }
        .pass-page-card .who .nm { font-size: 40px; }
        .pass-page-card .qr-wrap { justify-self: center; padding: 20px; }
        .pass-page-card .qr-wrap svg { display: block; width: min(280px, 62vw); height: min(280px, 62vw); }
        .pass-page-validity {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 4px 10px;
          padding: 12px 14px;
          border-radius: var(--r-sm, 12px);
          box-shadow: inset 0 0 0 1px var(--rule);
        }
        .pass-page-validity b { font-family: var(--display); font-weight: 400; font-size: 18px; text-transform: uppercase; }
        .pass-page-validity span:last-child { color: var(--ink2); font-size: 13px; }
        .pass-page-instruction { font-weight: 600; color: var(--ink2); }
      `}</style>
    </main>
  )
}
