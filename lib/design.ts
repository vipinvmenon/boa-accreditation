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

/** The approved header logo filter, from renderVals() line 822. */
export const logoFilterFor = (theme: Theme): string =>
  theme === 'dark' ? 'drop-shadow(0 0 16px rgba(0,245,165,0.45))' : 'none'

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

/**
 * The design's nav (lines 572-580), mapped onto real routes.
 *
 * ADR-019 retired the vendor-link/queue screens (22 Sep, Vipin): Queue is
 * gone, and the org screen — kept because it is how the admin creates real
 * organisations, no longer how invite links are minted — is relabelled
 * "Organisations".
 */
export const NAV = [
  { id: 'dashboard', label: 'Control room', href: '/desk' },
  { id: 'master', label: 'Master list', href: '/desk/master' },
  { id: 'pass', label: 'Passes', href: '/desk/passes' },
  { id: 'orgs', label: 'Organisations', href: '/desk/orgs' },
  { id: 'gate', label: 'Gate', href: '/gate' },
  { id: 'vehicle', label: 'Vehicle', href: '/gate/vehicle' },
] as const

/**
 * Every `mob ? A : B` in renderVals() becomes a real media query at this
 * breakpoint, and shellMax 1280px becomes a max-width.
 *
 * The design's viewport toggle (vpTabs) ships too, as a real indicator: the
 * source highlights it in lockstep with `s.vp`, the same state that drives
 * every `mob ? A : B`, so mobile layout with "Web" highlighted (or vice
 * versa) is a combination the source never produces. GateChrome reflects it
 * with the same media query, in app/responsive.css (`.g-vp-web`/`.g-vp-mob`),
 * not JS/matchMedia — see docs/DESIGN-SYSTEM.md, "Responsive".
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
export const QR_DARK = '#0A0A0A'
export const QR_LIGHT = '#FFFFFF'

// ─────────────────────────────────────────────────────────────────────────
// THE ACCREDITATION PACK (ADR-018) — the domain contract for tiers and zones.
//
// Everything below mirrors design/source/accreditation/access-matrix.json,
// itself a transcription of the ten printed sheets beside it. It supersedes
// the v1 TYPES / ALL_ZONES above ON VOCABULARY ONLY; those stay as the frozen
// v1 record that tests/unit/design-contract.test.ts reads (ADR-017).
//
// tests/unit/accreditation-contract.test.ts proves this block, the JSON and
// the 202609211010 migration seed agree cell for cell.
// ─────────────────────────────────────────────────────────────────────────

/** The six zones, in the sheets' own "ZONE n OF 6" order. Order is load-bearing. */
export const ZONES = [
  { code: 'festival_area', label: 'Festival Area', labelKn: 'ಫೆಸ್ಟಿವಲ್ ಪ್ರದೇಶ', mapColour: 'green' },
  { code: 'eddies_lounge', label: "Eddie's Lounge", labelKn: 'ಎಡ್ಡೀಸ್ ಲೌಂಜ್', mapColour: 'red' },
  { code: 'promoters_lounge', label: 'Promoters Lounge', labelKn: 'ಪ್ರೊಮೋಟರ್ಸ್ ಲೌಂಜ್', mapColour: 'blue' },
  { code: 'photo_pit', label: 'Photo Pit', labelKn: 'ಫೋಟೋ ಪಿಟ್', mapColour: 'yellow' },
  { code: 'backstage', label: 'Backstage', labelKn: 'ಬ್ಯಾಕ್‌ಸ್ಟೇಜ್', mapColour: 'purple' },
  { code: 'main_stage', label: 'Main Stage', labelKn: 'ಮುಖ್ಯ ವೇದಿಕೆ', mapColour: 'orange' },
] as const
export type ZoneCode = (typeof ZONES)[number]['code']
export const ZONE_CODES = ZONES.map((z) => z.code) as unknown as readonly [ZoneCode, ...ZoneCode[]]

/**
 * The eight tiers, in the master sheet's "Where each band goes" order (most
 * access to least). `artworkNo` is the printer's 01–08 numbering, NOT a display
 * order. `printQty` null = the sheet says QTY TBC. Chip colours: Vipin, 21 Sep,
 * "match the band" (ADR-018).
 */
export const TIERS = [
  { code: 'aaa', label: 'AAA', band: 'Green', colour: '#39E639', colourLight: '#1E7A1E', printQty: 100, artworkNo: 4, requestable: false },
  { code: 'artist', label: 'Artist', band: 'Magenta', colour: '#F0169A', colourLight: '#A50E69', printQty: 100, artworkNo: 6, requestable: false },
  { code: 'stage', label: 'Stage', band: 'Orange', colour: '#F07A2A', colourLight: '#9C4A10', printQty: 50, artworkNo: 7, requestable: true },
  { code: 'promoters_lounge', label: 'Promoters Lounge', band: 'Royal blue', colour: '#4371FF', colourLight: '#1F43C2', printQty: 50, artworkNo: 3, requestable: true },
  { code: 'crew', label: 'Crew', band: 'Purple', colour: '#A64DFF', colourLight: '#6A1FB8', printQty: 500, artworkNo: 5, requestable: true },
  { code: 'photo', label: 'Photo', band: 'Yellow', colour: '#F2D21C', colourLight: '#6E5E00', printQty: null, artworkNo: 8, requestable: true },
  { code: 'eddies_lounge', label: "Eddie's Lounge", band: 'Red', colour: '#FF4A3D', colourLight: '#A81E14', printQty: 50, artworkNo: 2, requestable: true },
  { code: 'general_admission', label: 'General Admission', band: 'Black / grey / white', colour: '#B8B8B8', colourLight: '#55555C', printQty: 3000, artworkNo: 1, requestable: false },
] as const
export type TierCode = (typeof TIERS)[number]['code']
export type Tier = (typeof TIERS)[number]
export const TIER_CODES = TIERS.map((t) => t.code) as unknown as readonly [TierCode, ...TierCode[]]

export type ZoneAccess = {
  zone: ZoneCode
  tier: TierCode
  requiresPhotoId: boolean
  /** Asia/Kolkata wall-clock 'HH:MM', or null for all day. */
  fromLocalTime: string | null
  toLocalTime: string | null
}

/** One row per (zone, tier) the pack ALLOWS. Absence is a turn-away. */
export const ZONE_ACCESS: ReadonlyArray<ZoneAccess> = [
  { zone: 'festival_area', tier: 'general_admission', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'eddies_lounge', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'promoters_lounge', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'aaa', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'crew', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'artist', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'stage', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'festival_area', tier: 'photo', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },

  { zone: 'eddies_lounge', tier: 'eddies_lounge', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },
  { zone: 'eddies_lounge', tier: 'artist', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },
  { zone: 'eddies_lounge', tier: 'aaa', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },

  { zone: 'promoters_lounge', tier: 'promoters_lounge', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },
  { zone: 'promoters_lounge', tier: 'artist', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },
  { zone: 'promoters_lounge', tier: 'aaa', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },

  { zone: 'photo_pit', tier: 'photo', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'photo_pit', tier: 'crew', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'photo_pit', tier: 'stage', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'photo_pit', tier: 'aaa', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'photo_pit', tier: 'artist', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },

  { zone: 'backstage', tier: 'aaa', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'backstage', tier: 'artist', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },
  { zone: 'backstage', tier: 'stage', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'backstage', tier: 'promoters_lounge', requiresPhotoId: true, fromLocalTime: '22:00', toLocalTime: null },

  { zone: 'main_stage', tier: 'aaa', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
  { zone: 'main_stage', tier: 'artist', requiresPhotoId: true, fromLocalTime: null, toLocalTime: null },
  { zone: 'main_stage', tier: 'stage', requiresPhotoId: false, fromLocalTime: null, toLocalTime: null },
]

export function tier(code: TierCode): Tier {
  const t = TIERS.find((x) => x.code === code)
  if (!t) throw new Error(`unknown tier ${code}`)
  return t
}

export function tierColour(code: TierCode, theme: Theme): string {
  const t = tier(code)
  return theme === 'dark' ? t.colour : t.colourLight
}

/**
 * A tier's zone strip: all six zones in sheet order, each marked held or not,
 * with the photo-ID flag and time window where the pack prints them.
 */
export function zoneStrip(code: TierCode) {
  return ZONES.map((z) => {
    const row = ZONE_ACCESS.find((a) => a.zone === z.code && a.tier === code)
    return {
      zone: z.code,
      label: z.label,
      held: Boolean(row),
      requiresPhotoId: row?.requiresPhotoId ?? false,
      fromLocalTime: row?.fromLocalTime ?? null,
      text: row ? z.label : `—— ${z.label}`,
    }
  })
}
