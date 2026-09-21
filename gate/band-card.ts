/**
 * ACC-115 — what the gate card says about a band, derived from the cached
 * roster row's tier code and the pack mirrors in lib/design.ts (ADR-018).
 *
 * Pure: no Dexie, no network. The gate screens pass it a row they already read
 * from the local cache (non-negotiable #7), so this adds no read path.
 */
import { tier, zoneStrip, type TierCode } from '@/lib/design'

export type GateZoneChip = {
  zone: string
  held: boolean
  /** Chip text: the zone label, '—— ' prefixed when unheld, with the pack's conditions appended. */
  text: string
}

export type GateBandCard = {
  label: string
  /** The band colour as the volunteer says it, lower-cased: "royal blue". */
  band: string
  handOver: string
  zones: GateZoneChip[]
}

/** The conditions the pack prints on a held zone: "+ ID", "after 22:00". */
function conditions(requiresPhotoId: boolean, fromLocalTime: string | null): string[] {
  const out: string[] = []
  if (requiresPhotoId) out.push('+ ID')
  if (fromLocalTime) out.push(`after ${fromLocalTime}`)
  return out
}

export function gateBandCard(code: TierCode): GateBandCard {
  const t = tier(code)
  const band = t.band.toLowerCase()
  return {
    label: t.label,
    band,
    handOver: `Hand over a ${band} band`,
    zones: zoneStrip(code).map((z) => ({
      zone: z.zone,
      held: z.held,
      text: z.held ? [z.text, ...conditions(z.requiresPhotoId, z.fromLocalTime)].join(' · ') : z.text,
    })),
  }
}

