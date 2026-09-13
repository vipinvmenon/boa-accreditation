// ACC-035 · removes every `TEST — *` organisation created by seed-dummy.mjs.
//
// Reuses private.boa_acc_wipe_org (202609110006) rather than writing a new
// raw DELETE path — that function already does the correct multi-step
// cascade (person -> submit_throttle -> org_invite -> org, each as its own
// statement so later steps see earlier ones) and is exactly what
// supabase/tests/*.test.sql already calls to clean up its own fixtures.
// It never touches boa_acc_checkin or boa_acc_aaa_nomination directly, and
// neither does this script for anything a TEST org's own delete cascade
// doesn't already reach.
//
//   corepack pnpm wipe:dummy

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_PREFIX = 'TEST — '
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

const t = describeTransport(root)
console.log(`\nwipe:dummy — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const q = (sql) => runSql(sql, root)

async function main() {
  const orgs = await q(`select id, name from public.boa_acc_org where name like ${lit(TEST_PREFIX + '%')} order by name`)

  if (orgs.length === 0) {
    console.error('  Found 0 TEST — orgs. Expected at least one to wipe.')
    process.exit(1)
  }

  // AAA nominations aren't scoped to an org row, so a nomination created by
  // seed-dummy.mjs (org_hint = the TEST org's own name) would otherwise
  // survive boa_acc_wipe_org. Clear those first, same as
  // supabase/tests/dashboard.test.sql does for its own fixture phones.
  const nominationsBefore = await q(
    `select count(*)::int as n from public.boa_acc_aaa_nomination where org_hint like ${lit(TEST_PREFIX + '%')}`,
  )
  if (nominationsBefore[0].n > 0) {
    await q(`delete from public.boa_acc_aaa_nomination where org_hint like ${lit(TEST_PREFIX + '%')}`)
    console.log(`  [ok] removed ${nominationsBefore[0].n} TEST — AAA nomination(s)`)
  }

  for (const org of orgs) {
    const [{ n: peopleBefore }] = await q(
      `select count(*)::int as n from public.boa_acc_person where org_id = '${org.id}'::uuid`,
    )
    await q(`select private.boa_acc_wipe_org(${lit(org.name)})`)
    console.log(`  [ok] removed ${org.name} (${peopleBefore} people, cascaded via boa_acc_wipe_org)`)
  }

  const remaining = await q(`select count(*)::int as n from public.boa_acc_org where name like ${lit(TEST_PREFIX + '%')}`)
  if (remaining[0].n !== 0) {
    console.error(`\n  [FAIL] ${remaining[0].n} TEST — org(s) still remain after wipe.`)
    process.exit(1)
  }

  console.log(`\n  Removed ${orgs.length} TEST — org(s). 0 TEST — orgs remaining, verified.\n`)
}

await main()
