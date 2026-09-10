/**
 * The approved design's own values, transcribed from
 * design/source/boa_design_body.html. Nothing here is invented.
 *
 * ── THE TWO COLOUR LAYERS (docs/DESIGN-SYSTEM.md, conflict C8) ──
 *
 * The design carries colour in two places and they DISAGREE on six values:
 *
 *   Layer 1 — the <helmet> [data-theme] blocks (app/globals.css).
 *             Wins wherever the markup resolves a value through var(--x, …).
 *   Layer 2 — the literals in renderVals() (PROP, below).
 *             Wins wherever the value arrives as a prop: {{ s.colour }},
 *             {{ z.fg }}, {{ o.typeColour }}, {{ f.bg }}, {{ p.rowBg }},
 *             {{ n.bg }} — every sc-for/sc-if-driven attribute.
 *
 * e.g. --ink2 dark is rgba(242,239,226,0.72) in the helmet but #A6C9B4 as a
 * prop. Both are correct. This is not a bug to reconcile; it is how the design
 * renders today, and "fixing" either layer produces a visual diff against the
 * approved artefact. Six values differ: ink2, rule, on, grnbg, goldbg, badbg.
 *
 * The inline fallbacks in the markup (`var(--ink3, rgba(166,201,180,0.58))` —
 * a THIRD value on the stat label) are dead code in the live DOM. Transcribe
 * them verbatim where they appear. Never "correct" them.
 */

export type Theme = 'dark' | 'light'

/** Layer 2. Values that arrive as props, from renderVals() lines 611-621. */
export const PROP = {
  dark: {
    grn: '#00F5A5',
    gold: '#E3BB72',
    bad: '#FF6B5A',
    ink: '#F2EFE2',
    ink2: '#A6C9B4', // NOT the helmet's rgba(242,239,226,0.72). See above.
    ink3: 'rgba(242,239,226,0.52)',
    rule: 'rgba(166,201,180,0.18)', // NOT the helmet's rgba(242,239,226,0.16).
    grnbg: 'rgba(0,245,165,0.08)', // helmet says 0.10
    goldbg: 'rgba(227,187,114,0.08)', // helmet says 0.10
    badbg: 'rgba(255,107,90,0.09)', // helmet says 0.10
    on: '#0D0D12', // NOT the helmet's #0A0A0A.
  },
  light: {
    grn: '#05603F',
    gold: '#5E4610',
    bad: '#9E1F14',
    ink: '#14141A',
    ink2: 'rgba(20,20,26,0.76)',
    ink3: 'rgba(20,20,26,0.50)',
    rule: 'rgba(20,20,26,0.18)',
    grnbg: 'rgba(5,96,63,0.07)',
    goldbg: 'rgba(94,70,16,0.07)',
    badbg: 'rgba(158,31,20,0.07)',
    on: '#F6F4EC',
  },
} as const satisfies Record<Theme, Record<string, string>>

/** renderVals() line 622. Dark only; light returns 'none'. */
export const glowFor = (colour: string, theme: Theme): string =>
  theme === 'dark' ? `0 0 16px ${colour}55, 0 0 38px ${colour}22` : 'none'

/**
 * The seven zones, in the design's own ALL_ZONES order (line 570).
 * Order is load-bearing: every zone strip renders in this order, with
 * zones the pass does NOT hold prefixed '—— '. The database enum
 * boa_acc_zone declares its values in this same order.
 */
export const ALL_ZONES = [
  'Site',
  'Backstage',
  'Stage',
  'Prod office',
  'Bar',
  'Lounges',
  'Artist area',
] as const
export type Zone = (typeof ALL_ZONES)[number]

export type PassTypeCode = 'crew' | 'stage' | 'aaa'

/**
 * The three pass types, from TYPES (lines 564-568). Three, not the six the
 * 29-Aug spec proposed: the design is the later document and its counts
 * (520 + 78 + 14) tie to the dashboard's own "Approved 612".
 *
 * `count` is the design's mock figure. It is NOT seeded and NOT displayed —
 * real counts come from boa_acc_desk_dashboard(). It is recorded here only so
 * the design-reference generator can reproduce the approved artboard.
 */
export const TYPES = [
  {
    code: 'crew',
    num: 'The standard',
    label: 'Working Crew',
    colour: '#00F5A5',
    colourLight: '#05603F',
    band: 'Poison green',
    count: 520,
    zones: ['Site', 'Backstage', 'Prod office', 'Bar'],
    note: 'The standard band. Most people working the festival.',
  },
  {
    code: 'stage',
    num: 'The limited',
    label: 'Stage',
    colour: '#E3BB72',
    colourLight: '#5E4610',
    band: 'Ritual gold',
    count: 78,
    zones: ['Site', 'Backstage', 'Stage', 'Prod office'],
    note: 'Limited. Only people who work on or directly around the stages.',
  },
  {
    code: 'aaa',
    num: 'The restricted',
    label: 'AAA',
    colour: '#F2EFE2',
    colourLight: '#2A2A33',
    band: 'Bone white',
    count: 14,
    zones: ['Site', 'Backstage', 'Stage', 'Prod office', 'Bar', 'Lounges', 'Artist area'],
    note: 'Highly restricted. Named list only, approved directly by Salman.',
  },
] as const satisfies ReadonlyArray<{
  code: PassTypeCode
  num: string
  label: string
  colour: string
  colourLight: string
  band: string
  count: number
  zones: ReadonlyArray<Zone>
  note: string
}>

/** renderVals() typeOf(): resolves a type's colour for the active theme. */
export function typeColour(code: PassTypeCode, theme: Theme): string {
  const t = TYPES.find((x) => x.code === code) ?? TYPES[0]
  return theme === 'dark' ? t.colour : t.colourLight
}

export function passType(code: PassTypeCode) {
  return TYPES.find((x) => x.code === code) ?? TYPES[0]
}

/** The design's nav (lines 572-580), mapped onto real routes. */
export const NAV = [
  { id: 'dashboard', label: 'Control room', href: '/desk' },
  { id: 'queue', label: 'Queue', href: '/desk/queue' },
  { id: 'master', label: 'Master list', href: '/desk/master' },
  { id: 'submit', label: 'Submission', href: '/desk/orgs' },
  { id: 'pass', label: 'Passes', href: '/desk/passes' },
  { id: 'gate', label: 'Gate', href: '/gate' },
  { id: 'vehicle', label: 'Vehicle', href: '/gate/vehicle' },
] as const

/**
 * The design's viewport toggle (vpTabs) is a design-review affordance and is
 * NOT shipped. Every `mob ? A : B` in renderVals() becomes a real media query
 * at this breakpoint, and shellMax 1280px becomes a max-width.
 */
export const MOBILE_BREAKPOINT_PX = 768
export const SHELL_MAX_PX = 1280

/** The scan verdicts. Three outcomes, no fourth (renderVals() scanMap). */
export const SCAN_VERDICTS = ['idle', 'green', 'amber', 'red'] as const
export type ScanVerdict = (typeof SCAN_VERDICTS)[number]

export const SCAN_COPY: Record<ScanVerdict, { verdict: string; sub: string }> = {
  idle: { verdict: 'Ready', sub: 'Waiting for a scan' },
  green: { verdict: 'Approved', sub: 'Not yet collected · issue a band' },
  amber: { verdict: 'Collected', sub: 'A band was already issued to this person' },
  red: { verdict: 'Refuse', sub: 'Unknown, rejected or voided token' },
}

/** Day validity, from the design's SHEET rows ('Build + show' / 'Build day' / 'Show day'). */
export const DAY_VALIDITY = {
  build: 'Build day',
  show: 'Show day',
  build_show: 'Build + show',
} as const
export type DayValidity = keyof typeof DAY_VALIDITY

/** The QR payload scheme. The prefix lets the scanner reject a foreign QR in
 *  one startsWith before touching the roster index, and stops a stray camera
 *  app from opening anything. See docs/SECURITY.md. */
export const QR_SCHEME = 'BOA26:'
