// ACC-117 · Validate and load the roster form's response sheet.
//
//   node scripts/import-roster.mjs responses.csv --offline            # validate only, no database at all
//   node scripts/import-roster.mjs responses.csv --dry                # + read-only org match and quota preview
//   node scripts/import-roster.mjs responses.csv --as you@example.com [--report out.local.csv]
//
// Options: --mapping path (default data/crew-type-tiers.json, EMPTY until
// Salman gives the crew type → tier mapping), --partial (load the valid rows
// even when some rows are invalid or name an unknown organisation).
//
// The CSV is the response sheet exported as-is (File ▸ Download ▸ CSV), header
// exactly as docs/ROSTER-FORM.md. Parsing and validation live in
// lib/roster-import.ts (Node runs it directly with type stripping, Node ≥ 22.18
// / 23.6); this file does only I/O.
//
// Loading goes through public.boa_acc_import_roster — one call per
// organisation — as the session of the operator named by --as, who must be an
// active lead/admin. The database decides everything that matters: quota under
// the org row lock, duplicate phones, and it never sets a tier or a pass. It
// reports per row; re-running the same file is safe (loaded rows come back
// duplicate_phone).
//
// The report file holds row numbers, organisation, outcome and reason — never a
// name or a phone. Name it *.local.csv under data/ and it is gitignored.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { describeTransport, runSql } from './lib/db.mjs'
import {
  crewTypeMappingSchema,
  importResultSchema,
  importRosterSql,
  matchOrganisations,
  toRpcPayload,
  validateRoster,
} from '../lib/roster-import.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const MAX_ROWS_PER_CALL = 1000 // the RPC's own cap

function usage() {
  console.error(
    'Usage: node scripts/import-roster.mjs responses.csv (--offline | --dry | --as operator@email) ' +
      '[--mapping data/crew-type-tiers.json] [--report data/roster-import.local.csv] [--partial]',
  )
}

const args = process.argv.slice(2).filter((a) => a !== '--')
const opt = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? null : (args[i + 1] ?? null)
}
const file = args[0]
const offline = args.includes('--offline')
const dry = args.includes('--dry') || offline
const partial = args.includes('--partial')
const asEmail = opt('--as')
const mappingFile = opt('--mapping') ?? join(root, 'data/crew-type-tiers.json')
const reportFile = opt('--report')

if (!file || file.startsWith('--') || (!dry && !asEmail)) {
  usage()
  process.exit(2)
}

const orgRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  quota: z.coerce.number().int(),
  status: z.string(),
  used: z.coerce.number().int(),
})

async function main() {
  const mapping = crewTypeMappingSchema.parse(JSON.parse(await readFile(resolve(mappingFile), 'utf8')))
  const v = validateRoster(await readFile(resolve(file), 'utf8'), mapping)

  if (v.fatal) {
    console.error(v.fatal)
    process.exit(1)
  }

  console.log(`\nimport-roster — ${file}`)
  console.log('Timestamps are read as Asia/Kolkata (the sheet exports M/D/YYYY with no zone).')
  console.log(`${v.rows.length} valid row(s), ${v.errors.length} refused row(s).`)
  console.log(`Crew-type mapping: ${Object.keys(mapping.mapping).length} entr(ies) from ${mappingFile}`)
  for (const e of v.errors) console.log(`  [refused] row ${e.row_no} (${e.organisation || 'no organisation'}): ${e.errors.join('; ')}`)
  for (const w of v.warnings) console.log(`  [note] ${w}`)
  const writeIns = v.rows.filter((r) => r.writeIn).length
  if (writeIns > 0) console.log(`  [note] ${writeIns} row(s) have a write-in ("Other") crew type — a person must pick their band.`)

  if (offline) {
    console.log('\n--offline: organisations not matched, nothing read from or written to the database.')
    process.exit(v.errors.length > 0 ? 1 : 0)
  }

  const t = describeTransport(root)
  console.log(`\nDatabase: ${t.detail}`)
  if (t.kind === 'none') {
    console.error('No database credential. Run: corepack pnpm exec supabase login  (or use --offline)')
    process.exit(1)
  }

  const orgs = z.array(orgRowSchema).parse(
    await runSql(
      `select o.id, o.name, o.quota, o.status::text as status,
              (select count(*) from public.boa_acc_person p
                where p.org_id = o.id and p.status <> 'voided')::integer as used
         from public.boa_acc_org o
        order by o.name`,
      root,
    ),
  )
  const { groups, unmatched } = matchOrganisations(v.rows, orgs)
  const info = new Map(orgs.map((o) => [o.id, o]))

  for (const [name, rows] of unmatched) {
    console.log(`  [unmatched] "${name}" is not a boa_acc_org name — rows ${rows.join(', ')}`)
  }
  console.log('')
  for (const g of groups) {
    const o = info.get(g.org.id)
    const seats = o ? o.quota - o.used : 0
    const flag = o?.status !== 'open' ? `  CLOSED (${o?.status}) — the import will refuse this org` : ''
    const over = g.rows.length > seats ? `  ${g.rows.length - seats} over the remaining quota` : ''
    console.log(`  ${g.org.name}: ${g.rows.length} row(s), ${o?.used ?? '?'}/${o?.quota ?? '?'} used${over}${flag}`)
  }

  if (dry) {
    console.log('\n--dry: nothing was written. Quota and duplicates are final only when the database decides them.')
    process.exit(v.errors.length > 0 || unmatched.size > 0 ? 1 : 0)
  }

  if ((v.errors.length > 0 || unmatched.size > 0) && !partial) {
    console.error('\nRefusing to load: some rows are refused or name an unknown organisation. Fix the sheet, or pass --partial to load only the valid, matched rows.')
    process.exit(1)
  }

  const [operator] = await runSql(
    `select o.user_id::text as user_id, o.role::text as role
       from public.boa_acc_operator o
       join auth.users u on u.id = o.user_id
      where lower(u.email) = lower(${lit(asEmail)})
        and o.active
        and o.role in ('lead', 'admin')`,
    root,
  )
  if (!operator) {
    console.error(`${asEmail} is not an active lead/admin operator. Importing is lead/admin work.`)
    process.exit(1)
  }
  console.log(`\nActing as ${asEmail} (${operator.role})`)

  const report = []
  const totals = { inserted: 0, duplicate_phone: 0, quota_exceeded: 0, invalid: 0 }
  for (const g of groups) {
    const payload = toRpcPayload(g.rows)
    for (let i = 0; i < payload.length; i += MAX_ROWS_PER_CALL) {
      const chunk = payload.slice(i, i + MAX_ROWS_PER_CALL)
      let results
      try {
        const rows = await runSql(importRosterSql(operator.user_id, g.org.id, chunk), root)
        results = z.array(importResultSchema).parse(rows)
      } catch (e) {
        console.log(`  [failed] ${g.org.name}: ${e instanceof Error ? e.message : e} — nothing loaded for this organisation`)
        for (const r of chunk) report.push([r.row_no, g.org.name, 'not_loaded', e instanceof Error ? e.message : String(e)])
        continue
      }
      const c = { inserted: 0, duplicate_phone: 0, quota_exceeded: 0, invalid: 0 }
      for (const r of results) {
        c[r.outcome] += 1
        totals[r.outcome] += 1
        report.push([r.row_no, g.org.name, r.outcome, r.detail ?? ''])
        if (r.outcome !== 'inserted') console.log(`    row ${r.row_no}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ''}`)
      }
      console.log(`  ${g.org.name}: ${c.inserted} inserted, ${c.duplicate_phone} duplicate, ${c.quota_exceeded} over quota, ${c.invalid} invalid`)
    }
  }
  for (const e of v.errors) report.push([e.row_no, e.organisation, 'refused_by_validator', e.errors.join('; ')])
  for (const [name, rows] of unmatched) for (const n of rows) report.push([n, name, 'unmatched_organisation', ''])

  console.log(`\nTotal: ${totals.inserted} inserted, ${totals.duplicate_phone} duplicate, ${totals.quota_exceeded} over quota, ${totals.invalid} invalid.`)

  if (reportFile) {
    const csv = [['row', 'organisation', 'outcome', 'detail'], ...report.sort((a, b) => a[0] - b[0])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    await writeFile(resolve(reportFile), `${csv}\n`, 'utf8')
    console.log(`Per-row report (no names or phones): ${resolve(reportFile)}`)
  }
}

await main()
