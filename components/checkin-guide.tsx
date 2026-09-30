import { Icon, type IconName } from '@/components/icon'
import { CHECKIN_GUIDE, CHECKIN_GUIDE_ID } from '@/lib/pass-copy'

/**
 * ACC-196 — the check-in guide under the ticket on /p/[passToken] (mock:
 * design/proposals/checkin-guide.html). Server component, no client JS. The
 * ticket above it still fits one screen; this is what the holder scrolls to.
 * Words live in lib/pass-copy.ts; every line leads with a Phosphor icon so it
 * reads at a glance (Vipin, 29 Sep). Styles: app/checkin-guide.css.
 */
type Where = {
  place: string
  address: readonly string[]
  notes: readonly { icon: IconName; text: string }[]
  mapUrl: string
}

function Where({ place, address, notes, mapUrl }: Where) {
  return (
    <>
      <p className="cg-where">
        <Icon name="map-pin" />
        <span>
          <b>{place}</b>
          {address.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      </p>
      <ul className="cg-notes">
        {notes.map((n) => (
          <li key={n.text}>
            <Icon name={n.icon} />
            <span>{n.text}</span>
          </li>
        ))}
      </ul>
      <a className="cg-pill" href={mapUrl} target="_blank" rel="noopener noreferrer">
        <Icon name="map-trifold" />
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
            {g.steps.map((s) => (
              <li key={s.lead}>
                <span className="cg-n">
                  <Icon name={s.icon} />
                </span>
                <span>
                  <b>{s.lead}</b> {s.rest}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="cg-card">
        <div className="cg-in">
          <span className="cg-label">{g.crew.label}</span>
          <h2 className="cg-h">{g.crew.heading}</h2>
          <span className="cg-when">
            <Icon name="calendar-blank" />
            {g.crew.day}
          </span>
          <span className="cg-time">
            <Icon name="clock" />
            {g.crew.hours}
          </span>
          <p className="cg-warn">
            <Icon name="warning" />
            <span>{g.crew.warning}</span>
          </p>
          <Where {...g.crew} />
        </div>
      </div>

      <div className="cg-card">
        <div className="cg-in">
          <span className="cg-label">{g.guest.label}</span>
          <h2 className="cg-h">{g.guest.heading}</h2>
          <span className="cg-when">
            <Icon name="calendar-blank" />
            {g.guest.day}
          </span>
          <span className="cg-time">
            <Icon name="clock" />
            {g.guest.hours}
          </span>
          <Where {...g.guest} />
        </div>
      </div>

      <p className="cg-sign">{g.signOff}</p>
      <p className="cg-help">
        <Icon name="headset" />
        <span>
          {g.help}
          {g.helpPhone ? (
            <>
              {': '}
              <a href={`tel:${g.helpPhone.replace(/\s+/g, '')}`}>{g.helpPhone}</a>
            </>
          ) : null}
        </span>
      </p>
    </section>
  )
}
