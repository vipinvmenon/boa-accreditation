/**
 * design/source/boa_design_v2.html's own icons, rendered exactly as the
 * approved design renders them: a real Phosphor "Light" weight font glyph
 * (`<i class="ph-light ph-<name>">`), self-hosted per app/phosphor.css — not
 * an approximation of one.
 *
 * A first version of this component hand-drew each icon as an inline SVG
 * path, to avoid the CDN font the design's original markup loaded (blocked
 * by this app's own CSP, `font-src 'self'`). The hand-drawn paths were never
 * a faithful stand-in for the real font's hinting and hand-tuned optical
 * weight — no amount of tuning `stroke-width` or the `.ic` badge's tint
 * closed the gap, because the two rendering pipelines aren't comparable.
 * See the dated CURRENT-STATE.md entry for how this was found and fixed:
 * vendoring the real (MIT-licensed) font file instead of re-guessing it.
 */

export type IconName =
  | 'arrow-right'
  | 'arrow-up-right'
  | 'arrows-clockwise'
  | 'caret-down'
  | 'caret-left'
  | 'caret-right'
  | 'check'
  | 'clock'
  | 'copy'
  | 'download-simple'
  | 'funnel-simple'
  | 'magnifying-glass'
  | 'moon'
  | 'paper-plane-tilt'
  | 'plus'
  | 'printer'
  | 'scan'
  | 'sort-descending'
  | 'sun'
  | 'ticket'
  | 'users-three'
  | 'warning'
  | 'warning-circle'
  | 'x'

export function Icon({ name }: { name: IconName }) {
  return <i aria-hidden="true" className={`ph-light ph-${name}`} />
}
