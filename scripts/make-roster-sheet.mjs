/**
 * Regenerates the roster workbook builder from the authoritative organisation
 * CSV, and emits a plain-CSV fallback template.
 *
 *   corepack pnpm make:roster-sheet -- data/organisations.csv
 *   corepack pnpm make:roster-sheet -- data/organisations.csv --out build/roster
 *
 * It reads the committed template at
 * scripts/roster-sheet/build-roster-workbook.gs, replaces ONLY the ORGS block
 * between the two marker comments, and writes the filled result into the
 * (gitignored) out-dir. The committed template is never modified: it stays
 * hand-written, readable and diffable, and the filled copy — which carries
 * real organisation names — stays out of git.
 *
 * The CSV is the same file ACC-030a produces (docs/ORG-IMPORT.md): it must
 * carry at least `name` and `quota` columns. Extra columns are ignored here.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from './validate-org-import.mjs'
import { buildXlsx, sheetName, colLetter, STYLE, BAND_STYLE, ZONE_STYLE } from './roster-sheet/xlsx.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const GS_PATH = join(root, 'scripts/roster-sheet/build-roster-workbook.gs')
const MATRIX_PATH = join(root, 'design/source/accreditation/access-matrix.json')
const BEGIN = '// EDIT ME — one line per organisation: [name, quota]'
const END = '// ───────────────────────────────────────────────────────── END EDIT ME ──────'
const MATRIX_BEGIN = '// ─────────────────────────────────────────────────────────────────────────────\nvar MATRIX = null;'
const MATRIX_END = '// ────────────────────────────────────────────────────────── END MATRIX ──────'

/** The five columns an organisation fills. Must stay in step with COLUMNS in
 *  the .gs and with lib/schemas/submission.ts. */
const COLUMNS = ['full_name', 'phone', 'role', 'vehicle_reg', 'requested_tier', 'days_needed']

/** Headings, widths and layout MUST match build-roster-workbook.gs, because its
 *  exportAllTabsToCsv() reads from FIRST_DATA_ROW with this column order. */
const HEADINGS = [
  ['Full name *', 30],
  ['Phone (10 digits) *', 20],
  ['Role / job *', 26],
  ['Vehicle reg (if any)', 20],
  ['Band needed', 22],
  ['Days needed', 18],
]
const HEADER_ROW = 4
const FIRST_DATA_ROW = 5

const REQUESTABLE_TIERS = ['Crew', 'Stage', 'Photo', "Eddie's Lounge", 'Promoters Lounge']

/** Mirrors the boa_acc_day_validity enum (build / show / build_show). A person
 *  cannot be approved without one — see the pass_only_when_approved CHECK. */
const DAY_CHOICES = ['Build', 'Show', 'Both']

const RULES = [
  ['BANGALORE OPEN AIR 2026 — crew accreditation', STYLE.TITLE],
  ['', 0],
  ["Find your organisation's tab along the bottom. Fill in one row per person. That is all.", 0],
  ['', 0],
  ['THE COLUMNS   (* = required)', STYLE.RULE_H],
  ['Full name *          As it appears on the photo ID they will carry. 2-80 characters.', 0],
  ['Phone (10 digits) *  Ten digits only - 9876543210. No +91, no spaces, no dashes.', 0],
  ['                     A cell starting with "+" is read as a formula and gets mangled.', 0],
  ['Role / job *         What they actually do. Rigger, Sound engineer, Bar staff, Driver.', 0],
  ['Vehicle reg          Only if they drive in. KA01AB1234. Leave blank otherwise.', 0],
  ['Band needed          Optional. If you leave it blank the desk decides.', 0],
  ['Days needed *        Build, Show or Both. Build = 5-9 Oct load-in,', 0],
  ['                     Show = 10 Oct. Get this right: a Show band does not', 0],
  ['                     open the gate during build, and we cannot guess it.', 0],
  ['', 0],
  ['WHAT WE DO NOT COLLECT', STYLE.RULE_H],
  ['No ID number. No Aadhaar. No photograph. No address. No date of birth.', STYLE.RULE_WARN],
  ['Do not add a column for any of them. The importer refuses unknown columns outright.', STYLE.RULE_WARN],
  ['', 0],
  ['YOUR QUOTA', STYLE.RULE_H],
  ['The grey rows at the bottom of your tab are past your quota. They will be refused.', 0],
  ['If you genuinely need more people, ask the desk before typing them in.', 0],
  ['', 0],
  ['BANDS YOU CAN ASK FOR', STYLE.RULE_H],
  ["Crew - Stage - Photo - Eddie's Lounge - Promoters Lounge", 0],
  ['AAA and Artist are named lists approved separately - they are not on this form.', 0],
  ['', 0],
  ['WHO CAN SEE THIS', STYLE.RULE_H],
  ['Everyone with edit access to this workbook can read every tab, including other', STYLE.RULE_WARN],
  ["organisations' names and phone numbers. Sheets cannot hide a tab from an editor.", STYLE.RULE_WARN],
  ['', 0],
  ['DEADLINE', STYLE.RULE_H],
  ['Bands are handed over at the gate from 4 October. Not on this sheet, no band.', 0],
]

/**
 * The pack's access matrix, as a tab. Built from the committed transcription,
 * never typed in here — if the two disagree the printed sheets win and the
 * transcription is what gets corrected.
 */
function bandsSheet(matrix) {
  const zones = matrix.zones
  const tiers = [...matrix.tiers].sort((a, b) => a.sort_order - b.sort_order)
  const at = new Map(matrix.access.map((a) => [`${a.zone}|${a.tier}`, a]))
  const rows = []
  const lastCol = zones.length + 2

  rows.push({ r: 1, height: 34, cells: [{ c: 1, v: 'BANDS & ZONES — who gets in where', s: STYLE.TITLE }] })
  rows.push({
    r: 2,
    cells: [{
      c: 1,
      s: STYLE.SUBTITLE,
      v: 'BANGALORE OPEN AIR · 10 OCTOBER 2026 · transcribed from the printed accreditation pack',
    }],
  })

  rows.push({
    r: 4,
    height: 34,
    cells: [
      { c: 1, v: 'BAND', s: STYLE.HEADER },
      { c: 2, v: 'QTY', s: STYLE.HEADER },
      ...zones.map((z, i) => ({ c: i + 3, v: z.label.toUpperCase(), s: ZONE_STYLE[z.code] })),
    ],
  })

  tiers.forEach((tier, i) => {
    const cells = [
      { c: 1, v: tier.label, s: BAND_STYLE[tier.code] },
      { c: 2, v: tier.print_qty === null ? 'TBC' : String(tier.print_qty), s: STYLE.SMALL },
    ]
    zones.forEach((z, zi) => {
      const rule = at.get(`${z.code}|${tier.code}`)
      let v = '—'
      let style = STYLE.DENY
      if (rule) {
        style = STYLE.ALLOW
        v = 'YES'
        if (rule.requires_photo_id) { v = '+ PHOTO ID'; style = STYLE.ALLOW_COND }
        if (rule.from_local_time) {
          v = `+ PHOTO ID\nafter ${rule.from_local_time}`
          style = STYLE.ALLOW_COND
        }
      }
      cells.push({ c: zi + 3, v, s: style })
    })
    rows.push({ r: 5 + i, height: 30, cells })
  })

  const foot = 5 + tiers.length + 1
  const notes = [
    '“+ PHOTO ID” means the band alone is not entry — the matching photo ID and lanyard must be shown.',
    'A blank cell is a turn-away. Cut, taped or transferred bands are void: refuse entry and call the zone supervisor.',
    'AAA and Artist are named lists approved separately. They cannot be requested on a roster tab.',
  ]
  notes.forEach((n, i) => rows.push({ r: foot + i, cells: [{ c: 1, v: n, s: STYLE.SMALL }] }))

  return {
    name: 'Bands & zones',
    cols: [{ width: 22 }, { width: 8 }, ...zones.map(() => ({ width: 17 }))],
    freezeRow: 4,
    merges: [`A1:${colLetter(lastCol)}1`, `A2:${colLetter(lastCol)}2`,
      ...notes.map((_, i) => `A${foot + i}:${colLetter(lastCol)}${foot + i}`)],
    rows,
  }
}

function rulesSheet() {
  return {
    name: 'Rules',
    cols: [{ width: 100 }],
    rows: RULES.map(([text, style], i) => ({
      r: i + 1,
      height: i === 0 ? 30 : undefined,
      cells: [{ c: 1, v: text, s: style }],
    })),
  }
}

function orgSheet(org, name, lean) {
  const lastCol = HEADINGS.length
  const lastDataRow = FIRST_DATA_ROW + org.quota - 1
  const nameCol = colLetter(1)
  const rows = []

  rows.push({ r: 1, height: 34, cells: [{ c: 1, v: org.name, s: STYLE.TITLE }] })

  // Live counter, so an org can see how much of its quota is left without counting.
  rows.push({
    r: 2,
    cells: [{
      c: 1,
      s: STYLE.COUNTER,
      formula:
        `CONCATENATE("Quota: ",${org.quota},"   ·   Filled: ",` +
        `COUNTA(${nameCol}${FIRST_DATA_ROW}:${nameCol}${lastDataRow}),` +
        `"   ·   Left: ",${org.quota}-COUNTA(${nameCol}${FIRST_DATA_ROW}:${nameCol}${lastDataRow}))`,
    }],
  })

  if (!lean) rows.push({
    r: 3,
    height: 28,
    cells: [{
      c: 1,
      s: STYLE.NOTE,
      v:
        `Phone = 10 digits only, no +91, no spaces.   ·   One person per row.   ·   ` +
        `Your quota is ${org.quota} — rows past that will be refused.   ·   ` +
        'Do not add, rename or reorder columns.   ·   Name, phone, role and vehicle ' +
        'registration ONLY — no ID number, no Aadhaar, no photo, no address, no date of birth.',
    }],
  })

  rows.push({
    r: HEADER_ROW,
    cells: HEADINGS.map(([head], i) => ({ c: i + 1, v: head, s: STYLE.HEADER })),
  })

  // Only the quota rows are pre-created, and each as a single row-level style
  // rather than five cells. Emitting a grey overflow band as well tripled the
  // file, and this workbook has to travel to Drive as base64 in one piece.
  // The Apps Script build keeps the grey band; here the counter going negative
  // is the signal, plus the warning in row 3.
  for (let i = 0; lean ? i < 1 : i < org.quota; i += 1) {
    rows.push({
      r: FIRST_DATA_ROW + i,
      s: STYLE.TEXT,
      // The phone cell is ALSO set explicitly: it is the one column where
      // losing the text format in conversion silently corrupts data
      // (9876543210 -> 9.87654321E9).
      cells: [{ c: 2, s: STYLE.TEXT }],
    })
  }

  return {
    name,
    cols: HEADINGS.map(([, width]) => ({ width })),
    freezeRow: HEADER_ROW,
    merges: [`A1:${colLetter(lastCol)}1`, `A2:${colLetter(lastCol)}2`, `A3:${colLetter(lastCol)}3`],
    rows,
    validations: [
      {
        ref: `${colLetter(5)}${FIRST_DATA_ROW}:${colLetter(5)}${lastDataRow}`,
        values: REQUESTABLE_TIERS,
        help: 'Crew, Stage, Photo, Eddie\'s Lounge or Promoters Lounge. Blank is fine.',
      },
      {
        ref: `${colLetter(6)}${FIRST_DATA_ROW}:${colLetter(6)}${lastDataRow}`,
        values: DAY_CHOICES,
        help: 'Build = 5-9 Oct load-in only. Show = 10 Oct only. Both = all of it.',
      },
    ],
  }
}

function buildWorkbook(orgs, lean, matrix) {
  const taken = new Set(['Rules', 'Bands & zones'])
  const truncated = []
  const sheets = [rulesSheet(), bandsSheet(matrix)]

  for (const org of orgs) {
    const name = sheetName(org.name, taken)
    if (name !== org.name) truncated.push([org.name, name])
    sheets.push(orgSheet(org, name, lean))
  }

  return { xlsx: buildXlsx(sheets), truncated }
}

function fail(message) {
  process.stderr.write(`make-roster-sheet: ${message}\n`)
  process.exit(1)
}

function gsQuote(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function readOrgs(rows) {
  if (rows.length < 2) fail('the CSV has no data rows')
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const nameAt = head.indexOf('name')
  const quotaAt = head.indexOf('quota')
  if (nameAt === -1) fail('the CSV has no `name` column')
  if (quotaAt === -1) fail('the CSV has no `quota` column')

  const orgs = []
  const seen = new Map()

  rows.slice(1).forEach((row, i) => {
    const line = i + 2
    const name = (row[nameAt] ?? '').trim()
    const quotaRaw = (row[quotaAt] ?? '').trim()
    if (!name) fail(`line ${line}: empty name`)

    const quota = Number(quotaRaw)
    if (!Number.isInteger(quota) || quota < 1 || quota > 500) {
      fail(`line ${line}: quota "${quotaRaw}" must be a whole number from 1 to 500`)
    }

    // The .gs collapses these characters when it names a tab; two orgs that
    // collapse to the same tab name would silently overwrite each other.
    const tab = name.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 90)
    if (seen.has(tab)) {
      fail(`line ${line}: "${name}" and "${seen.get(tab)}" both become the tab "${tab}"`)
    }
    seen.set(tab, name)
    orgs.push({ name, quota })
  })

  return orgs
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const outAt = args.indexOf('--out')
  const outDir = outAt === -1 ? join(root, 'build/roster') : args[outAt + 1]
  const csvPath = args.find((a) => !a.startsWith('--') && a !== outDir)

  if (!csvPath) {
    fail('usage: make-roster-sheet <organisations.csv> [--out <dir>]')
  }

  const orgs = readOrgs(parseCsv(await readFile(csvPath, 'utf8')))
  const total = orgs.reduce((n, o) => n + o.quota, 0)
  const matrix = JSON.parse(await readFile(MATRIX_PATH, 'utf8'))

  const block = orgs.map((o) => `  [${gsQuote(o.name)}, ${o.quota}],`).join('\n')
  let gs = await readFile(GS_PATH, 'utf8')

  // Inject the access matrix the same way as ORGS, so the Apps Script and the
  // XLSX are built from one transcription rather than two copies.
  const mFrom = gs.indexOf(MATRIX_BEGIN)
  const mTo = gs.indexOf(MATRIX_END)
  if (mFrom === -1 || mTo === -1) fail('the MATRIX markers are missing from build-roster-workbook.gs')
  gs =
    gs.slice(0, mFrom + MATRIX_BEGIN.length) +
    `\nvar MATRIX = ${JSON.stringify(matrix, null, 0)};\n` +
    gs.slice(mTo)

  const from = gs.indexOf(BEGIN)
  const to = gs.indexOf(END)
  if (from === -1 || to === -1) fail('the ORGS markers are missing from build-roster-workbook.gs')

  const head = gs.slice(0, from + BEGIN.length)
  const tail = gs.slice(to)
  const middle = [
    '',
    '// Regenerated by scripts/make-roster-sheet.mjs — do not hand-edit.',
    `// Source: ${csvPath}  ·  ${orgs.length} organisations  ·  ${total} places`,
    '// ─────────────────────────────────────────────────────────────────────────────',
    'var ORGS = [',
    block,
    '];',
  ].join('\n') + '\n'

  await mkdir(outDir, { recursive: true })
  const gsOut = join(outDir, 'build-roster-workbook.gs')
  await writeFile(gsOut, head + middle + tail, 'utf8')
  // The CSV stays strictly machine-clean — the validator parses it, so no
  // comment lines, no blank leading rows, no merged title. The guidance an org
  // needs therefore travels beside it, not inside it.
  const template = [
    COLUMNS.join(','),
    'Asha Rao,9876543210,Stage hand,KA01AB1234,Crew,Both',
    'Imran Q,9812345678,Sound engineer,,Stage,Build',
    'Mary D,9800011122,Bar staff,,,Show',
  ].join('\n') + '\n'
  await writeFile(join(outDir, 'roster-template.csv'), template, 'utf8')

  const readme = `BANGALORE OPEN AIR 2026 - crew list
===================================

Fill in roster-template.csv, one row per person, and send it back.

DELETE THE THREE EXAMPLE ROWS FIRST. They are there to show the format, not
to be submitted. Keep the header row exactly as it is.

THE COLUMNS  (* = required)
  full_name       required  2-80 characters, as printed on the photo ID they
                            will carry.
  phone           required  TEN DIGITS ONLY - 9876543210.
                            No +91, no spaces, no dashes, no brackets.
                            A spreadsheet cell starting with "+" is treated as
                            a formula and the number gets mangled.
  role            required  2-60 characters. What they actually do:
                            Rigger, Sound engineer, Bar staff, Driver.
  vehicle_reg     optional  Only if they drive in. KA01AB1234, no spaces.
                            Leave the cell empty otherwise.
  requested_tier  optional  Which band they need. Leave blank if unsure -
                            the desk decides.
                            Crew | Stage | Photo | Eddie's Lounge | Promoters Lounge
                            AAA and Artist are named lists approved separately
                            and cannot be requested here.
  days_needed     required  Which days they are on site.
                            Build | Show | Both
                            Build = 5-9 October load-in only.
                            Show  = 10 October only.
                            Both  = load-in and show day.
                            Get this right: a Show band does not open the gate
                            during build, and we cannot guess it for you.

The last example row shows a person with no vehicle and no band preference:
both optional cells are simply left empty. Note that days_needed is still
filled in on every row - it is not optional.

WHAT WE DO NOT COLLECT
  No ID number. No Aadhaar. No photograph. No address. No date of birth.
  Do not add a column for any of them - the import refuses any column it does
  not recognise, and your whole file will bounce back.

DO NOT add, rename, reorder or remove columns. Five columns, in this order.

YOUR QUOTA
  You have been told how many people your organisation may bring. Rows past
  that number are refused on import. If you genuinely need more, ask the desk
  before typing them in.

SAVING
  Keep it as CSV. If you open it in Excel or Google Sheets, format the phone
  column as plain text before typing, or the leading digits can be eaten.

DEADLINE
  Bands are handed over at the gate from 4 October 2026. Someone not on this
  list has no band.
`
  await writeFile(join(outDir, 'roster-template-HOW-TO.txt'), readme, 'utf8')

  const manifest = ['org_name,quota,tab_name']
    .concat(orgs.map((o) => {
      const tab = o.name.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 90)
      const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      return `${q(o.name)},${o.quota},${q(tab)}`
    }))
    .join('\n') + '\n'
  await writeFile(join(outDir, 'tabs.csv'), manifest, 'utf8')

  const { xlsx, truncated } = buildWorkbook(orgs, false, matrix)
  const xlsxPath = join(outDir, 'boa-2026-rosters.xlsx')
  await writeFile(xlsxPath, xlsx)

  // A stripped copy, small enough to travel as base64 through an API that only
  // accepts inline content. Same tabs, same columns, same dropdown; without the
  // per-tab prose (it is on the Rules tab) and the pre-created blank rows.
  const lean = buildWorkbook(orgs, true, matrix)
  const leanPath = join(outDir, 'boa-2026-rosters-lean.xlsx')
  await writeFile(leanPath, lean.xlsx)

  process.stdout.write(
    `make-roster-sheet: ${orgs.length} organisations, ${total} places total\n` +
    `  wrote    ${xlsxPath}\n` +
    `  wrote    ${leanPath}\n` +
    `  wrote    ${gsOut}\n` +
    `  wrote    ${join(outDir, 'roster-template.csv')}\n` +
    `  wrote    ${join(outDir, 'roster-template-HOW-TO.txt')}\n` +
    `  wrote    ${join(outDir, 'tabs.csv')}\n` +
    `\nNext: open a new Google Sheet, Extensions > Apps Script, paste in\n` +
    `${gsOut}, Save, then Run > buildWorkbook.\n` +
    `Read docs/ROSTER-SHEET.md before you share the workbook.\n` +
    (truncated.length
      ? `\nNote: XLSX caps a tab name at 31 characters, so ${truncated.length} name(s) ` +
        `were shortened for the tab. The full name is in row 1 of each tab:\n` +
        truncated.map(([from, to]) => `  ${from}\n    -> ${to}\n`).join('')
      : '')
  )
}

main().catch((error) => fail(error.message))
