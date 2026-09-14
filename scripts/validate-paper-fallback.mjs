import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const EXPECTED_HEADERS = [
  'organisation',
  'pass_ref',
  'full_name',
  'role',
  'vehicle_registration',
  'type_code',
  'day_validity',
]
const TOKEN_HEADER = /token|secret|credential|password/i

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('unterminated quoted field')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
  }
  return rows
}

/**
 * Validates only the SHAPE of a paper-fallback roster CSV: headers, no
 * token/credential-like columns, no duplicate pass_ref, every required field
 * present. It does NOT query Supabase and it does NOT claim any row is
 * actually approved right now — see scripts/reconcile-paper-fallback.mjs for
 * that check, which reuses this function first and then cross-checks the
 * live database.
 *
 * Returns { rows, errors }. `rows` is an array of objects keyed by
 * EXPECTED_HEADERS, populated only when `errors` is empty.
 */
export async function loadPaperFallbackFile(inputPath) {
  const text = await readFile(inputPath, 'utf8')
  let parsed
  try {
    parsed = parseCsv(text)
  } catch (error) {
    return { rows: [], errors: [error instanceof Error ? error.message : String(error)] }
  }

  const [rawHeaders, ...data] = parsed
  const headers = rawHeaders?.map((value) => value.trim()) ?? []

  if (headers.some((header) => TOKEN_HEADER.test(header))) {
    return { rows: [], errors: ['token-like or credential column is not allowed'] }
  }
  if (headers.length !== EXPECTED_HEADERS.length || headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
    return { rows: [], errors: [`header must be exactly: ${EXPECTED_HEADERS.join(',')}`] }
  }

  const errors = []
  const passRefs = new Set()
  const rows = []
  data.forEach((row, rowIndex) => {
    if (row.length !== headers.length) {
      errors.push(`row ${rowIndex + 2} has ${row.length} fields; expected ${headers.length}`)
      return
    }
    const values = row.map((value) => value.trim())
    for (const [index, value] of values.entries()) {
      if (index !== 4 && value.length === 0) {
        errors.push(`row ${rowIndex + 2} is missing ${headers[index]}`)
        return
      }
    }
    const passRef = values[1]
    if (passRefs.has(passRef)) {
      errors.push(`duplicate pass_ref at row ${rowIndex + 2}: ${passRef}`)
      return
    }
    passRefs.add(passRef)

    const record = {}
    headers.forEach((header, index) => {
      record[header] = values[index]
    })
    rows.push(record)
  })

  if (errors.length > 0) return { rows: [], errors }
  return { rows, errors: [] }
}

function fail(message) {
  console.error(`Paper fallback CSV invalid: ${message}`)
  process.exitCode = 1
}

async function main() {
  const inputPath = process.argv[2] === '--' ? process.argv[3] : process.argv[2]
  if (!inputPath) {
    fail('usage: node scripts/validate-paper-fallback.mjs <approved-roster.csv>')
    return
  }

  try {
    const { rows, errors } = await loadPaperFallbackFile(inputPath)
    if (errors.length > 0) throw new Error(errors[0])
    console.log(`Paper fallback CSV valid: ${rows.length} approved rows; no secrets or tokens included.`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

// Guarded so importing loadPaperFallbackFile (e.g. from
// scripts/reconcile-paper-fallback.mjs) never also runs this file's own CLI
// against the importer's process.argv.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
