/**
 * ACC-117 · Parse and validate the roster form's response sheet (exported CSV).
 *
 * Pure: no database, no filesystem. scripts/import-roster.mjs does the I/O and
 * calls public.boa_acc_import_roster; tests/unit/import-roster.test.ts proves
 * this file. The column contract is docs/ROSTER-FORM.md, "The response sheet
 * is a contract".
 *
 * Node runs this file directly (type stripping) from the .mjs loader, so it
 * imports nothing but zod and uses only erasable TypeScript: no enums, no
 * `@/` path alias. The two lists it has to agree with elsewhere —
 * REQUESTABLE_TIERS (lib/design.ts) and the form's crew types / day answers
 * (scripts/roster-form/build-roster-form.gs) — are pinned by the unit test.
 *
 * What it collects is exactly what boa_acc_person holds: name, phone, role
 * text, optional plate (non-negotiable #9), plus two ADVISORY hints — a
 * requested tier from the crew-type mapping and the days-on-site answer.
 */
import { z } from 'zod'

/** The response sheet's header row, exactly, in order. */
export const ROSTER_HEADER = [
  'Timestamp',
  'Organisation',
  'Full name',
  'WhatsApp number',
  'Crew type',
  'Job title',
  'Days on site',
  'Loading vehicle registration',
] as const

/** The form's fixed crew-type choices. Anything else is an "Other" write-in. */
export const FORM_CREW_TYPES = [
  'Security',
  'Bouncer',
  'Bar Crew',
  'Merch Crew',
  'Artist Hospitality',
  'Food Stalls',
  'Cashless',
  'Sound & Lights',
  'Generator',
  'Ground Production',
  'Sponsor',
  'Special Tickets Crew',
  'BOA Internal Crew',
] as const

/** The form's "Days on site" answers → boa_acc_day_validity. One-to-one. */
export const DAYS_ANSWERS = {
  'Build days only (5–9 Oct)': 'build',
  'Show day only (10 Oct)': 'show',
  'Both build and show': 'build_show',
} as const

export type DayValidity = (typeof DAYS_ANSWERS)[keyof typeof DAYS_ANSWERS]

/** Tiers a vendor may request (ADR-018). AAA and Artist are named lists; GA is ticketing. */
export const REQUESTABLE_TIERS = ['stage', 'promoters_lounge', 'crew', 'photo', 'eddies_lounge'] as const
export type RequestableTier = (typeof REQUESTABLE_TIERS)[number]

// The database CHECKs on boa_acc_person, verbatim.
export const PHONE_E164 = /^\+91[6-9][0-9]{9}$/
export const PLATE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/

/**
 * The crew type → tier mapping file. EMPTY by default: the mapping is
 * Salman's call (docs/ROSTER-FORM.md, "Open"), and until he gives it no row
 * carries a tier hint. Keys are matched case-insensitively.
 */
export const crewTypeMappingSchema = z
  .object({
    source: z.string().optional(),
    mapping: z.record(z.string().trim().min(1), z.enum(REQUESTABLE_TIERS)),
  })
  .strict()
export type CrewTypeMapping = z.infer<typeof crewTypeMappingSchema>

/** What the RPC receives per row. Mirrors boa_acc_import_roster's jsonb shape. */
export const importRowSchema = z
  .object({
    row_no: z.number().int().min(2),
    full_name: z.string().min(2).max(80),
    phone: z.string().regex(PHONE_E164),
    role_text: z.string().min(2).max(60),
    vehicle_reg: z.string().regex(PLATE).nullable(),
    requested_type_code: z.enum(REQUESTABLE_TIERS).nullable(),
    requested_day_validity: z.enum(['build', 'show', 'build_show']),
    // Always an explicit +05:30 offset — the RPC refuses a bare timestamp.
    submitted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/),
  })
  .strict()
export type ImportRow = z.infer<typeof importRowSchema>

/** One row of boa_acc_import_roster's result, checked at the boundary. */
export const importResultSchema = z.object({
  row_no: z.number().int(),
  outcome: z.enum(['inserted', 'duplicate_phone', 'quota_exceeded', 'invalid']),
  person_id: z.string().uuid().nullable(),
  detail: z.string().nullable(),
})
export type ImportResult = z.infer<typeof importResultSchema>

export type ValidRow = ImportRow & {
  organisation: string
  crewType: string
  /** true when the crew type is not one of the form's fixed choices. */
  writeIn: boolean
}

export type RowError = { row_no: number; organisation: string; errors: string[] }

export type Validation = {
  rows: ValidRow[]
  errors: RowError[]
  /** Not refusals: facts the desk should see before loading. */
  warnings: string[]
  /** A header problem stops everything; nothing else is reported. */
  fatal: string | null
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180-ish: quoted fields, doubled quotes, CRLF or LF. Blank lines dropped. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const text = input.replace(/^﻿/, '')

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    const next = text[i + 1]
    if (quoted) {
      if (c === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (c === '"') {
        quoted = false
      } else {
        field += c
      }
    } else if (c === '"') {
      if (field.length !== 0) throw new Error('a quote may only start a CSV field')
      quoted = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && next === '\n') i += 1
      row.push(field)
      if (row.some((v) => v !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += c
    }
  }
  if (quoted) throw new Error('unterminated quoted CSV field')
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((v) => v !== '')) rows.push(row)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Field rules
// ---------------------------------------------------------------------------

/**
 * The sheet's timestamp: US locale `M/D/YYYY H:MM:SS`, no zone. The sheet's
 * zone is the spreadsheet's setting, not in the cell; we treat it as
 * Asia/Kolkata (the desk's zone, and the zone the form was built in) and emit
 * an explicit +05:30 so the database never has to guess.
 */
export function parseFormTimestamp(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const [, mo, d, y, h, mi, s] = m.map(Number) as [number, number, number, number, number, number, number]
  if (h > 23 || mi > 59 || s > 59) return null
  const probe = new Date(Date.UTC(y, mo - 1, d))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}+05:30`
}

/**
 * The form asks 10 digits starting 6–9, no +91. Read as a STRING: the sheet
 * stores it as a number, so never let a spreadsheet tool round-trip it first.
 * Spaces and dashes are tolerated; anything else is refused, not repaired.
 */
export function normalisePhone(raw: string): string | null {
  const digits = raw.trim().replace(/[\s-]/g, '')
  if (/^[6-9][0-9]{9}$/.test(digits)) return `+91${digits}`
  if (PHONE_E164.test(digits)) return digits
  return null
}

/** Upper case, spaces removed, then the database CHECK. Empty is "no vehicle". */
export function normalisePlate(raw: string): { ok: true; value: string | null } | { ok: false } {
  const v = raw.trim().replace(/\s+/g, '').toUpperCase()
  if (v === '') return { ok: true, value: null }
  return PLATE.test(v) ? { ok: true, value: v } : { ok: false }
}

/** Organisation names compare trimmed, whitespace-collapsed, case-insensitive. */
export function orgKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-IN')
}

// ---------------------------------------------------------------------------
// The whole file
// ---------------------------------------------------------------------------

export function validateRoster(csv: string, mapping: CrewTypeMapping = { mapping: {} }): Validation {
  const out: Validation = { rows: [], errors: [], warnings: [], fatal: null }

  let table: string[][]
  try {
    table = parseCsv(csv)
  } catch (e) {
    out.fatal = `Invalid CSV: ${e instanceof Error ? e.message : 'parse error'}`
    return out
  }

  const header = table.shift()
  if (
    !header ||
    header.length !== ROSTER_HEADER.length ||
    header.some((h, i) => h.trim() !== ROSTER_HEADER[i])
  ) {
    out.fatal = `Invalid header. Expected exactly: ${ROSTER_HEADER.join(', ')}`
    return out
  }
  if (table.length === 0) {
    out.fatal = 'The response sheet has no data rows.'
    return out
  }

  const tierFor = new Map(Object.entries(mapping.mapping).map(([k, v]) => [k.trim().toLowerCase(), v]))
  const fixed = new Set(FORM_CREW_TYPES.map((t) => t.toLowerCase()))
  const seen = new Map<string, number>() // orgKey|phone -> first row_no
  const unmapped = new Set<string>()

  table.forEach((cells, index) => {
    const row_no = index + 2 // the sheet's own row number
    const errors: string[] = []
    const organisation = (cells[1] ?? '').trim()

    if (cells.length !== ROSTER_HEADER.length) {
      out.errors.push({
        row_no,
        organisation,
        errors: [`expected ${ROSTER_HEADER.length} columns, received ${cells.length}`],
      })
      return
    }
    const [ts, , nameRaw, phoneRaw, crewRaw, jobRaw, daysRaw, plateRaw] = cells as [
      string, string, string, string, string, string, string, string,
    ]

    const submitted_at = parseFormTimestamp(ts)
    if (!submitted_at) errors.push(`Timestamp "${ts}" is not M/D/YYYY H:MM:SS`)

    if (organisation.length === 0) errors.push('Organisation is empty')

    const full_name = nameRaw.trim()
    if (full_name.length < 2 || full_name.length > 80) errors.push('Full name must be 2–80 characters')

    const phone = normalisePhone(phoneRaw)
    if (!phone) errors.push('WhatsApp number must be 10 digits starting 6–9')

    const crewType = crewRaw.trim()
    if (crewType.length === 0) errors.push('Crew type is empty')

    // Role text: the job title when given, otherwise the crew type. The
    // database holds 2–60 characters; refuse outside that, never truncate.
    const job = jobRaw.trim()
    const role_text = job.length > 0 ? job : crewType
    if (role_text.length < 2 || role_text.length > 60) {
      errors.push(
        job.length > 0
          ? `Job title must be 2–60 characters (has ${job.length})`
          : `Crew type is used as the role and must be 2–60 characters (has ${crewType.length})`,
      )
    }

    const days = (DAYS_ANSWERS as Record<string, DayValidity>)[daysRaw.trim()]
    if (!days) errors.push(`Days on site "${daysRaw.trim()}" is not one of the form's answers`)

    const plate = normalisePlate(plateRaw)
    if (!plate.ok) errors.push(`Loading vehicle registration "${plateRaw.trim()}" is not an Indian registration`)

    if (errors.length > 0 || !submitted_at || !phone || !days || !plate.ok) {
      out.errors.push({ row_no, organisation, errors })
      return
    }

    const writeIn = !fixed.has(crewType.toLowerCase())
    const requested_type_code = tierFor.get(crewType.toLowerCase()) ?? null
    if (crewType && requested_type_code === null) unmapped.add(crewType)

    const dupKey = `${orgKey(organisation)}|${phone}`
    const first = seen.get(dupKey)
    if (first !== undefined) {
      out.warnings.push(`row ${row_no}: same organisation and phone as row ${first}; the database will refuse it as duplicate_phone`)
    } else {
      seen.set(dupKey, row_no)
    }

    const candidate = {
      row_no,
      full_name,
      phone,
      role_text,
      vehicle_reg: plate.value,
      requested_type_code,
      requested_day_validity: days,
      submitted_at,
    }
    const checked = importRowSchema.safeParse(candidate)
    if (!checked.success) {
      out.errors.push({ row_no, organisation, errors: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
      return
    }
    out.rows.push({ ...checked.data, organisation, crewType, writeIn })
  })

  if (unmapped.size > 0) {
    out.warnings.push(
      `${unmapped.size} crew type(s) have no tier mapping, so those rows carry no tier hint: ${[...unmapped].sort().join(', ')}`,
    )
  }
  return out
}

export type OrgRef = { id: string; name: string }

/** Group valid rows by organisation, matched to boa_acc_org by name. */
export function matchOrganisations(rows: ValidRow[], orgs: OrgRef[]) {
  const byKey = new Map(orgs.map((o) => [orgKey(o.name), o]))
  const groups = new Map<string, { org: OrgRef; rows: ValidRow[] }>()
  const unmatched = new Map<string, number[]>()
  for (const r of rows) {
    const org = byKey.get(orgKey(r.organisation))
    if (!org) {
      const list = unmatched.get(r.organisation) ?? []
      list.push(r.row_no)
      unmatched.set(r.organisation, list)
      continue
    }
    const g = groups.get(org.id) ?? { org, rows: [] }
    g.rows.push(r)
    groups.set(org.id, g)
  }
  return { groups: [...groups.values()], unmatched }
}

const sqlLiteral = (s: string) => `'${s.replace(/'/g, "''")}'`

/**
 * The one statement the loader sends per organisation: set the operator's
 * JWT claims for this transaction, then call the RPC as that session (the
 * same technique scripts/load-orgs.mjs uses). Exported so the rolled-back
 * database check can run exactly this text.
 */
export function importRosterSql(operatorUserId: string, orgId: string, payload: ImportRow[]): string {
  z.string().uuid().parse(operatorUserId)
  z.string().uuid().parse(orgId)
  return `with jwt as materialized (
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', ${sqlLiteral(operatorUserId)}, 'role', 'authenticated')::text,
    true
  ) as claims
)
select r.row_no, r.outcome, r.person_id, r.detail
  from jwt, lateral public.boa_acc_import_roster(${sqlLiteral(orgId)}::uuid, ${sqlLiteral(JSON.stringify(payload))}::jsonb) r
 order by r.row_no`
}

/** The jsonb payload for one org's call: exactly the RPC's fields, nothing else. */
export function toRpcPayload(rows: ValidRow[]): ImportRow[] {
  return rows.map((r) =>
    importRowSchema.parse({
      row_no: r.row_no,
      full_name: r.full_name,
      phone: r.phone,
      role_text: r.role_text,
      vehicle_reg: r.vehicle_reg,
      requested_type_code: r.requested_type_code,
      requested_day_validity: r.requested_day_validity,
      submitted_at: r.submitted_at,
    }),
  )
}
