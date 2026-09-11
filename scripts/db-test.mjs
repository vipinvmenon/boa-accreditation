// Runs the pgTAP suite in supabase/tests/*.test.sql against the real database
// (Management API locally, node-postgres over SUPABASE_DB_URL in CI — see
// scripts/lib/db.mjs) and parses the TAP it gets back.
//
// Each test file is one big statement — see the comment at the top of
// privileges.test.sql for why: this pipeline has no psql / pg_prove, only
// "run a query, read the rows of the last statement", so every pgTAP call is
// UNION ALL'd into one SELECT ordered by an explicit sequence number.
//
// `-- @proves: LEVEL | text` headers are read from the file and printed
// alongside the result so a failing run says what GUARANTEE broke, not just
// which line number.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const DIR = join(root, 'supabase/tests')

const t = describeTransport(root)
console.log(`\ntest:db — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.test.sql')).sort() : []
if (!files.length) {
  console.log('  no test files in supabase/tests/')
  process.exit(0)
}

function parseProves(sql) {
  return [...sql.matchAll(/^-- @proves:\s*(\S+)\s*\|\s*(.+)$/gm)].map((m) => ({
    level: m[1],
    text: m[2].trim(),
  }))
}

let anyFailed = false

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8')
  const proves = parseProves(sql)

  console.log(`  ${file}`)
  for (const p of proves) console.log(`    @proves ${p.level.padEnd(8)} ${p.text}`)
  console.log('')

  let rows
  try {
    rows = await runSql(sql, root)
  } catch (e) {
    console.error(`  [FAIL] ${file} did not run at all:`)
    console.error(`  ${e.message}`)
    anyFailed = true
    continue
  }

  // A real pgTAP run ALWAYS returns at least a plan line and a finish() line.
  // Zero rows is not "nothing failed" — it is the transport silently
  // returning the wrong statement's result (this happened once: begin;/
  // rollback; pushed the SELECT off the end, and node-postgres returned
  // ROLLBACK's empty result instead). Treat it as a hard failure, not a pass.
  if (rows.length === 0) {
    console.error(`  [FAIL] ${file} returned ZERO rows — the transport did not run the assertions.`)
    console.error('  A real pgTAP run always returns at least a plan line and a finish() line.')
    anyFailed = true
    continue
  }

  const lines = rows.map((r) => (typeof r === 'string' ? r : r.line ?? r.l ?? Object.values(r)[0]))
  let fileFailed = false
  let sawPlan = false
  for (const line of lines) {
    if (line == null) continue
    const isFail = /^not ok/.test(line.trim())
    if (isFail) fileFailed = true
    if (/^\d+\.\.\d+/.test(line.trim())) sawPlan = true
    console.log(`    ${isFail ? '✗' : line.trim().startsWith('ok') ? '✓' : ' '} ${line}`)
  }
  if (!sawPlan) {
    console.error(`  [FAIL] ${file} — no "N..M" plan line seen. Assume it did not really run.`)
    fileFailed = true
  }

  if (fileFailed) {
    anyFailed = true
    console.error(`\n  [FAIL] ${file} — one or more assertions failed\n`)
  } else {
    console.log(`\n  [ ok ] ${file} — ${proves.length} guarantee(s) held\n`)
  }
}

if (anyFailed) {
  console.error('test:db FAILED — see above.')
  process.exit(1)
}
console.log('test:db OK')
