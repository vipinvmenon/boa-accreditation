// ACC-117 / ACC-141 · Validate the roster form's response sheet, then import
// it and approve what the desk decided in column I.
//
//   node scripts/import-roster.mjs responses.csv --offline            # validate only, no database at all
//   node scripts/import-roster.mjs responses.csv --dry                # + read-only organisation match
//   node scripts/import-roster.mjs responses.csv --as you@example.com [--report out.local.csv]
//
// Options: --aliases path (default data/org-aliases.json: misspelt
// Organisation answers → canonical org name), --partial (load the valid,
// matched rows even when some rows are invalid or name an unknown
// organisation).
//
// The CSV is the response sheet exported as-is (File ▸ Download ▸ CSV), header
// exactly as docs/ROSTER-FORM.md, optionally with the desk's column I. Parsing
// and validation live in lib/roster-import.ts (Node runs it directly with type
// stripping, Node ≥ 22.18 / 23.6); this file does only I/O.
//
// Loading goes through public.boa_acc_import_approve — one call per
// organisation — as the session of the operator named by --as, who must be an
// active lead/admin (the database checks). The database decides everything
// that matters: column I filled → approved and a pass minted there; blank →
// submitted; duplicate phones refused; a changed decision on an approved
// person reported, never applied. Re-running the same file is safe: rows
// already imported come back `unchanged`.
//
// The report file holds row numbers, organisation, outcome and reason — never a
// name or a phone. Name it *.local.csv under data/ and it is gitignored.

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { describeTransport, runSql } from './lib/db.mjs'
import {
  IMPORT_OUTCOMES,
  importApproveSql,
  importResultSchema,
  matchOrganisations,
  orgKey,
  parseOrgAliases,
  reconcileOrganisations,
  resolveOrganisation,
  toRpcPayload,
  validateRoster,
} from '../lib/roster-import.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const MAX_ROWS_PER_CALL = 1000 // the RPC's own cap

function usage() {
  console.error(
    'Usage: node scripts/import-roster.mjs responses.csv (--offline | --dry | --as operator@email) ' +
      '[--aliases data/org-aliases.json] [--report data/roster-import.local.csv] [--partial] [--no-create-orgs]',
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
const noCreateOrgs = args.includes('--no-create-orgs')
const asEmail = opt('--as')
const aliasFile = opt('--aliases') ?? join(root, 'data/org-aliases.json')
const reportFile = opt('--report')

if (!file || file.startsWith('--') || (!dry && !asEmail)) {
  usage()
  process.exit(2)
}

const orgRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: z.string(),
  live: z.coerce.number().int(),
})

const zeroTotals = () => Object.fromEntries(IMPORT_OUTCOMES.map((o) => [o, 0]))

async function main() {
  const aliases = parseOrgAliases(JSON.parse(await readFile(resolve(aliasFile), 'utf8')))
  const v = validateRoster(await readFile(resolve(file), 'utf8'))

  if (v.fatal) {
    console.error(v.fatal)
    process.exit(1)
  }

  const decided = v.rows.length - v.undecided.length
  console.log(`\nimport-roster — ${file}`)
  console.log('Timestamps are read as Asia/Kolkata (the sheet exports M/D/YYYY with no zone).')
  console.log(`${v.rows.length} valid row(s): ${decided} decided in column I (to approve), ${v.undecided.length} undecided (to import as submitted).`)
  console.log(`${v.duplicates.length} repeat submission(s) skipped.`)
  console.log(`${v.errors.length} refused row(s). Organisation aliases: ${aliases.size} from ${aliasFile}`)
  for (const e of v.errors) console.log(`  [refused] row ${e.row_no} (${e.organisation || 'no organisation'}): ${e.errors.join('; ')}`)
  for (const w of v.warnings) console.log(`  [note] ${w}`)

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
      `select o.id, o.name, o.status::text as status,
              (select count(*) from public.boa_acc_person p
                where p.org_id = o.id and p.status <> 'voided')::integer as live
         from public.boa_acc_org o
        order by o.name`,
      root,
    ),
  )
  let match = matchOrganisations(v.rows, orgs, aliases)
  const info = new Map(orgs.map((o) => [o.id, o]))

  // ACC-194: an answer that matched no org and no alias is matched loosely, or
  // becomes a new organisation. Every decision is printed. --no-create-orgs
  // restores the old rule (report by row, never guess).
  const newOrgs = new Map() // pseudo id → { name, rows }
  if (match.unmatched.size > 0 && !noCreateOrgs) {
    const rec = reconcileOrganisations(match.unmatched, orgs.map((o) => o.name))
    const extended = new Map(aliases)
    for (const m of rec.merges) {
      extended.set(orgKey(m.from), m.to)
      console.log(`  [merged] "${m.from}" → "${m.to}" (${m.how}) — rows ${m.row_nos.join(', ')}`)
    }
    const orgsPlus = [...orgs]
    for (const c of rec.creations) {
      const id = `new:${c.name}`
      for (const sp of c.spellings) extended.set(orgKey(sp), c.name)
      orgsPlus.push({ id, name: c.name })
      info.set(id, { id, name: c.name, status: 'open', live: 0 })
      newOrgs.set(id, c.name)
      console.log(`  [new org] "${c.name}" ${dry ? 'would be created' : 'will be created'} — rows ${c.row_nos.join(', ')}${c.spellings.length > 1 ? ` (spellings: ${c.spellings.map((x) => `"${x}"`).join(', ')})` : ''}`)
    }
    match = matchOrganisations(v.rows, orgsPlus, extended)
    for (const r of rec.refused) console.log(`  [refused org] "${r.name}" ${r.why} — rows ${r.row_nos.join(', ')}`)
  }
  const { groups, unmatched, aliased } = match

  for (const a of aliased) console.log(`  [alias] row ${a.row_no}: "${a.from}" → "${a.to}"`)
  for (const [name, rows] of unmatched) {
    const r = resolveOrganisation(name, aliases)
    const why = r.aliased
      ? `is an alias of "${r.name}", which is not a boa_acc_org yet (the admin creates it)`
      : 'is neither a boa_acc_org name nor an alias'
    console.log(`  [unmatched] "${name}" ${why} — rows ${rows.join(', ')}`)
  }
  console.log('')
  for (const g of groups) {
    const o = info.get(g.org.id)
    const n = g.rows.filter((r) => r.type_code !== null).length
    const flag = o?.status !== 'open' ? `  CLOSED (${o?.status}) — the import will refuse this org` : ''
    console.log(`  ${g.org.name}: ${g.rows.length} row(s), ${n} decided; ${o?.live ?? '?'} already on the roster${flag}`)
  }

  if (dry) {
    console.log('\n--dry: nothing was written. Approvals, duplicates and changed tiers are final only when the database decides them.')
    process.exit(v.errors.length > 0 || unmatched.size > 0 ? 1 : 0)
  }

  if ((v.errors.length > 0 || unmatched.size > 0) && !partial) {
    console.error('\nRefusing to load: some rows are refused or name an unknown organisation. Fix the sheet or data/org-aliases.json, or pass --partial to load only the valid, matched rows.')
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
    console.error(`${asEmail} is not an active lead/admin operator. Importing and approving is lead/admin work.`)
    process.exit(1)
  }
  console.log(`\nActing as ${asEmail} (${operator.role})`)

  // Create the new organisations first, as the operator; the database checks
  // lead/admin. The contact is the organisation's first person in the sheet
  // (data already collected); quota is the column's maximum, because there are
  // no quotas (ACC-140g).
  for (const g of groups) {
    if (!newOrgs.has(g.org.id)) continue
    const first = [...g.rows].sort((a, b) => a.row_no - b.row_no)[0]
    try {
      const [made] = await runSql(
        `with jwt as materialized (
           select set_config('request.jwt.claims',
             json_build_object('sub', ${lit(operator.user_id)}, 'role', 'authenticated')::text, true) as claims
         )
         select public.boa_acc_create_org(${lit(g.org.name)}, 'crew'::public.boa_acc_org_kind, 500,
                ${lit(first.full_name)}, ${lit(first.phone)}, 'crew'::public.boa_acc_type_code)::text as id
           from jwt`,
        root,
      )
      g.org = { id: z.string().uuid().parse(made.id), name: g.org.name }
      console.log(`  [created] organisation "${g.org.name}"`)
    } catch (e) {
      console.log(`  [failed] could not create "${g.org.name}": ${e instanceof Error ? e.message : e} — its rows are not loaded`)
      g.rows = []
    }
  }

  const report = []
  const totals = zeroTotals()
  for (const g of groups) {
    if (g.rows.length === 0) continue
    const payload = toRpcPayload(g.rows)
    for (let i = 0; i < payload.length; i += MAX_ROWS_PER_CALL) {
      const chunk = payload.slice(i, i + MAX_ROWS_PER_CALL)
      let results
      try {
        const rows = await runSql(importApproveSql(operator.user_id, g.org.id, chunk), root)
        results = z.array(importResultSchema).parse(rows)
      } catch (e) {
        console.log(`  [failed] ${g.org.name}: ${e instanceof Error ? e.message : e} — nothing loaded for this organisation`)
        for (const r of chunk) report.push([r.row_no, g.org.name, 'not_loaded', e instanceof Error ? e.message : String(e)])
        continue
      }
      const c = zeroTotals()
      for (const r of results) {
        c[r.outcome] += 1
        totals[r.outcome] += 1
        report.push([r.row_no, g.org.name, r.outcome, r.detail ?? ''])
        if (!['inserted', 'approved', 'unchanged'].includes(r.outcome)) {
          console.log(`    row ${r.row_no}: ${r.outcome}${r.detail ? ` — ${r.detail}` : ''}`)
        }
      }
      console.log(`  ${g.org.name}: ${IMPORT_OUTCOMES.filter((o) => c[o] > 0).map((o) => `${c[o]} ${o}`).join(', ')}`)
    }
  }
  for (const e of v.errors) report.push([e.row_no, e.organisation, 'refused_by_validator', e.errors.join('; ')])
  for (const d of v.duplicates) report.push([d.row_no, d.organisation, 'duplicate_submission', `same phone as row ${d.duplicate_of}`])
  for (const [name, rows] of unmatched) for (const n of rows) report.push([n, name, 'unmatched_organisation', ''])

  console.log(`\nTotal: ${IMPORT_OUTCOMES.map((o) => `${totals[o]} ${o}`).join(', ')}.`)
  if (totals.tier_changed > 0) {
    console.log(`${totals.tier_changed} approved person(s) have a different decision in the sheet now. Not applied — the desk decides.`)
  }

  if (reportFile) {
    const csv = [['row', 'organisation', 'outcome', 'detail'], ...report.sort((a, b) => a[0] - b[0])]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    await writeFile(resolve(reportFile), `${csv}\n`, 'utf8')
    console.log(`Per-row report (no names or phones): ${resolve(reportFile)}`)
  }
}

await main()
