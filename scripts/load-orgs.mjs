// Loads a validated organisation CSV (the ACC-030a shape — see
// docs/ORG-IMPORT.md and scripts/validate-org-import.mjs) into the database
// through the real RPCs, then mints one invite per organisation.
//
// THIS IS NOT THE ACC-030/031 PATH FOR THE REAL 38 ORGANISATIONS.
// docs/ORG-IMPORT.md is explicit: creating a real org and minting its real
// invite is a human action through /desk/orgs, one at a time, so a lead/admin
// reviews each row against Bhoopesh's source before it goes live, and no raw
// token is ever written to a file. This script exists for the same reason
// scripts/seed-dummy.mjs (ACC-035) exists: to put realistic-volume data in
// front of the desk screens — Control room, Master list, Queue, Passes — for
// development and rehearsal, using the same SECURITY DEFINER RPCs the app
// itself calls, never a raw INSERT.
//
// Every organisation this script creates is expected to carry a name prefix
// (default "PLACEHOLDER — ", matching data/orgs-placeholder.csv) so it can
// never be mistaken for a real org, and so scripts/wipe-orgs.mjs can remove
// every row it created by that same prefix before the real 38 are loaded.
//
// Idempotent by name: an organisation whose name already exists is skipped,
// not duplicated or re-invited.
//
// Invite tokens are shown to this script exactly once, same as
// boa_acc_mint_invite's own guarantee to the app. They are written ONLY to
// the --out file (a local CSV, gitignored by default — see .gitignore), never
// to stdout in bulk and never committed.
//
//   node scripts/load-orgs.mjs data/orgs-placeholder.csv --out /tmp/placeholder-invites.csv

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { describeTransport, runSql } from './lib/db.mjs'
import { loadOrgFile } from './validate-org-import.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

function usage() {
  console.error('Usage: node scripts/load-orgs.mjs path/to/organisations.csv --out path/to/invites.csv [--label "..."]')
}

const args = process.argv.slice(2)
const file = args[0]
const outIdx = args.indexOf('--out')
const outFile = outIdx !== -1 ? args[outIdx + 1] : null
const labelIdx = args.indexOf('--label')
const label = labelIdx !== -1 ? args[labelIdx + 1] : 'placeholder load'

if (!file || file.startsWith('--') || !outFile) {
  usage()
  process.exit(2)
}

const t = describeTransport(root)
console.log(`\nload-orgs — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const q = (sql) => runSql(sql, root)

/** Same technique scripts/seed-dummy.mjs uses to call SECURITY DEFINER RPCs as a real operator's session. */
const asOperator = (operatorId, expr) =>
  q(`
  with jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', ${lit(operatorId)}, 'role', 'authenticated')::text,
      true
    ) as claims
  )
  select x.* from jwt, lateral (${expr}) as x
`)

async function main() {
  const { organisations, errors } = await loadOrgFile(resolve(file))
  if (errors.length > 0) {
    console.error('The CSV is not valid — fix it or run `corepack pnpm validate:org-import` first:')
    errors.forEach((e) => console.error(`  ${e}`))
    process.exit(1)
  }

  const [operator] = await q(`
    select user_id, role, display_name from public.boa_acc_operator
    where active and role in ('lead', 'admin')
    order by role, created_at limit 1
  `)
  if (!operator) {
    console.error('No active lead/admin operator exists yet — boa_acc_create_org/mint_invite need one to authorize as.')
    process.exit(1)
  }
  console.log(`Acting as operator: ${operator.display_name} (${operator.role})`)
  console.log(`${organisations.length} organisation(s) in ${file}\n`)

  const results = []
  let created = 0
  let skipped = 0

  for (const org of organisations) {
    const [existing] = await q(`select id from public.boa_acc_org where name = ${lit(org.name)}`)
    if (existing) {
      console.log(`  [skip] ${org.name} — already exists`)
      skipped++
      results.push({ name: org.name, kind: org.kind, quota: org.quota, status: 'skipped (already exists)', url: '' })
      continue
    }

    const [{ id: orgId }] = await asOperator(
      operator.user_id,
      `select public.boa_acc_create_org(
         ${lit(org.name)}, ${lit(org.kind)}::public.boa_acc_org_kind, ${org.quota},
         ${lit(org.contactName)}, ${lit(org.contactPhone)},
         ${org.defaultType ? `${lit(org.defaultType)}::public.boa_acc_type_code` : "'crew'::public.boa_acc_type_code"}
       ) as id`,
    )

    const [invite] = await asOperator(operator.user_id, `select * from public.boa_acc_mint_invite('${orgId}'::uuid, ${lit(label)})`)

    const url = `https://accred.bangaloreopenair.com/s/${invite.token}`
    console.log(`  [ok] ${org.name} — quota ${org.quota} — invite minted`)
    created++
    results.push({ name: org.name, kind: org.kind, quota: org.quota, status: 'created', url })
  }

  const header = 'name,kind,quota,status,invite_url'
  const rows = results.map((r) => [r.name, r.kind, r.quota, r.status, r.url].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
  await writeFile(resolve(outFile), `${[header, ...rows].join('\n')}\n`, 'utf8')

  console.log(`\n${created} created, ${skipped} skipped.`)
  console.log(`Invite links (including raw tokens) written to: ${resolve(outFile)}`)
  console.log('Do not commit that file. Delete it once you are done rehearsing with these links.')
}

await main()
