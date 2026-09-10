// Asks the database what it actually contains. Does not ask a document.
//
// This exists because boa-bar-control's CURRENT-STATE.md asserted the opposite
// of reality for days, and because `supabase db push` once reported "up to
// date" while two migrations had never run. The migration history table is only
// what the CLI BELIEVES; the existence of the object is the ground truth.
//
//   corepack pnpm db:state

import { readdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Each migration paired with ONE object that exists only if it truly ran.
 * Add a row here whenever you add a migration — a migration with no witness is
 * a migration whose application nobody can prove.
 */
const WITNESSES = [
  ['202609110001_boa_acc_core', 'table', 'public.boa_acc_person'],
  ['202609110002_boa_acc_lock_down_privileges', 'function', 'private.boa_acc_is_operator'],
]

const t = describeTransport(root)
console.log(`\ndb:state — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const q = (sql) => runSql(sql, root)
const table = (rows, cols) => {
  if (!rows.length) return console.log('    (none)')
  const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)))
  console.log('    ' + cols.map((c, i) => c.padEnd(w[i])).join('  '))
  for (const r of rows) console.log('    ' + cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  '))
}

// ── Identity ──────────────────────────────────────────────────────────────
const [id] = await q(`select current_database() as db, current_user as usr,
  (select setting from pg_settings where name='server_version') as pg`)
console.log(`  ${id.db} · ${id.usr} · PostgreSQL ${id.pg}\n`)

// ── Migrations: what the CLI believes ─────────────────────────────────────
console.log('  MIGRATION HISTORY (what the CLI believes)')
let applied = []
try {
  applied = await q(`select version, name from supabase_migrations.schema_migrations order by version`)
} catch {
  console.log('    (no supabase_migrations schema — nothing has been pushed)')
}
table(applied, ['version', 'name'])

const localDir = join(root, 'supabase/migrations')
const local = existsSync(localDir) ? readdirSync(localDir).filter((f) => f.endsWith('.sql')).sort() : []
console.log(`\n  LOCAL MIGRATION FILES (${local.length})`)
for (const f of local) console.log(`    ${f}`)

// ── Witnesses: the ground truth ───────────────────────────────────────────
console.log('\n  WITNESS — does the object each migration creates actually exist?')
const rows = []
for (const [mig, kind, obj] of WITNESSES) {
  const [schema, name] = obj.split('.')
  const sql =
    kind === 'table'
      ? `select count(*)::int as n from pg_tables where schemaname='${schema}' and tablename='${name}'`
      : `select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
         where ns.nspname='${schema}' and p.proname='${name}'`
  let n = 0
  try {
    ;[{ n }] = await q(sql)
  } catch {
    n = 0
  }
  rows.push({ migration: mig, object: `${kind} ${obj}`, exists: n > 0 ? 'YES' : 'NO' })
}
table(rows, ['migration', 'object', 'exists'])

// ── The security claims, checked ──────────────────────────────────────────
console.log('\n  ANON LOCKDOWN — non-negotiable #4')
// Event-trigger functions are excluded: they return `event_trigger` and can
// only be invoked by the DDL event system, never by a client, so an EXECUTE
// grant on one is unreachable. Supabase ships `public.rls_auto_enable` this way
// on every project (it auto-enables RLS on new public tables — useful to us).
// Counting it as a violation would make this check cry wolf on a fresh project,
// and a check that always fails is a check nobody reads.
const anon = await q(`
  select
    (select count(*)::int from information_schema.role_table_grants
      where grantee='anon' and table_schema='public') as table_grants,
    (select count(*)::int
       from information_schema.role_routine_grants g
       join pg_proc p on p.proname = g.routine_name
       join pg_namespace n on n.oid = p.pronamespace and n.nspname = g.specific_schema
      where g.grantee='anon'
        and g.specific_schema in ('public','private')
        and p.prorettype <> 'pg_catalog.event_trigger'::regtype) as function_grants`)
const a = anon[0] ?? { table_grants: '?', function_grants: '?' }
console.log(`    anon table grants:    ${a.table_grants}  ${a.table_grants === 0 ? '(correct)' : '<-- MUST BE 0'}`)
console.log(`    anon function grants: ${a.function_grants}  ${a.function_grants === 0 ? '(correct)' : '<-- MUST BE 0'}`)

// ── Contents ──────────────────────────────────────────────────────────────
console.log('\n  ROW COUNTS')
const tables = await q(`select tablename from pg_tables where schemaname='public' and tablename like 'boa_acc_%' order by tablename`)
if (!tables.length) console.log('    (no boa_acc_ tables yet)')
else {
  const counts = []
  for (const { tablename } of tables) {
    const [{ n }] = await q(`select count(*)::int as n from public.${tablename}`)
    counts.push({ table: tablename, rows: n })
  }
  table(counts, ['table', 'rows'])
}

console.log('\n  AUTH')
const [auth] = await q(`select count(*)::int as users from auth.users`)
console.log(`    auth.users: ${auth.users}`)
console.log('')
