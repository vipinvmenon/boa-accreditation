import { BAND_ART, ZONE_MAP_HEX, ZONES, bandArtSrc, tier, tierColour, zoneStrip, type TierCode } from '@/lib/design'
import { dayValidityCopy } from '@/lib/pass-copy'

/**
 * ACC-174 (ADR-025, round 6) — the pass as a ticket, shared by the holder's
 * own page (/p/[passToken]) and the desk's pass sheet (/desk/passes) so the
 * two can never drift apart. Styles live in app/ticket.css.
 *
 * `variant`:
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

export function PassTicket(p: PassTicketProps) {
  const type = tier(p.typeCode)
  const zones = zoneStrip(p.typeCode).filter((z) => z.held)
  const allZones = zones.length === ZONES.length
  const validity = dayValidityCopy(p.dayValidity)
  const glare = p.variant === 'live' ? ' tk-glare' : ''
  // The holder's page has no other heading; on the desk sheet each ticket sits under the page's h1.
  const Name = p.variant === 'live' ? 'h1' : 'h2'

  return (
    <div className={`tk tk--${p.variant}`} style={{ '--c': tierColour(type.code, 'dark') } as React.CSSProperties}>
      <div className={`tk-top${glare}`}>
        <img
          className="tk-band"
          src={bandArtSrc(type.code)}
          alt={`${type.label} wristband`}
          width={BAND_ART.width}
          height={BAND_ART.height}
        />
        <div className="tk-body">
          <div>
            <Name className="tk-name">{p.fullName}</Name>
            <p className="tk-who">
              {p.orgName}, {p.role}
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
          {p.vehicleReg && (
            <p className="tk-vehicle">
              Vehicle <b>{p.vehicleReg}</b>
            </p>
          )}
        </div>
      </div>
      <div className="tk-perf" aria-hidden="true" />
      <div className={`tk-stub${glare}`}>
        <div
          className="tk-qr"
          role="img"
          aria-label={`Pass QR code for ${p.fullName}`}
          dangerouslySetInnerHTML={{ __html: p.qrSvg }}
        />
        <p className="tk-fine">Bring photo ID. One person, one pass, one band.</p>
        <span className="tk-ref">{p.passRef}</span>
      </div>
    </div>
  )
}
