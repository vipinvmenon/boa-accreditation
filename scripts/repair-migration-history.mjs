// Repairs migration-history drift: a migration that ran under a DIFFERENT
// version id than its filename.
//
//   corepack pnpm exec node scripts/repair-migration-history.mjs --dry   (default)
//   corepack pnpm exec node scripts/repair-migration-history.mjs --apply
//
// WHY THIS EXISTS (22-23 Sep 2026)
//
// Two migrations were applied through the Supabase CLI, which stamped them
// with generated timestamps instead of the filename's version:
//
//   file 202609151000_boa_acc_org_roster.sql     -> history 20260915035616
//   file 202609151015_boa_acc_queue_contract.sql -> history 20260915050526
//
// `db:push` compares the FILENAME version against history, so it believed both
// were pending and tried to re-run them. The first one failed with
// "function boa_acc_org_roster already exists", blocking every later
// migration behind it.
//
// This records the filename version as applied, so db:push skips them. It
// changes NO schema. It refuses to record anything whose object is not
// actually present, so it cannot paper over a migration that never ran:
// db:state's WITNESS table is the ground truth, and this script asks the same
// question before writing a single row.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const APPLY = process.argv.includes('--apply')

/** version to record, its name, and ONE object that proves it truly ran. */
const REPAIRS = [
  ['202609151000', 'boa_acc_org_roster', 'function', 'public.boa_acc_org_roster'],
  ['202609151015', 'boa_acc_queue_contract', 'function', 'public.boa_acc_approval_queue'],
]

const t = describeTransport(root)
console.log(`\nrepair-migration-history${APPLY ? ' --apply' : ' --dry'} — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const exists = async (kind, obj) => {
  const [schema, name] = obj.split('.')
  const sql =
    kind === 'function'
      ? `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = '${schema}' and p.proname = '${name}'`
      : `select count(*)::int as n from pg_tables where schemaname = '${schema}' and tablename = '${name}'`
  const rows = await runSql(sql, root)
  return Number(rows[0]?.n ?? 0) > 0
}

let toWrite = []
for (const [version, name, kind, obj] of REPAIRS) {
  const already = await runSql(
    `select count(*)::int as n from supabase_migrations.schema_migrations where version = '${version}'`,
    root,
  )
  if (Number(already[0]?.n ?? 0) > 0) {
    console.log(`  [skip]    ${version} ${name} — already recorded`)
    continue
  }
  if (!(await exists(kind, obj))) {
    console.error(`  [REFUSED] ${version} ${name} — ${kind} ${obj} does not exist.`)
    console.error(`            That migration has NOT run. Let db:push run it; do not record it here.`)
    process.exitCode = 1
    continue
  }
  console.log(`  [repair]  ${version} ${name} — ${kind} ${obj} exists`)
  toWrite.push([version, name])
}

if (!toWrite.length) {
  console.log('\n  nothing to repair\n')
  process.exit(process.exitCode ?? 0)
}
if (!APPLY) {
  console.log(`\n  --dry: nothing written. Re-run with --apply to record ${toWrite.length}.\n`)
  process.exit(0)
}

const values = toWrite.map(([v, n]) => `('${v}','${n}')`).join(', ')
await runSql(
  `insert into supabase_migrations.schema_migrations (version, name) values ${values}
     on conflict (version) do nothing`,
  root,
)
const check = await runSql(
  `select version, name from supabase_migrations.schema_migrations
     where version in (${toWrite.map(([v]) => `'${v}'`).join(', ')}) order by version`,
  root,
)
console.log('\n  recorded:')
for (const row of check) console.log(`    ${row.version}  ${row.name}`)
console.log('\n  Now run: corepack pnpm db:push\n')
