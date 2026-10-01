import { BAND_ART, ZONE_MAP_HEX, ZONES, bandArtSrc, tier, tierColour, zoneStrip, type TierCode } from '@/lib/design'
import { dayValidityCopy, PUBLIC_PASS_DESK_LINE, PUBLIC_PASS_FINE_PRINT } from '@/lib/pass-copy'

/**
 * ACC-174 (ADR-025, round 6) — the pass as a ticket, shared by the holder's
 * own page (/p/[passToken]) and the desk's pass sheet (/desk/passes) so the
 * two can never drift apart. Styles live in app/ticket.css.
 *
 * `variant` (PassTicket; GateTicket below is the gate's face-only form):
 * - `live`  — the holder's screen: dark glass over the poster the page draws
 *             behind it, plus the light sweep that marks a live pass.
 * - `sheet` — the desk grid and print: a solid dark ticket, no sweep (a grid
 *             of moving cards is noise to an operator), white on paper.
 *
 * Always the dark palette, whatever the desk theme: a pass is an object with
 * its own colours, like the band it matches. Photo-ID and after-22:00
 * qualifiers are deliberately not shown (Vipin, 28 Sep); they stay in
 * ZONE_ACCESS, on the printed sheets, and at the gate.
 */
export type PassTicketProps = {
  fullName: string
  orgName: string
  role: string
  passRef: string
  typeCode: TierCode
  dayValidity: 'build' | 'show' | 'build_show'
  vehicleReg: string | null
  qrSvg: string
  variant: 'live' | 'sheet'
}

type TicketFaceProps = Pick<PassTicketProps, 'fullName' | 'orgName' | 'role' | 'typeCode' | 'dayValidity' | 'vehicleReg'>

/**
 * The top of the ticket: band, name, who, tier and days, held zones only,
 * vehicle. Shared by the pass and the gate's result panel (GateTicket).
 */
function TicketFace(
  p: TicketFaceProps & {
    Name: 'h1' | 'h2' | 'h3'
    className: string
    deskLine: boolean
    showBand: boolean
    vehicleNote?: string | undefined
  },
) {
  const type = tier(p.typeCode)
  const zones = zoneStrip(p.typeCode).filter((z) => z.held)
  const allZones = zones.length === ZONES.length
  const validity = dayValidityCopy(p.dayValidity)
  const Name = p.Name

  return (
    <div className={p.className}>
      {p.showBand && (
        <img
          className="tk-band"
          src={bandArtSrc(type.code)}
          alt={`${type.label} wristband`}
          width={BAND_ART.width}
          height={BAND_ART.height}
        />
      )}
      <div className="tk-body">
        <div>
          <Name className="tk-name">{p.fullName}</Name>
          <p className="tk-who">
            {p.orgName} · {p.role}
          </p>
          {p.deskLine && <p className="tk-desk">{PUBLIC_PASS_DESK_LINE}</p>}
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
        {p.vehicleReg && (
          <p className="tk-vehicle">
            Vehicle <b>{p.vehicleReg}</b>
            {p.vehicleNote && <span className="tk-vehicle-note">{p.vehicleNote}</span>}
          </p>
        )}
      </div>
    </div>
  )
}

export function PassTicket(p: PassTicketProps) {
  const glare = p.variant === 'live' ? ' tk-glare' : ''
  // The holder's page has no other heading; on the desk sheet each ticket sits under the page's h1.
  const Name = p.variant === 'live' ? 'h1' : 'h2'

  return (
    <div className={`tk tk--${p.variant}`} style={{ '--c': tierColour(p.typeCode, 'dark') } as React.CSSProperties}>
      {/* The band artwork is confidential (Vipin, 29 Sep): it is not shown on the
          page a crew member receives. The desk's sheet and the gate keep it. */}
      <TicketFace {...p} Name={Name} className={`tk-top${glare}`} deskLine showBand={p.variant !== 'live'} />
      <div className="tk-perf" aria-hidden="true" />
      <div className={`tk-stub${glare}`}>
        <div
          className="tk-qr"
          role="img"
          aria-label={`Pass QR code for ${p.fullName}`}
          dangerouslySetInnerHTML={{ __html: p.qrSvg }}
        />
        <p className="tk-fine">{PUBLIC_PASS_FINE_PRINT}</p>
        <span className="tk-ref">{p.passRef}</span>
      </div>
    </div>
  )
}

/**
 * The gate's result panel shows the person as their pass shows them (Vipin,
 * 29 Sep): the same face, no stub, QR or desk line (they are already at the
 * gate), the band at full strength because it is what the volunteer matches
 * to the band in hand. Everything it reads is in the gate's offline roster;
 * the band art is precached by scripts/build-gate-sw.mjs.
 */
export function GateTicket({
  tshirtSize,
  tshirtGivenAt,
  onTshirtGiven,
  ...p
}: TicketFaceProps & {
  stickerDue: boolean
  tshirtSize?: string | null
  /** ACC-197b: set once a volunteer has handed the shirt over. */
  tshirtGivenAt?: string | null
  onTshirtGiven?: () => void
}) {
  return (
    <div className="tk tk--gate" style={{ '--c': tierColour(p.typeCode, 'dark') } as React.CSSProperties}>
      <TicketFace {...p} Name="h3" className="tk-top" deskLine={false} showBand vehicleNote={p.stickerDue ? 'Sticker due' : undefined} />
      {/* ACC-197: a cue for the volunteer only. The holder's PassTicket never renders it. */}
      {tshirtSize ? (
        <div className={tshirtGivenAt ? 'tk-tshirt tk-tshirt--given' : 'tk-tshirt'} role="status">
          <span className="tk-tshirt-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
              <path d="M8.5 3 3 6l2 4.2 3-1.3V21h8V8.9l3 1.3L21 6l-5.5-3c-.4 1.6-1.7 2.6-3.5 2.6S8.9 4.6 8.5 3z" />
            </svg>
          </span>
          <span className="tk-tshirt-txt">
            <small>Crew T-shirt</small>
            <span className="tk-size">
              <i>Size</i>{' '}
              {tshirtSize}
            </span>
          </span>
          {tshirtGivenAt ? (
            <b>Given</b>
          ) : onTshirtGiven ? (
            <button type="button" className="tk-tshirt-btn" onClick={onTshirtGiven}>Mark given</button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
