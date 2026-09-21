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
import { buildXlsx, sheetName, colLetter, STYLE } from './roster-sheet/xlsx.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const GS_PATH = join(root, 'scripts/roster-sheet/build-roster-workbook.gs')
const BEGIN = '// EDIT ME — one line per organisation: [name, quota]'
const END = '// ───────────────────────────────────────────────────────── END EDIT ME ──────'

/** The five columns an organisation fills. Must stay in step with COLUMNS in
 *  the .gs and with lib/schemas/submission.ts. */
const COLUMNS = ['full_name', 'phone', 'role', 'vehicle_reg', 'requested_tier']

/** Headings, widths and layout MUST match build-roster-workbook.gs, because its
 *  exportAllTabsToCsv() reads from FIRST_DATA_ROW with this column order. */
const HEADINGS = [
  ['Full name *', 30],
  ['Phone (10 digits) *', 20],
  ['Role / job *', 26],
  ['Vehicle reg (if any)', 20],
  ['Band needed', 22],
]
const HEADER_ROW = 4
const FIRST_DATA_ROW = 5

const REQUESTABLE_TIERS = ['Crew', 'Stage', 'Photo', "Eddie's Lounge", 'Promoters Lounge']

const RULES = [
  ['BANGALORE OPEN AIR 2026 — crew accreditation', STYLE.TITLE],
  ['', 0],
  ["Find your organisation's tab along the bottom. Fill in one row per person. That is all.", 0],
  ['', 0],
  ['THE FIVE COLUMNS', STYLE.RULE_H],
  ['Full name *          As it appears on the photo ID they will carry. 2-80 characters.', 0],
  ['Phone (10 digits) *  Ten digits only - 9876543210. No +91, no spaces, no dashes.', 0],
  ['                     A cell starting with "+" is read as a formula and gets mangled.', 0],
  ['Role / job *         What they actually do. Rigger, Sound engineer, Bar staff, Driver.', 0],
  ['Vehicle reg          Only if they drive in. KA01AB1234. Leave blank otherwise.', 0],
  ['Band needed          Optional. If you leave it blank the desk decides.', 0],
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

function orgSheet(org, name) {
  const lastCol = HEADINGS.length
  const lastDataRow = FIRST_DATA_ROW + org.quota - 1
  const nameCol = colLetter(1)
  const rows = []

  rows.push({ r: 1, height: 30, cells: [{ c: 1, v: org.name, s: STYLE.TITLE }] })

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

  rows.push({
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
  for (let i = 0; i < org.quota; i += 1) {
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
    validations: [{
      ref: `${colLetter(5)}${FIRST_DATA_ROW}:${colLetter(5)}${lastDataRow}`,
      values: REQUESTABLE_TIERS,
      help: 'Crew, Stage, Photo, Eddie\'s Lounge or Promoters Lounge. Blank is fine.',
    }],
  }
}

function buildWorkbook(orgs) {
  const taken = new Set(['Rules'])
  const truncated = []
  const sheets = [rulesSheet()]

  for (const org of orgs) {
    const name = sheetName(org.name, taken)
    if (name !== org.name) truncated.push([org.name, name])
    sheets.push(orgSheet(org, name))
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

  const block = orgs.map((o) => `  [${gsQuote(o.name)}, ${o.quota}],`).join('\n')
  const gs = await readFile(GS_PATH, 'utf8')
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
  const template = [
    COLUMNS.join(','),
    'Asha Rao,9876543210,Stage hand,KA01AB1234,Crew',
    'Imran Q,9812345678,Sound engineer,,Stage',
  ].join('\n') + '\n'
  await writeFile(join(outDir, 'roster-template.csv'), template, 'utf8')

  const manifest = ['org_name,quota,tab_name']
    .concat(orgs.map((o) => {
      const tab = o.name.replace(/[:\\/?*[\]]/g, '-').trim().slice(0, 90)
      const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
      return `${q(o.name)},${o.quota},${q(tab)}`
    }))
    .join('\n') + '\n'
  await writeFile(join(outDir, 'tabs.csv'), manifest, 'utf8')

  const { xlsx, truncated } = buildWorkbook(orgs)
  const xlsxPath = join(outDir, 'boa-2026-rosters.xlsx')
  await writeFile(xlsxPath, xlsx)

  process.stdout.write(
    `make-roster-sheet: ${orgs.length} organisations, ${total} places total\n` +
    `  wrote    ${xlsxPath}\n` +
    `  wrote    ${gsOut}\n` +
    `  wrote    ${join(outDir, 'roster-template.csv')}\n` +
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
