import { readFile } from 'node:fs/promises'

const EXPECTED_HEADERS = [
  'organisation',
  'pass_ref',
  'full_name',
  'role',
  'vehicle_registration',
  'type_code',
  'day_validity',
]
const TOKEN_HEADER = /token|secret|credential|password/i

function parseCsv(text) {
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

function fail(message) {
  console.error(`Paper fallback CSV invalid: ${message}`)
  process.exitCode = 1
}

const inputPath = process.argv[2] === '--' ? process.argv[3] : process.argv[2]
if (!inputPath) {
  fail('usage: node scripts/validate-paper-fallback.mjs <approved-roster.csv>')
} else {
  try {
    const rows = parseCsv(await readFile(inputPath, 'utf8'))
    const [rawHeaders, ...data] = rows
    const headers = rawHeaders?.map((value) => value.trim()) ?? []

    if (headers.some((header) => TOKEN_HEADER.test(header))) {
      throw new Error('token-like or credential column is not allowed')
    }
    if (headers.length !== EXPECTED_HEADERS.length || headers.some((header, index) => header !== EXPECTED_HEADERS[index])) {
      throw new Error(`header must be exactly: ${EXPECTED_HEADERS.join(',')}`)
    }

    const passRefs = new Set()
    data.forEach((row, rowIndex) => {
      if (row.length !== headers.length) {
        throw new Error(`row ${rowIndex + 2} has ${row.length} fields; expected ${headers.length}`)
      }
      const values = row.map((value) => value.trim())
      for (const [index, value] of values.entries()) {
        if (index !== 4 && value.length === 0) {
          throw new Error(`row ${rowIndex + 2} is missing ${headers[index]}`)
        }
      }
      const passRef = values[1]
      if (passRefs.has(passRef)) throw new Error(`duplicate pass_ref at row ${rowIndex + 2}: ${passRef}`)
      passRefs.add(passRef)
    })

    console.log(`Paper fallback CSV valid: ${data.length} approved rows; no secrets or tokens included.`)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}
