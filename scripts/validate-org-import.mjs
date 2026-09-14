import { readFile } from 'node:fs/promises'
import { z } from 'zod'

export const HEADERS = ['name', 'kind', 'quota', 'contact_name', 'contact_phone', 'default_type']
export const ORG_KINDS = ['vendor', 'crew', 'sponsor', 'media', 'security', 'contractor']
const ORG_TYPE_CODES = ['crew', 'stage', 'aaa']
export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(ORG_KINDS),
  quota: z.coerce.number().int().min(0).max(500),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().trim().regex(/^\+91[6-9][0-9]{9}$/, 'Enter a 10-digit Indian mobile number'),
  defaultType: z.enum(ORG_TYPE_CODES).optional(),
})

export function parseCsv(input) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    const next = input[index + 1]

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        field += character
      }
    } else if (character === '"') {
      if (field.length !== 0) throw new Error('a quote may only start a CSV field')
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && next === '\n') index += 1
      row.push(field)
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('unterminated quoted CSV field')
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((value) => value !== '')) rows.push(row)
  }
  return rows
}

function usage() {
  console.error('Usage: corepack pnpm validate:org-import -- path/to/organisations.csv [--json]')
}

function formatIssues(rowNumber, issues) {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? ` ${issue.path.join('.')}` : ''
    return `row ${rowNumber}${path}: ${issue.message}`
  })
}

/**
 * Reads and validates an organisation CSV, exactly the ACC-030a shape.
 * Returns { organisations, errors }. `organisations` is only populated when
 * `errors` is empty. Shared by the CLI validator below and by any script
 * (e.g. scripts/load-orgs.mjs) that needs the same validated rows before
 * writing anything to the database.
 */
export async function loadOrgFile(file) {
  const source = (await readFile(file, 'utf8')).replace(/^\uFEFF/, '')
  let rows
  try {
    rows = parseCsv(source)
  } catch (error) {
    return { organisations: [], errors: [`Invalid CSV: ${error instanceof Error ? error.message : 'parse error'}`] }
  }

  const header = rows.shift()
  if (!header || header.length !== HEADERS.length || header.some((value, index) => value !== HEADERS[index])) {
    return { organisations: [], errors: [`Invalid header. Expected exactly: ${HEADERS.join(',')}`] }
  }
  if (rows.length === 0) {
    return { organisations: [], errors: ['The organisation file contains no data rows.'] }
  }
  if (rows.length !== 38) {
    return { organisations: [], errors: [`Expected exactly 38 organisation rows, received ${rows.length}.`] }
  }

  const organisations = []
  const errors = []
  const names = new Map()

  rows.forEach((values, index) => {
    const rowNumber = index + 2
    if (values.length !== HEADERS.length) {
      errors.push(`row ${rowNumber}: expected ${HEADERS.length} columns, received ${values.length}`)
      return
    }

    const [name, kind, quota, contactName, contactPhone, defaultType] = values
    const parsed = orgCreateSchema.safeParse({
      name,
      kind,
      quota,
      contactName,
      contactPhone,
      defaultType: defaultType || undefined,
    })
    if (!parsed.success) {
      errors.push(...formatIssues(rowNumber, parsed.error.issues))
      return
    }

    const key = parsed.data.name.toLocaleLowerCase('en-IN')
    const previousRow = names.get(key)
    if (previousRow !== undefined) {
      errors.push(`row ${rowNumber} name: duplicate of row ${previousRow} (case-insensitive)`)
      return
    }
    names.set(key, rowNumber)
    organisations.push(parsed.data)
  })

  if (errors.length > 0) return { organisations: [], errors }
  return { organisations, errors: [] }
}

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== '--')
  const json = args.includes('--json')
  const file = args.find((argument) => argument !== '--json')
  if (!file) {
    usage()
    process.exitCode = 2
    return
  }

  const { organisations, errors } = await loadOrgFile(file)

  if (errors.length > 0) {
    errors.forEach((error) => console.error(error))
    process.exitCode = 1
    return
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(organisations, null, 2)}\n`)
    return
  }

  const totalQuota = organisations.reduce((sum, organisation) => sum + organisation.quota, 0)
  console.log(`Valid organisation import: ${organisations.length} rows`)
  console.log(`Total quota declared: ${totalQuota}`)
  console.log('No database writes were performed.')
}

await main()
