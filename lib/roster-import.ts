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

/**
 * ACC-197: two more optional desk columns, J and K, only ever after column I
 * (the sheet is either A–I or A–K). J `T-Shirt` is `Yes` or blank; K
 * `T-Shirt Size` is one of TSHIRT_SIZES. The gate shows the shirt to the
 * person scanning the crew member; the holder's pass never does.
 */
export const TSHIRT_HEADER = 'T-Shirt' as const
export const TSHIRT_SIZE_HEADER = 'T-Shirt Size' as const
export const TSHIRT_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '3XL'] as const
export type TshirtSize = (typeof TSHIRT_SIZES)[number]

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
  'Family & Friends',
  'Media / Photo',
  'Guest (Salman)',
  'Guest (Saurabh)',
] as const

/** Another spelling of a fixed choice → the script's spelling. Lower-case keys.
 *  "Family and Friends" is the live form's, typed in the form editor on 2 Oct
 *  when the choice was re-added by hand; rows from before say "Family & Friends". */
const CREW_TYPE_ALIASES: Record<string, (typeof FORM_CREW_TYPES)[number]> = {
  'family and friends': 'Family & Friends',
}

/** The form's "Days on site" answers → boa_acc_day_validity. One-to-one. */
export const DAYS_ANSWERS = {
  'Build days only (5–9 Oct)': 'build',
  'Show day only (10 Oct)': 'show',
  'Both build and show': 'build_show',
} as const

export type DayValidity = (typeof DAYS_ANSWERS)[keyof typeof DAYS_ANSWERS]

// The database CHECK on boa_acc_person, verbatim (ACC-195): E.164 from any
// country, and a +91 number must still be an Indian mobile.
export const PHONE_E164 = /^\+(?:91[6-9][0-9]{9}|(?!91)[1-9][0-9]{7,14})$/
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
    /** Columns J+K: null = no crew T-shirt. */
    tshirt_size: z.enum(TSHIRT_SIZES).nullable(),
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
  /**
   * Rows whose phone already appeared in an earlier valid row of the sheet. The
   * earliest submission is kept; these are left out of `rows`, whichever
   * organisation they name, so the same person cannot reach two rosters.
   */
  duplicates: { row_no: number; organisation: string; duplicate_of: number }[]
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
 * Read as a STRING: the sheet stores it as a number, so never let a spreadsheet
 * tool round-trip it first. Spaces, dashes, dots and brackets are tolerated.
 *
 *  - 10 digits starting 6–9 → an Indian mobile (+91).
 *  - "+…" or "00…" → international, as typed.
 *  - 11–15 bare digits → a country code is already in front ("971501234567").
 *  - any other 10 digits are ambiguous (a US number typed without +1 looks like
 *    a wrong Indian one), so they are refused, not guessed.
 */
export function normalisePhone(raw: string): string | null {
  const t = raw.trim().replace(/[\s\-().]/g, '')
  if (/^[6-9][0-9]{9}$/.test(t)) return `+91${t}`
  if (PHONE_E164.test(t)) return t
  if (/^00[1-9][0-9]{7,14}$/.test(t)) {
    const c = `+${t.slice(2)}`
    return PHONE_E164.test(c) ? c : null
  }
  if (/^[1-9][0-9]{10,14}$/.test(t)) {
    const c = `+${t}`
    return PHONE_E164.test(c) ? c : null
  }
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
  const aliased = CREW_TYPE_ALIASES[v.toLowerCase()]
  if (aliased) return aliased
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
  const out: Validation = { rows: [], errors: [], duplicates: [], warnings: [], undecided: [], writeIns: new Map(), fatal: null }

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

  // Google's own repeats (6 Oct 2026). When a question is deleted and re-added
  // in the form editor, Google keeps the old column, with every answer already
  // in it, and inserts a new column of the same title after the form's last
  // one, ahead of the desk's. Which of the two the live question writes to
  // cannot be seen from the CSV, so both are read: each row takes its answer
  // from whichever copy holds it, and a row with an answer in both is refused.
  // Only an exact form title is a repeat (never Timestamp, which Google writes
  // once); anything else is still an unknown column.
  const repeats: number[] = [] // index into ROSTER_HEADER, per repeated column
  for (const h of extra) {
    const i = (ROSTER_HEADER as readonly string[]).indexOf(h.trim())
    if (i <= 0) break
    repeats.push(i)
  }
  const deskStart = ROSTER_HEADER.length + repeats.length
  const desk = extra.slice(repeats.length)

  // The desk column is typed by a person, not generated by Google, so its
  // header is matched ignoring case and surrounding space ("Accreditation Type"
  // was the first one typed). The form's own headers stay exact.
  const same = (a: string | undefined, b: string) => (a ?? '').trim().toLowerCase() === b.toLowerCase()
  const hasDesk = desk.length >= 1 && same(desk[0], DESK_HEADER)
  const hasTshirt = hasDesk && desk.length === 3 && same(desk[1], TSHIRT_HEADER) && same(desk[2], TSHIRT_SIZE_HEADER)
  if (
    !header ||
    formPart.length !== ROSTER_HEADER.length ||
    formPart.some((h, i) => h.trim() !== ROSTER_HEADER[i]) ||
    (desk.length > 0 && !(hasDesk && (desk.length === 1 || hasTshirt)))
  ) {
    out.fatal =
      `Invalid header. Expected exactly: ${ROSTER_HEADER.join(', ')}` +
      ` — optionally followed by the desk's "${DESK_HEADER}" column, then "${TSHIRT_HEADER}" and "${TSHIRT_SIZE_HEADER}", and nothing else`
    return out
  }
  const width = deskStart + (hasTshirt ? 3 : hasDesk ? 1 : 0)
  const col = (i: number) => String.fromCharCode(65 + i) // A–Z is enough: the sheet stops well short of Z
  for (const [j, i] of repeats.entries()) {
    out.warnings.push(
      `The sheet has a second "${ROSTER_HEADER[i]}" column (${col(ROSTER_HEADER.length + j)}): Google adds one when ` +
        `that question is deleted and re-added in the form editor. Both ${col(i)} and ` +
        `${col(ROSTER_HEADER.length + j)} are read; each row takes its answer from whichever holds it.`,
    )
  }
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
    const form = cells.slice(0, ROSTER_HEADER.length)
    for (const [j, i] of repeats.entries()) {
      const again = cells[ROSTER_HEADER.length + j] ?? ''
      if (again.trim() === '') continue
      if ((form[i] ?? '').trim() !== '') {
        errors.push(
          `${ROSTER_HEADER[i]} has an answer in both ${col(i)} and ${col(ROSTER_HEADER.length + j)}; ` +
            'clear the wrong one in the sheet',
        )
      } else form[i] = again
    }
    const [ts, , nameRaw, phoneRaw, crewRaw, jobRaw, daysRaw, plateRaw] = form as [
      string, string, string, string, string, string, string, string,
    ]

    const submitted_at = parseFormTimestamp(ts)
    if (!submitted_at) errors.push(`Timestamp "${ts}" is not M/D/YYYY H:MM:SS`)

    if (organisation.length === 0) errors.push('Organisation is empty')

    const full_name = nameRaw.trim()
    if (full_name.length < 2 || full_name.length > 80) errors.push('Full name must be 2–80 characters')

    const phone = normalisePhone(phoneRaw)
    if (!phone) errors.push('WhatsApp number must be a 10-digit Indian mobile (starts 6–9), or an international number starting + and the country code')

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
    const deskRaw = hasDesk ? (cells[deskStart] ?? '').trim() : ''
    const type_code = deskRaw === '' ? null : (deskTiers[deskRaw] ?? null)
    if (deskRaw !== '' && type_code === null) {
      errors.push(`${DESK_HEADER} "${deskRaw}" is not one of the desk's choices`)
    }

    // Columns J and K. A shirt needs a size and a size needs a shirt: refuse
    // the row rather than guess either half (ACC-197).
    let tshirt_size: TshirtSize | null = null
    if (hasTshirt) {
      const yesRaw = (cells[deskStart + 1] ?? '').trim()
      const sizeRaw = (cells[deskStart + 2] ?? '').trim().toUpperCase()
      const yes = yesRaw.toLowerCase() === 'yes'
      if (yesRaw !== '' && !yes && yesRaw.toLowerCase() !== 'no') {
        errors.push(`${TSHIRT_HEADER} "${yesRaw}" must be Yes or blank`)
      } else if (yes) {
        const size = (TSHIRT_SIZES as readonly string[]).includes(sizeRaw) ? (sizeRaw as TshirtSize) : null
        if (size === null) {
          errors.push(
            sizeRaw === ''
              ? `${TSHIRT_HEADER} is Yes but ${TSHIRT_SIZE_HEADER} is blank`
              : `${TSHIRT_SIZE_HEADER} "${sizeRaw}" is not one of ${TSHIRT_SIZES.join(', ')}`,
          )
        } else tshirt_size = size
      } else if (sizeRaw !== '') {
        errors.push(`${TSHIRT_SIZE_HEADER} "${sizeRaw}" is set but ${TSHIRT_HEADER} is not Yes`)
      }
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
      tshirt_size,
      submitted_at,
    }
    const checked = importRowSchema.safeParse(candidate)
    if (!checked.success) {
      out.errors.push({ row_no, organisation, errors: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) })
      return
    }

    // One person, one submission. The database already refuses a phone twice on
    // the same roster; a repeat that names a differently spelled organisation
    // would get past that, so the sheet is checked across all of them here.
    const first = seen.get(phone)
    if (first !== undefined) {
      out.duplicates.push({ row_no, organisation, duplicate_of: first })
      return
    }
    seen.set(phone, row_no)

    const writeIn = !(FORM_CREW_TYPES as readonly string[]).includes(crewType)
    if (writeIn) {
      const list = out.writeIns.get(crewType) ?? []
      list.push(row_no)
      out.writeIns.set(crewType, list)
    }
    if (type_code === null) out.undecided.push(row_no)
    out.rows.push({ ...checked.data, organisation, crewType, writeIn })
  })

  if (out.duplicates.length > 0) {
    out.warnings.push(
      `${out.duplicates.length} row(s) repeat a phone already in an earlier row and are not imported ` +
        `(${out.duplicates.map((d) => `row ${d.row_no} = row ${d.duplicate_of}`).join(', ')}). The earliest is kept.`,
    )
  }
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

// ---------------------------------------------------------------------------
// ACC-194 · Loose organisation matching, and new organisations
// ---------------------------------------------------------------------------

const COMPANY_SUFFIXES = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'co', 'company'])

/**
 * A key that forgives case, accents, punctuation, "&" for "and", spacing, a
 * leading "The" and a trailing company suffix ("Pvt Ltd"). Two names with the
 * same loose key are the same organisation typed differently.
 */
export function orgLooseKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('en-IN')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '')
  if (words[0] === 'the') words.shift()
  while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1] as string)) words.pop()
  return words.join('')
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 3
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length] as number
}

/**
 * How many typos two loose keys may differ by and still be one organisation:
 * none under 10 characters (so "Stage A" and "Stage B" are never merged),
 * one from 10, two from 16. Digits must agree exactly.
 */
function typoLimit(key: string): number {
  return key.length >= 16 ? 2 : key.length >= 10 ? 1 : 0
}

function typoMatch(a: string, b: string): number | null {
  if (a.replace(/\D/g, '') !== b.replace(/\D/g, '')) return null
  const limit = Math.min(typoLimit(a), typoLimit(b))
  if (limit === 0) return null
  const d = editDistance(a, b)
  return d <= limit ? d : null
}

const SMALL_WORDS = new Set(['of', 'and', 'the', 'for', 'in', 'on', 'at', 'to'])

/**
 * The name a new organisation is created under: surrounding quotes and
 * punctuation removed, spacing collapsed, and — only when it was typed
 * entirely in lower case — capitalised. Anything else keeps its letters as
 * typed ("F5 Events", "ABC Sound").
 */
export function cleanOrgName(name: string): string {
  const t = name
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'`.,;:\-–—]+|[\s"'`.,;:\-–—]+$/g, '')
    .trim()
  if (t !== t.toLocaleLowerCase('en-IN')) return t
  return t
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toLocaleUpperCase('en-IN') + w.slice(1)))
    .join(' ')
}

export type OrgMerge = { from: string; to: string; row_nos: number[]; how: 'punctuation' | 'typo' }
export type OrgCreation = { name: string; row_nos: number[]; spellings: string[] }
export type OrgRefusal = { name: string; row_nos: number[]; why: string }
export type OrgReconciliation = { merges: OrgMerge[]; creations: OrgCreation[]; refused: OrgRefusal[] }

/**
 * ACC-194 · Decide what to do with Organisation answers that matched no org and
 * no alias. Merging into an EXISTING organisation is the risky move (people
 * land in the wrong org's roster), so it is conservative and never guesses
 * between two candidates. A name that resembles nothing becomes a new
 * organisation instead; spellings of the same new name are collapsed to one.
 *
 * Pure. The caller creates the organisations and prints every decision.
 */
export function reconcileOrganisations(unmatched: Map<string, number[]>, orgNames: string[]): OrgReconciliation {
  const out: OrgReconciliation = { merges: [], creations: [], refused: [] }
  const existing = orgNames.map((name) => ({ name, key: orgLooseKey(name) }))
  const fresh: { name: string; key: string; row_nos: number[] }[] = []

  for (const [name, row_nos] of unmatched) {
    const key = orgLooseKey(name)
    const cleaned = cleanOrgName(name)
    if (key.length < 2 || cleaned.length < 2 || cleaned.length > 120) {
      out.refused.push({ name, row_nos, why: 'not a usable organisation name' })
      continue
    }
    const same = existing.filter((o) => o.key === key)
    if (same.length === 1) {
      out.merges.push({ from: name, to: (same[0] as { name: string }).name, row_nos, how: 'punctuation' })
      continue
    }
    if (same.length > 1) {
      out.refused.push({ name, row_nos, why: `matches ${same.map((o) => `"${o.name}"`).join(' and ')} equally` })
      continue
    }
    const close = existing
      .map((o) => ({ o, d: typoMatch(key, o.key) }))
      .filter((c): c is { o: (typeof existing)[number]; d: number } => c.d !== null)
    if (close.length > 0) {
      const best = Math.min(...close.map((c) => c.d))
      const nearest = close.filter((c) => c.d === best)
      if (nearest.length === 1) {
        out.merges.push({ from: name, to: (nearest[0] as { o: { name: string } }).o.name, row_nos, how: 'typo' })
      } else {
        out.refused.push({ name, row_nos, why: `could be ${nearest.map((c) => `"${c.o.name}"`).join(' or ')}` })
      }
      continue
    }
    fresh.push({ name, key, row_nos })
  }

  // Spellings of one new name collapse to the one most rows used.
  fresh.sort((a, b) => b.row_nos.length - a.row_nos.length)
  const made: { key: string; creation: OrgCreation }[] = []
  for (const f of fresh) {
    const home = made.find((m) => m.key === f.key || typoMatch(f.key, m.key) !== null)
    if (home) {
      home.creation.row_nos.push(...f.row_nos)
      home.creation.spellings.push(f.name)
    } else {
      const creation = { name: cleanOrgName(f.name), row_nos: [...f.row_nos], spellings: [f.name] }
      made.push({ key: f.key, creation })
      out.creations.push(creation)
    }
  }
  for (const c of out.creations) c.row_nos.sort((a, b) => a - b)
  return out
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
      tshirt_size: r.tshirt_size,
      submitted_at: r.submitted_at,
    }),
  )
}
