import { TIERS, zoneStrip, type Tier, type TierCode } from '@/lib/design'

/**
 * Desk-side views over the pack's tiers (ADR-018). Nothing here restates the
 * pack: every list is a filter of lib/design.ts's TIERS, which
 * tests/unit/accreditation-contract.test.ts proves against the JSON and the
 * boa_acc_type seed.
 */

/**
 * Tiers an operator may assign to one person. General Admission is 3,000
 * ticket-holder bands issued by ticketing; it is in the matrix so the zone
 * sheets are complete, and it is never accredited here (ADR-018).
 */
export const DECIDABLE_TIERS: ReadonlyArray<Tier> = TIERS.filter((t) => t.code !== 'general_admission')

/** Tiers a vendor may request, and so the only ones an org-level approve offers. */
export type RequestableTierCode = Extract<Tier, { requestable: true }>['code']
export const REQUESTABLE_TIERS: ReadonlyArray<Tier> = TIERS.filter((t) => t.requestable)
export const REQUESTABLE_TIER_CODES = REQUESTABLE_TIERS.map((t) => t.code) as unknown as readonly [
  RequestableTierCode,
  ...RequestableTierCode[],
]

export function isRequestable(code: TierCode): code is RequestableTierCode {
  return REQUESTABLE_TIERS.some((t) => t.code === code)
}

/**
 * One chip per zone, all six in sheet order, for the v2 `.zones` strip. An
 * unheld zone keeps its plain label and is struck through by the `.off` class,
 * exactly as boa_design_v2.html's zoneChips() draws it. A held zone carries the
 * pack's own qualifiers: `+ ID` where the sheet prints "+ photo ID", and the
 * wall-clock window where it prints one (Promoters Lounge → Backstage, 22:00).
 */
export function zoneChips(code: TierCode) {
  return zoneStrip(code).map((z) => ({
    zone: z.zone,
    held: z.held,
    text: z.held
      ? `${z.label}${z.requiresPhotoId ? ' + ID' : ''}${z.fromLocalTime ? ` after ${z.fromLocalTime}` : ''}`
      : z.label,
  }))
}
