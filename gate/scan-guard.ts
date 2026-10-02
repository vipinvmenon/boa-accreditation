/**
 * Which camera reads the gate should act on (Vipin, 1 Oct).
 *
 * The camera decodes a frame every 700ms whether or not a result is showing,
 * so a pass held in view used to be resolved again and again: the typed band
 * serial was wiped each time, and straight after "Issue wristband" the green
 * result flipped to amber "Collected", which reads as a duplicate. A second
 * pass drifting into view could also replace a green result mid-handover.
 *
 * The rules:
 * - the code already on screen, or one still in view since it was last
 *   resolved, is ignored until it has been out of sight for `HOLD_MS`;
 * - an Approved result with no band issued yet is locked: only Issue or
 *   Cancel moves on, so a band never goes to the wrong person;
 * - any other result (Refuse, Collected, or Approved once issued) gives way
 *   to a different pass, which saves the issuer a tap in a queue.
 *
 * Pure: the caller keeps `last` and passes it back in. The hardware scanner
 * and the name search are deliberate and do not go through this.
 */

export const HOLD_MS = 2500

export type ScanShowing = 'none' | 'locked' | 'open'

export type LastRead = { payload: string; at: number } | null

export function acceptCameraRead(
  payload: string,
  showing: ScanShowing,
  last: LastRead,
  now: number,
): { accept: boolean; last: LastRead } {
  const same = last !== null && last.payload === payload
  if (same && (showing !== 'none' || now - last.at < HOLD_MS)) {
    // Still in view: keep the hold alive from this sighting.
    return { accept: false, last: { payload, at: now } }
  }
  if (showing === 'locked') return { accept: false, last }
  return { accept: true, last: { payload, at: now } }
}
