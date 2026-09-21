import { z } from 'zod'
import { TIER_CODES, ZONE_CODES } from '@/lib/design'

/**
 * Zod mirrors of the pack's two vocabularies (ADR-018). Built FROM lib/design.ts
 * so there is one list, not two; accreditation-contract.test.ts proves the
 * list itself matches the JSON and the database seed.
 */
export const tierCodeSchema = z.enum(TIER_CODES)
export const zoneCodeSchema = z.enum(ZONE_CODES)

const localTime = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)

export const zoneAccessRowSchema = z.object({
  zone: zoneCodeSchema,
  tier: tierCodeSchema,
  requiresPhotoId: z.boolean(),
  fromLocalTime: localTime.nullable(),
  toLocalTime: localTime.nullable(),
})
