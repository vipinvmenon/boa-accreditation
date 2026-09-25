/**
 * ACC-117 / ACC-141–143 · Parse and validate the roster form's response sheet
 * (exported CSV) for public.boa_acc_import_approve.
 *
 * Pure: no database, no filesystem. scripts/import-roster.mjs does the I/O;
 * tests/unit/import-roster.test.ts proves this file. The column contract is
 * docs/ROSTER-FORM.md, "The response sheet is a contract".
 *
 * Node runs this file directly (type stripping) from the .mjs loader, so it
 * imports nothing but zod and uses only erasable TypeScript: no enums, no
 * `@/` path alias. The lists it has to agree with elsewhere — the pack's tier
 * labels (lib/design.ts) and the form's crew types / day answers
 * (scripts/roster-form/build-roster-form.gs) — are pinned by the unit test.
 *
 * What it sends is exactly what boa_acc_person holds: name, phone, role text,
 * optional plate (non-negotiable #9), the desk's column I decision and the
 * days-on-site answer.
 *
 * ADR-019 / ACC-140a: column I, "Accreditation Type", IS the approval. This
 * module only carries it; the database approves (and mints the pass) inside
 * boa_acc_import_approve, run by a lead/admin. There is no crew-type → tier
 * mapping: a blank column I is "not decided yet", never a guess.
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

/**
 * The one column the desk may add to the right of the form's columns
 * (docs/ROSTER-FORM.md, "The desk's column"): column I, Salman's per-person
 * decision. Optional: a sheet without it is still valid, and every row in it
 * is undecided. No other extra column is accepted, so non-negotiable #9's
 * "refuse unknown columns" still holds.
 */
export const DESK_HEADER = 'Accreditation type' as const

/** Column I's dropdown labels → tier codes: the pack's tier labels, pinned to
 *  lib/design.ts by the unit test. General Admission is not a choice. AAA and
 *  Artist ARE (ACC-140b): choosing them in the sheet is their approval. */
export const DESK_TIERS = {
  AAA: 'aaa',
  Artist: 'artist',
  Stage: 'stage',
  'Promoters Lounge': 'promoters_lounge',
  Crew: 'crew',
  Photo: 'photo',
  "Eddie's Lounge": 'eddies_lounge',
} as const

export const DESK_TIER_CODES = [
  'aaa',
  'artist',
  'stage',
  'promoters_lounge',
  'crew',
  'photo',
  'eddies_lounge',
] as const
export type DeskTier = (typeof DESK_TIER_CODES)[number]

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

// The database CHECKs on boa_acc_person, verbatim.
export const PHONE_E164 = /^\+91[6-9][0-9]{9}$/
export const PLATE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/

/** What the RPC receives per row. Mirrors boa_acc_import_approve's jsonb shape. */
export const importRowSchema = z
  .object({
    row_no: z.number().int().min(2),
    full_name: z.string().min(2).max(80),
    phone: z.string().regex(PHONE_E164),
    role_text: z.string().min(2).max(60),
    vehicle_reg: z.string().regex(PLATE).nullable(),
    /** Column I as a tier code; null when the cell is blank (undecided). */
    type_code: z.enum(DESK_TIER_CODES).nullable(),
    day_validity: z.enum(['build', 'show', 'build_show']),
    // Always an explicit +05:30 offset — the RPC refuses a bare timestamp.
    submitted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+05:30$/),
  })
  .strict()
export type ImportRow = z.infer<typeof importRowSchema>

export const IMPORT_OUTCOMES = [
  'inserted',
  'approved',
  'unchanged',
  'tier_changed',
  'skipped',
  'refused',
  'duplicate_phone',
  'invalid',
] as const
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number]

/** One row of boa_acc_import_approve's result, checked at the boundary. */
export const importResultSchema = z.object({
  row_no: z.number().int(),
  outcome: z.enum(IMPORT_OUTCOMES),
  person_id: z.string().uuid().nullable(),
  detail: z.string().nullable(),
})
export type ImportResult = z.infer<typeof importResultSchema>

export type ValidRow = ImportRow & {
  organisation: string
  /** The crew type as displayed: fixed choices in the form's own spelling,
   *  write-ins with case and spacing normalised (normaliseCrewType). */
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
  /** Valid rows with no column I decision: they import as submitted, for Salman. */
  undecided: number[]
  /** Write-in crew types, as normalised for display → the rows carrying them. */
  writeIns: Map<string, number[]>
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
 *
 * TWO SHEET SETTINGS FEED THIS, AND THEY DISAGREE ON PURPOSE (verified in the
 * live sheet, 25 Sep 2026; docs/ROSTER-FORM.md):
 *   - File ▸ Settings ▸ Time zone  = (GMT+05:30) India Standard Time
 *   - File ▸ Settings ▸ Locale     = United States
 * The locale decides the date FORMAT, which is why it must stay US: it is what
 * produces the `M/D/YYYY` this function parses. "Correcting" the locale to
 * India re-formats every timestamp as `D/M/YYYY`, and days 1–12 of each month
 * then parse happily as the WRONG date rather than failing. If timestamps ever
 * start refusing here, check the sheet's locale before changing this regex.
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

/**
 * ACC-143 · A crew type for DISPLAY and role text. Never affects the tier.
 *
 * Whitespace is trimmed and collapsed. A fixed choice, in any case, becomes
 * the form's own spelling. A write-in keeps its letters as typed except that
 * the first letter of each word — including one just inside a bracket — is
 * upper-cased, so "Tech Production (stage)" and "Tech Production (Stage)"
 * are one crew type. Nothing is lower-cased, so "DJ crew" → "DJ Crew", never
 * "Dj Crew".
 */
export function normaliseCrewType(raw: string): string {
  const v = raw.trim().replace(/\s+/g, ' ')
  const fixed = FORM_CREW_TYPES.find((t) => t.toLowerCase() === v.toLowerCase())
  if (fixed) return fixed
  return v.replace(/(^|[\s(/&-])(\p{Ll})/gu, (_m, before: string, ch: string) => before + ch.toUpperCase())
}

// ---------------------------------------------------------------------------
// Organisation aliases (ACC-142)
// ---------------------------------------------------------------------------

/**
 * data/org-aliases.json: a misspelling seen in the sheet's free-text
 * Organisation answers → the organisation's canonical name. Keys and values
 * are compared by orgKey, so a key needs to be written only once in any case.
 * The canonical name is then matched to boa_acc_org.name like any other
 * answer. Anything neither an org nor an alias is reported, never guessed.
 */
export const orgAliasesSchema = z
  .object({
    source: z.string(),
    aliases: z.record(z.string().trim().min(1), z.string().trim().min(2).max(120)),
  })
  .strict()
export type OrgAliasFile = z.infer<typeof orgAliasesSchema>
/** orgKey(misspelling) → canonical name. */
export type OrgAliases = Map<string, string>

/** Parse the alias file. Refuses chains (a canonical name that is itself an
 *  alias for something else) and two spellings of one key that disagree. */
export function parseOrgAliases(json: unknown): OrgAliases {
  const file = orgAliasesSchema.parse(json)
  const out: OrgAliases = new Map()
  for (const [from, to] of Object.entries(file.aliases)) {
    const k = orgKey(from)
    const prior = out.get(k)
    if (prior !== undefined && orgKey(prior) !== orgKey(to)) {
      throw new Error(`org alias "${from}" maps to both "${prior}" and "${to}"`)
    }
    out.set(k, to.trim())
  }
  for (const to of out.values()) {
    const again = out.get(orgKey(to))
    if (again !== undefined && orgKey(again) !== orgKey(to)) {
      throw new Error(`org alias chain: "${to}" is itself an alias for "${again}"`)
    }
  }
  return out
}

/** An Organisation answer through the alias map. Unknown names pass through unchanged. */
export function resolveOrganisation(name: string, aliases: OrgAliases): { name: string; aliased: boolean } {
  const to = aliases.get(orgKey(name))
  if (to === undefined || to === name.trim()) return { name: name.trim(), aliased: false }
  return { name: to, aliased: true }
}

// ---------------------------------------------------------------------------
// The whole file
// ---------------------------------------------------------------------------

export function validateRoster(csv: string): Validation {
  const out: Validation = { rows: [], errors: [], warnings: [], undecided: [], writeIns: new Map(), fatal: null }

  let table: string[][]
  try {
    table = parseCsv(csv)
  } catch (e) {
    out.fatal = `Invalid CSV: ${e instanceof Error ? e.message : 'parse error'}`
    return out
  }

  const header = table.shift()
  const formPart = header?.slice(0, ROSTER_HEADER.length) ?? []
  const extra = header?.slice(ROSTER_HEADER.length) ?? []
  // The desk column is typed by a person, not generated by Google, so its
  // header is matched ignoring case and surrounding space ("Accreditation Type"
  // was the first one typed). The form's own headers stay exact.
  const hasDesk = extra.length === 1 && extra[0]!.trim().toLowerCase() === DESK_HEADER.toLowerCase()
  if (
    !header ||
    formPart.length !== ROSTER_HEADER.length ||
    formPart.some((h, i) => h.trim() !== ROSTER_HEADER[i]) ||
    (extra.length > 0 && !hasDesk)
  ) {
    out.fatal =
      `Invalid header. Expected exactly: ${ROSTER_HEADER.join(', ')}` +
      ` — optionally followed by the desk's "${DESK_HEADER}" column, and nothing else`
    return out
  }
  const width = ROSTER_HEADER.length + (hasDesk ? 1 : 0)
  if (table.length === 0) {
    out.fatal = 'The response sheet has no data rows.'
    return out
  }
  if (!hasDesk) {
    out.warnings.push(`No "${DESK_HEADER}" column: every row imports as submitted, none is approved.`)
  }

  const seen = new Map<string, number>() // phone -> first row_no
  const deskTiers = DESK_TIERS as Record<string, DeskTier>

  table.forEach((cells, index) => {
    const row_no = index + 2 // the sheet's own row number
    const errors: string[] = []
    const organisation = (cells[1] ?? '').trim()

    if (cells.length !== width) {
      out.errors.push({
        row_no,
        organisation,
        errors: [`expected ${width} columns, received ${cells.length}`],
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

    const crewType = normaliseCrewType(crewRaw)
    if (crewType.length === 0) errors.push('Crew type is empty')

    // Role text: the job title when given, otherwise the (normalised) crew
    // type. The database holds 2–60 characters; refuse outside that, never
    // truncate.
    const job = jobRaw.trim().replace(/\s+/g, ' ')
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

    // Column I, the desk's decision. Blank means "not decided yet" — never a
    // default tier. Anything not exactly one of the labels refuses the row
    // (a curly apostrophe in Eddie’s Lounge included).
    const deskRaw = hasDesk ? (cells[ROSTER_HEADER.length] ?? '').trim() : ''
    const type_code = deskRaw === '' ? null : (deskTiers[deskRaw] ?? null)
    if (deskRaw !== '' && type_code === null) {
      errors.push(`${DESK_HEADER} "${deskRaw}" is not one of the desk's choices`)
    }

    if (errors.length > 0 || !submitted_at || !phone || !days || !plate.ok) {
      out.errors.push({ row_no, organisation, errors })
      return
    }

    const candidate = {
      row_no,
      full_name,
      phone,
      role_text,
      vehicle_reg: plate.value,
      type_code,
      day_validity: days,
      submitted_at,
    }
    const checked = importRowSchema.safeParse(candidate)
    if (!checked.success) {
      out.errors.push({ row_no, organisation, errors: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
      return
    }

    const first = seen.get(phone)
    if (first !== undefined) {
      out.warnings.push(`row ${row_no}: same phone as row ${first}; the database will refuse one of them as duplicate_phone`)
    } else {
      seen.set(phone, row_no)
    }

    const writeIn = !(FORM_CREW_TYPES as readonly string[]).includes(crewType)
    if (writeIn) {
      const list = out.writeIns.get(crewType) ?? []
      list.push(row_no)
      out.writeIns.set(crewType, list)
    }
    if (type_code === null) out.undecided.push(row_no)
    out.rows.push({ ...checked.data, organisation, crewType, writeIn })
  })

  if (out.undecided.length > 0 && hasDesk) {
    out.warnings.push(
      `${out.undecided.length} row(s) have no ${DESK_HEADER}: they import as submitted, for Salman to decide ` +
        `(rows ${out.undecided.join(', ')}).`,
    )
  }
  if (out.writeIns.size > 0) {
    const list = [...out.writeIns].sort(([a], [b]) => a.localeCompare(b)).map(([t, rows]) => `${t} (rows ${rows.join(', ')})`)
    out.warnings.push(`Write-in crew types, for display only — they never set a tier: ${list.join('; ')}`)
  }
  return out
}

export type OrgRef = { id: string; name: string }

/**
 * Group valid rows by organisation: the answer, through the alias map, matched
 * to boa_acc_org by orgKey. Unmatched answers are reported with their rows.
 */
export function matchOrganisations(rows: ValidRow[], orgs: OrgRef[], aliases: OrgAliases = new Map()) {
  const byKey = new Map(orgs.map((o) => [orgKey(o.name), o]))
  const groups = new Map<string, { org: OrgRef; rows: ValidRow[] }>()
  const unmatched = new Map<string, number[]>()
  const aliased: { row_no: number; from: string; to: string }[] = []
  for (const r of rows) {
    const resolved = resolveOrganisation(r.organisation, aliases)
    const org = byKey.get(orgKey(resolved.name))
    if (!org) {
      const list = unmatched.get(r.organisation) ?? []
      list.push(r.row_no)
      unmatched.set(r.organisation, list)
      continue
    }
    if (resolved.aliased) aliased.push({ row_no: r.row_no, from: r.organisation, to: org.name })
    const g = groups.get(org.id) ?? { org, rows: [] }
    g.rows.push(r)
    groups.set(org.id, g)
  }
  return { groups: [...groups.values()], unmatched, aliased }
}

const sqlLiteral = (s: string) => `'${s.replace(/'/g, "''")}'`

/**
 * The one statement the loader sends per organisation: set the operator's
 * JWT claims for this transaction, then call the RPC as that session (the
 * same technique scripts/load-orgs.mjs uses). The database checks the
 * operator is an active lead/admin. Exported so a rolled-back database check
 * can run exactly this text.
 */
export function importApproveSql(operatorUserId: string, orgId: string, payload: ImportRow[]): string {
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
  from jwt, lateral public.boa_acc_import_approve(${sqlLiteral(orgId)}::uuid, ${sqlLiteral(JSON.stringify(payload))}::jsonb) r
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
      type_code: r.type_code,
      day_validity: r.day_validity,
      submitted_at: r.submitted_at,
    }),
  )
}
