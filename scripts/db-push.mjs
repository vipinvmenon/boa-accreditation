// Applies migrations, and — more useful day to day — DRY RUNS them.
//
//   corepack pnpm db:push --dry     apply inside a transaction, verify, ROLL BACK
//   corepack pnpm db:push           apply for real, recording migration history
//
// The dry run is the point. It executes the real SQL against the real
// PostgreSQL 17.6 with the real extensions, then throws the work away. Every
// syntax error, every missing extension, every constraint that will not compile
// is found in a second, without leaving a half-applied schema behind — which
// is the state that costs an evening.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DRY = process.argv.includes('--dry')
const MIG = join(root, 'supabase/migrations')

const t = describeTransport(root)
console.log(`\ndb:push${DRY ? ' --dry' : ''} — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const files = existsSync(MIG) ? readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort() : []
if (!files.length) {
  console.log('  no migrations')
  process.exit(0)
}

await runSql(
  `create schema if not exists supabase_migrations;
   create table if not exists supabase_migrations.schema_migrations (
     version text primary key, name text, statements text[], created_at timestamptz default now());`,
  root,
)
const applied = new Set(
  (await runSql('select version from supabase_migrations.schema_migrations', root)).map((r) => r.version),
)

let ran = 0
for (const file of files) {
  const version = file.replace(/\.sql$/, '').split('_')[0]
  const name = file.replace(/^\d+_/, '').replace(/\.sql$/, '')

  // Skip applied migrations in BOTH modes. A dry run exists to validate what is
  // about to be applied; re-running an applied migration just reports
  // "type already exists" and buries the real signal.
  if (applied.has(version)) {
    console.log(`  [skip] ${file} — already applied`)
    continue
  }

  // The file carries its own begin;/commit;. Strip them so the whole thing runs
  // inside OUR transaction, which is what lets a dry run roll back.
  const body = readFileSync(join(MIG, file), 'utf8')
    .replace(/^\s*begin;\s*$/im, '')
    .replace(/^\s*commit;\s*$/im, '')

  const sql = DRY
    ? `begin;\n${body}\n rollback;`
    : `begin;\n${body}\n insert into supabase_migrations.schema_migrations(version, name)
         values ('${version}', '${name}') on conflict (version) do nothing;\n commit;`

  try {
    await runSql(sql, root)
    console.log(`  [${DRY ? 'dry' : ' ok'}] ${file}`)
    ran++
  } catch (e) {
    console.error(`\n  [FAIL] ${file}`)
    console.error(`  ${e.message}`)
    // Best effort: a failed statement already aborted the transaction, but if
    // the transport left one open, do not strand it.
    try { await runSql('rollback;', root) } catch { /* already rolled back */ }
    process.exit(1)
  }
}

if (DRY) {
  console.log(`\n  ${ran} migration(s) compiled and ran cleanly, then rolled back.`)
  console.log('  Nothing was changed. Run without --dry to apply.\n')
} else {
  console.log(`\n  ${ran} migration(s) applied.\n  Now: corepack pnpm db:state\n`)
}
