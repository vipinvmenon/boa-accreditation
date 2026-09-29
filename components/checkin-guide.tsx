import { CHECKIN_GUIDE, CHECKIN_GUIDE_ID } from '@/lib/pass-copy'

/**
 * ACC-196 — the check-in guide under the ticket on /p/[passToken] (mock:
 * design/proposals/checkin-guide.html). Server component, no client JS. The
 * ticket above it still fits one screen; this is what the holder scrolls to.
 * Words live in lib/pass-copy.ts. Styles: app/checkin-guide.css.
 */
type Where = { place: string; address: readonly string[]; note: string; mapUrl: string }

function Where({ place, address, note, mapUrl }: Where) {
  return (
    <>
      <p className="cg-where">
        <b>{place}</b>
        {address.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <p className="cg-small">{note}</p>
      <a className="cg-pill" href={mapUrl} target="_blank" rel="noopener noreferrer">
        {CHECKIN_GUIDE.mapsCta}
        <span className="cg-sr"> (opens Google Maps in a new tab)</span>
      </a>
    </>
  )
}

export function CheckinGuideCue() {
  return (
    <a className="cg-pill cg-cue" href={`#${CHECKIN_GUIDE_ID}`}>
      {CHECKIN_GUIDE.cue} <span aria-hidden="true">↓</span>
    </a>
  )
}

export function CheckinGuide() {
  const g = CHECKIN_GUIDE
  return (
    <section id={CHECKIN_GUIDE_ID} className="cg" aria-labelledby="cg-title">
      <div className="cg-card">
        <div className="cg-in">
          <span className="cg-label">{g.eyebrow}</span>
          <h2 className="cg-h" id="cg-title">
            {g.heading}
          </h2>
          <ol className="cg-steps">
            {g.steps.map((s, i) => (
              <li key={s.lead}>
                <span className="cg-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span>
                  <b>{s.lead}</b> {s.rest}
                </span>
              </li>
            ))}
          </ol>
          <p className="cg-tips">{g.tips}</p>
        </div>
      </div>

      <div className="cg-card">
        <div className="cg-in">
          <span className="cg-label">{g.crew.label}</span>
          <h2 className="cg-h">{g.crew.heading}</h2>
          <span className="cg-when">{g.crew.day}</span>
          <span className="cg-time">{g.crew.hours}</span>
          <p className="cg-warn">{g.crew.warning}</p>
          <Where {...g.crew} />
        </div>
      </div>

      <div className="cg-card">
        <div className="cg-in">
          <span className="cg-label">{g.guest.label}</span>
          <h2 className="cg-h">{g.guest.heading}</h2>
          <span className="cg-when">{g.guest.day}</span>
          <span className="cg-time">{g.guest.hours}</span>
          <Where {...g.guest} />
        </div>
      </div>

      <p className="cg-sign">{g.signOff}</p>
      <p className="cg-help">{g.help}</p>
    </section>
  )
}
