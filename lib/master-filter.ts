import { z } from 'zod'
import { ORG_TYPE_CODES } from './schemas/org'
import { tier, type TierCode } from './design'
import type { MasterRow } from './schemas/master'

/**
 * The Master list's filters, as r8-master.html draws them (its FIELDS table).
 *
 * One definition, two readers: the screen filters the whole roster in the
 * browser (so the Add-filter counts and the preset counts are always the whole
 * population's), and /api/desk/master applies the same predicate to build the
 * CSV, so the download is exactly what the screen shows.
 */

export const MASTER_FILTER_KEYS = ['org', 'tier', 'status', 'bms', 'vehicle', 'day', 'role'] as const
export type MasterFilterKey = (typeof MASTER_FILTER_KEYS)[number]

export const MASTER_STATUSES = ['collected', 'not_collected', 'voided', 'rejected'] as const
export const MASTER_BMS = ['in', 'out'] as const
// ADR-031: no sticker states; a vehicle clears on its plate and the sticker
// the officer sees, so "sticker issued / pending" is not a list to work.
export const MASTER_VEHICLES = ['yes', 'no'] as const
export const MASTER_DAYS = ['build', 'show', 'build_show'] as const

export const masterFiltersSchema = z.object({
  org: z.array(z.string().trim().min(1).max(64)).max(50).default([]),
  tier: z.array(z.enum(ORG_TYPE_CODES)).max(8).default([]),
  status: z.array(z.enum(MASTER_STATUSES)).max(4).default([]),
  bms: z.array(z.enum(MASTER_BMS)).max(2).default([]),
  vehicle: z.array(z.enum(MASTER_VEHICLES)).max(2).default([]),
  day: z.array(z.enum(MASTER_DAYS)).max(3).default([]),
  role: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
})
export type MasterFilters = z.infer<typeof masterFiltersSchema>

export const EMPTY_MASTER_FILTERS: MasterFilters = masterFiltersSchema.parse({})

const ALLOWED: Partial<Record<MasterFilterKey, readonly string[]>> = {
  tier: ORG_TYPE_CODES,
  status: MASTER_STATUSES,
  bms: MASTER_BMS,
  vehicle: MASTER_VEHICLES,
  day: MASTER_DAYS,
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

/**
 * Read filters from a URL. Unknown values are dropped rather than rejected: a
 * stale bookmark should still open the list. `?in_bms=true|false` is the older
 * spelling the badge in the desk chrome links to, so it still means `bms`.
 * Role names may contain commas, so `role` is only ever read as repeated
 * params; every other key also accepts `a,b`.
 */
export function parseMasterFilters(params: { getAll: (name: string) => string[] }): MasterFilters {
  const raw: Record<string, string[]> = {}
  for (const key of MASTER_FILTER_KEYS) {
    const values = params.getAll(key).flatMap((value) => (key === 'role' ? [value] : value.split(',')))
    const allowed = ALLOWED[key]
    raw[key] = unique(values.map((value) => value.trim()).filter((value) => value && (!allowed || allowed.includes(value))))
  }
  const legacy = params.getAll('in_bms')[0]
  if (legacy === 'true' || legacy === 'false') {
    raw['bms'] = unique([...(raw['bms'] ?? []), legacy === 'true' ? 'in' : 'out'])
  }
  const parsed = masterFiltersSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_MASTER_FILTERS
}

/** The inverse of parseMasterFilters, for the address bar and the CSV link. */
export function masterFiltersToParams(filters: MasterFilters, into = new URLSearchParams()): URLSearchParams {
  for (const key of MASTER_FILTER_KEYS) {
    const values = filters[key] as string[]
    if (key === 'bms' && values.length === 1) {
      into.set('in_bms', values[0] === 'in' ? 'true' : 'false')
    } else if (key === 'bms') {
      if (values.length) into.set('bms', values.join(','))
    } else {
      for (const value of values) into.append(key, value)
    }
  }
  return into
}

export function hasMasterFilters(filters: MasterFilters): boolean {
  return MASTER_FILTER_KEYS.some((key) => filters[key].length > 0)
}

export function masterStatusOf(row: MasterRow): (typeof MASTER_STATUSES)[number] | 'other' {
  if (row.status === 'voided') return 'voided'
  if (row.status === 'rejected') return 'rejected'
  if (row.status !== 'approved') return 'other'
  return row.bandSerial ? 'collected' : 'not_collected'
}

function vehicleStates(row: MasterRow): string[] {
  return !row.vehicleReg ? ['no'] : ['yes']
}

const TESTS: { [K in MasterFilterKey]: (row: MasterRow, values: MasterFilters[K]) => boolean } = {
  org: (row, values) => values.includes(row.orgId),
  tier: (row, values) => row.typeCode !== null && values.includes(row.typeCode),
  status: (row, values) => (values as string[]).includes(masterStatusOf(row)),
  bms: (row, values) => row.status === 'approved' && values.includes(row.inBms ? 'in' : 'out'),
  vehicle: (row, values) => values.some((value) => vehicleStates(row).includes(value)),
  day: (row, values) => row.dayValidity !== null && values.includes(row.dayValidity),
  role: (row, values) => values.includes(row.role),
}

export function matchesMasterFilter<K extends MasterFilterKey>(row: MasterRow, key: K, values: MasterFilters[K]): boolean {
  return values.length === 0 || (TESTS[key] as (row: MasterRow, values: MasterFilters[K]) => boolean)(row, values)
}

export function matchesMasterFilters(row: MasterRow, filters: MasterFilters): boolean {
  return MASTER_FILTER_KEYS.every((key) => matchesMasterFilter(row, key, filters[key]))
}

export function matchesMasterSearch(row: MasterRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return true
  return [row.fullName, row.phone, row.orgName, row.vehicleReg ?? '', row.bandSerial ?? '', row.passRef ?? '', row.role]
    .some((value) => value.toLocaleLowerCase().includes(needle))
}

// ── What the Add-filter menu offers ────────────────────────────────────────

export const MASTER_FIELD_LABELS: Record<MasterFilterKey, string> = {
  org: 'Organisation',
  tier: 'Tier',
  status: 'Status',
  bms: 'BMS',
  vehicle: 'Vehicle',
  day: 'Days valid',
  role: 'Role',
}

export const MASTER_DAY_LABELS: Record<(typeof MASTER_DAYS)[number], string> = {
  build: 'Build',
  show: 'Show',
  build_show: 'Build + show',
}

const STATUS_LABELS: Record<(typeof MASTER_STATUSES)[number], string> = {
  collected: 'Collected',
  not_collected: 'Not collected',
  voided: 'Voided',
  rejected: 'Rejected',
}
const BMS_LABELS: Record<(typeof MASTER_BMS)[number], string> = { in: 'Entered in BMS', out: 'Not in BMS' }
const VEHICLE_LABELS: Record<(typeof MASTER_VEHICLES)[number], string> = {
  yes: 'Has a vehicle',
  no: 'No vehicle',
}

export type MasterFilterOption = { value: string; label: string; count: number; tierCode?: TierCode }

export function masterFilterOptions(rows: MasterRow[], key: MasterFilterKey): MasterFilterOption[] {
  const count = (test: (row: MasterRow) => boolean) => rows.filter(test).length
  switch (key) {
    case 'org': {
      const names = new Map<string, string>()
      for (const row of rows) names.set(row.orgId, row.orgName)
      return [...names]
        .map(([value, label]) => ({ value, label, count: count((row) => row.orgId === value) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    }
    case 'tier':
      return ORG_TYPE_CODES
        .map((code) => ({ value: code, label: tier(code).label, count: count((row) => row.typeCode === code), tierCode: code }))
        .filter((option) => option.count > 0)
    case 'status':
      return MASTER_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], count: count((row) => masterStatusOf(row) === value) }))
    case 'bms':
      return MASTER_BMS.map((value) => ({ value, label: BMS_LABELS[value], count: count((row) => matchesMasterFilter(row, 'bms', [value])) }))
    case 'vehicle':
      return MASTER_VEHICLES.map((value) => ({ value, label: VEHICLE_LABELS[value], count: count((row) => vehicleStates(row).includes(value)) }))
    case 'day':
      return MASTER_DAYS.map((value) => ({ value, label: MASTER_DAY_LABELS[value], count: count((row) => row.dayValidity === value) }))
    case 'role': {
      const counts = new Map<string, number>()
      for (const row of rows) counts.set(row.role, (counts.get(row.role) ?? 0) + 1)
      return [...counts]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 12)
        .map(([value, n]) => ({ value, label: value, count: n }))
    }
  }
}

export function masterFilterValueLabel(rows: MasterRow[], key: MasterFilterKey, value: string): string {
  const known = masterFilterOptions(rows, key).find((option) => option.value === value)
  if (known) return known.label
  // A role outside the top twelve, or a value no row carries: name it plainly.
  if (key === 'tier') return tier(value as TierCode).label
  if (key === 'org') return rows.find((row) => row.orgId === value)?.orgName ?? 'Organisation'
  return value
}

/** r8-master.html PRESETS, in its order. */
export const MASTER_PRESETS: ReadonlyArray<{ label: string; filters: Partial<MasterFilters> }> = [
  { label: 'Not in BMS', filters: { bms: ['out'] } },
  { label: 'Not collected', filters: { status: ['not_collected'] } },
  { label: 'Has a vehicle', filters: { vehicle: ['yes'] } },
  { label: 'Voided', filters: { status: ['voided'] } },
]

export function presetFilters(preset: Partial<MasterFilters>): MasterFilters {
  return masterFiltersSchema.parse({ ...EMPTY_MASTER_FILTERS, ...preset })
}
