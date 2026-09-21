/**
 * ACC-114 · The accreditation pack has three copies and they must agree cell
 * for cell (ADR-018):
 *
 *   1. design/source/accreditation/access-matrix.json   — the transcription
 *   2. lib/design.ts  ZONES / TIERS / ZONE_ACCESS        — the client mirror
 *   3. supabase/migrations/202609211010_…_pack.sql      — the database seed
 *
 * The JSON is the reference. If this fails, re-read the printed sheet; never
 * edit the JSON to make a mirror pass.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TIERS, TIER_CODES, ZONES, ZONE_ACCESS, ZONE_CODES, tierColour, zoneStrip } from '@/lib/design'
import { tierCodeSchema, zoneAccessRowSchema, zoneCodeSchema } from '@/lib/schemas/accreditation'

const root = join(__dirname, '../..')
const matrix = JSON.parse(readFileSync(join(root, 'design/source/accreditation/access-matrix.json'), 'utf8'))
const seed = readFileSync(join(root, 'supabase/migrations/202609211010_boa_acc_accreditation_pack.sql'), 'utf8')

type JAccess = { zone: string; tier: string; requires_photo_id: boolean; from_local_time: string | null; to_local_time: string | null }
const key = (zone: string, tier: string, photo: boolean, from: string | null, to: string | null) =>
  `${zone}|${tier}|${photo}|${from ?? '-'}|${to ?? '-'}`

const jsonAccess = (matrix.access as JAccess[]).map((a) => key(a.zone, a.tier, a.requires_photo_id, a.from_local_time, a.to_local_time)).sort()

/** Every ('zone', 'tier', bool, time|null, time|null) tuple in the zone_access insert. */
function seedAccess(): string[] {
  const block = /insert into public\.boa_acc_zone_access[\s\S]*?values([\s\S]*?);/.exec(seed)?.[1]
  if (!block) throw new Error('zone_access insert not found in the migration')
  return [...block.matchAll(/\('(\w+)',\s*'(\w+)',\s*(true|false),\s*(null|'[\d:]+'),\s*(null|'[\d:]+')\)/g)]
    .map((m) => key(m[1]!, m[2]!, m[3] === 'true', m[4] === 'null' ? null : m[4]!.slice(1, -1), m[5] === 'null' ? null : m[5]!.slice(1, -1)))
    .sort()
}

/** code -> { dark, light, sort, qty, artwork, requestable } from the seed's updates and insert. */
function seedTiers() {
  const out = new Map<string, { dark: string; light: string; sort: number; qty: number | null; artwork: number; requestable: boolean }>()
  for (const m of seed.matchAll(/update public\.boa_acc_type set([\s\S]*?)where code = '(\w+)';/g)) {
    const b = m[1]!
    out.set(m[2]!, {
      dark: /colour_dark = '(#\w+)'/.exec(b)![1]!,
      light: /colour_light = '(#\w+)'/.exec(b)![1]!,
      sort: Number(/sort_order = (\d+)/.exec(b)![1]),
      qty: /print_qty = (\d+)/.test(b) ? Number(/print_qty = (\d+)/.exec(b)![1]) : null,
      artwork: Number(/artwork_no = (\d+)/.exec(b)![1]),
      requestable: /requestable = true/.test(b),
    })
  }
  const ins = /insert into public\.boa_acc_type\s[\s\S]*?values([\s\S]*?\));\s*$/m.exec(seed)![1]!
  for (const m of ins.matchAll(/\('(\w+)',[^;]*?'(#\w{6})', '(#\w{6})',\s*'(?:[^']|'')*',\s*(true|false),\s*(\d+),\s*(null|\d+),\s*(\d+)\)/g)) {
    out.set(m[1]!, { dark: m[2]!, light: m[3]!, requestable: m[4] === 'true', sort: Number(m[5]), qty: m[6] === 'null' ? null : Number(m[6]), artwork: Number(m[7]) })
  }
  return out
}

describe('zones', () => {
  it('lib/design.ts matches the JSON, in sheet order', () => {
    expect(ZONES.map((z) => z.code)).toEqual(matrix.zones.map((z: { code: string }) => z.code))
    expect(ZONES.map((z) => z.label)).toEqual(matrix.zones.map((z: { label: string }) => z.label))
    expect(ZONES.map((z) => z.labelKn)).toEqual(matrix.zones.map((z: { label_kn: string }) => z.label_kn))
  })
  it('the database enum declares the same six in the same order', () => {
    const decl = /create type public\.boa_acc_zone as enum\s*\(([^)]*)\)/.exec(seed)![1]!
    expect(decl.split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual([...ZONE_CODES])
  })
})

describe('tiers', () => {
  it('lib/design.ts matches the JSON: order, labels, quantities, artwork numbers, requestable', () => {
    const j = [...matrix.tiers].sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order)
    expect(TIERS.map((t) => t.code)).toEqual(j.map((t: { code: string }) => t.code))
    expect(TIERS.map((t) => t.label)).toEqual(j.map((t: { label: string }) => t.label))
    expect(TIERS.map((t) => t.printQty)).toEqual(j.map((t: { print_qty: number | null }) => t.print_qty))
    expect(TIERS.map((t) => t.artworkNo)).toEqual(j.map((t: { artwork_no: number }) => t.artwork_no))
    expect(TIERS.map((t) => t.requestable)).toEqual(j.map((t: { requestable: boolean }) => t.requestable))
  })
  it('the migration seed matches lib/design.ts: colours, sort order, qty, artwork, requestable', () => {
    const s = seedTiers()
    expect([...s.keys()].sort()).toEqual([...TIER_CODES].sort())
    TIERS.forEach((t, i) => {
      expect(s.get(t.code), t.code).toEqual({ dark: t.colour, light: t.colourLight, sort: i + 1, qty: t.printQty, artwork: t.artworkNo, requestable: t.requestable })
    })
  })
  it('photo print quantity stays unknown (QTY TBC, discrepancy P3)', () => {
    expect(TIERS.find((t) => t.code === 'photo')!.printQty).toBeNull()
  })
  it('resolves a colour per theme', () => {
    expect(tierColour('crew', 'dark')).toBe('#A64DFF')
    expect(tierColour('crew', 'light')).toBe('#6A1FB8')
  })
})

describe('the access matrix', () => {
  it('has 26 allow rows', () => {
    expect(ZONE_ACCESS).toHaveLength(26)
    expect(jsonAccess).toHaveLength(26)
  })
  it('lib/design.ts matches the JSON cell for cell', () => {
    expect(ZONE_ACCESS.map((a) => key(a.zone, a.tier, a.requiresPhotoId, a.fromLocalTime, a.toLocalTime)).sort()).toEqual(jsonAccess)
  })
  it('the migration seed matches the JSON cell for cell', () => {
    expect(seedAccess()).toEqual(jsonAccess)
  })
  it('every row parses through the Zod mirror', () => {
    for (const a of ZONE_ACCESS) expect(zoneAccessRowSchema.safeParse(a).success).toBe(true)
  })
  it('artist needs photo ID everywhere except the Festival Area (P2: per-zone sheets win)', () => {
    for (const s of zoneStrip('artist')) expect(s.requiresPhotoId).toBe(s.zone !== 'festival_area')
  })
  it('promoters reach backstage only from 22:00', () => {
    expect(zoneStrip('promoters_lounge').find((s) => s.zone === 'backstage')).toMatchObject({ held: true, fromLocalTime: '22:00', requiresPhotoId: true })
  })
  it('an absent pair is a turn-away, rendered with the —— prefix', () => {
    const ga = zoneStrip('general_admission')
    expect(ga.filter((s) => s.held).map((s) => s.zone)).toEqual(['festival_area'])
    expect(ga[1]!.text).toBe("—— Eddie's Lounge")
  })
})

describe('Zod mirrors', () => {
  it('accept exactly the eight tiers and six zones', () => {
    expect(tierCodeSchema.options).toEqual([...TIER_CODES])
    expect(zoneCodeSchema.options).toEqual([...ZONE_CODES])
    expect(tierCodeSchema.safeParse('working_crew').success).toBe(false)
    expect(zoneCodeSchema.safeParse('site').success).toBe(false)
  })
})
