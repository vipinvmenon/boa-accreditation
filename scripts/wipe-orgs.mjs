// Removes every organisation whose name starts with a given prefix.
//
// Generalises scripts/wipe-dummy.mjs's approach (which is hardcoded to
// "TEST — ", the ACC-035 QA fixture prefix) so the same safe cascade also
// covers scripts/load-orgs.mjs's "PLACEHOLDER — " rows, or any other
// clearly-prefixed batch of non-production organisations. Reuses
// private.boa_acc_wipe_org (202609110006) — the same multi-step cascade
// (person -> submit_throttle -> org_invite -> org) the pgTAP suite and
// wipe-dummy.mjs already rely on. Never touches boa_acc_checkin.
//
// Refuses to run without an explicit --prefix, on purpose: there is no safe
// default here, unlike wipe-dummy's single hardcoded fixture prefix.
//
//   node scripts/wipe-orgs.mjs --prefix "PLACEHOLDER — "

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

const args = process.argv.slice(2)
const prefixIdx = args.indexOf('--prefix')
const prefix = prefixIdx !== -1 ? args[prefixIdx + 1] : null

if (!prefix) {
  console.error('Usage: node scripts/wipe-orgs.mjs --prefix "PLACEHOLDER — "')
  process.exit(2)
}

const t = describeTransport(root)
console.log(`\nwipe-orgs — ${t.detail} — prefix ${JSON.stringify(prefix)}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const q = (sql) => runSql(sql, root)

async function main() {
  const orgs = await q(`select id, name from public.boa_acc_org where name like ${lit(prefix + '%')} order by name`)

  if (orgs.length === 0) {
    console.log(`  Found 0 organisation(s) with prefix ${JSON.stringify(prefix)}. Nothing to do.\n`)
    return
  }

  const nominationsBefore = await q(
    `select count(*)::int as n from public.boa_acc_aaa_nomination where org_hint like ${lit(prefix + '%')}`,
  )
  if (nominationsBefore[0].n > 0) {
    await q(`delete from public.boa_acc_aaa_nomination where org_hint like ${lit(prefix + '%')}`)
    console.log(`  [ok] removed ${nominationsBefore[0].n} AAA nomination(s) matching the prefix`)
  }

  for (const org of orgs) {
    const [{ n: peopleBefore }] = await q(`select count(*)::int as n from public.boa_acc_person where org_id = '${org.id}'::uuid`)
    await q(`select private.boa_acc_wipe_org(${lit(org.name)})`)
    console.log(`  [ok] removed ${org.name} (${peopleBefore} people, cascaded via boa_acc_wipe_org)`)
  }

  const remaining = await q(`select count(*)::int as n from public.boa_acc_org where name like ${lit(prefix + '%')}`)
  if (remaining[0].n !== 0) {
    console.error(`\n  [FAIL] ${remaining[0].n} org(s) with prefix ${JSON.stringify(prefix)} still remain after wipe.`)
    process.exit(1)
  }

  console.log(`\n  Removed ${orgs.length} organisation(s). 0 remaining with prefix ${JSON.stringify(prefix)}, verified.\n`)
}

await main()
