// Replaces the 38 `PLACEHOLDER — ` fixture organisations (seeded 14 Sep,
// docs/ORG-IMPORT.md) with the real organisations committed in
// data/orgs.json.
//
// THIS SCRIPT IS DESTRUCTIVE. It deletes rows from the live database. Vipin
// runs this himself — an agent may not write to production here (CLAUDE.md,
// "Never write to production"). Only --dry (the default) has been run by an
// agent; --apply has not.
//
//   node scripts/replace-placeholder-orgs.mjs            # --dry, the default
//   node scripts/replace-placeholder-orgs.mjs --dry       # same, explicit
//   node scripts/replace-placeholder-orgs.mjs --apply     # actually writes
//
// What it does, in order:
//
//   1. DELETE — every `boa_acc_org` row whose name starts with
//      "PLACEHOLDER — ". An org is deleted only if it has **zero** dependent
//      rows: no `boa_acc_person` (which, since every `boa_acc_checkin` and
//      `boa_acc_aaa_nomination` hangs off a person or an org_hint, also means
//      zero check-ins for that org), zero `boa_acc_org_invite`, zero
//      `boa_acc_aaa_nomination` naming it. Anything with dependents is
//      **skipped and reported**, never force-deleted — the placeholder rows
//      were rehearsal fixtures for desk-screen work (docs/ORG-IMPORT.md), and
//      some may by now carry real rehearsal data nobody asked this script to
//      destroy. Deletion goes through `private.boa_acc_wipe_org` — the same
//      function scripts/wipe-orgs.mjs already uses for a prefix — never a raw
//      DELETE, and never touches any row outside that one org's own tables.
//
//   2. CREATE — every organisation listed in data/orgs.json that does not
//      already exist by name, through `public.boa_acc_create_org`, the same
//      RPC POST /api/desk/orgs calls (ADR-019 / ACC-140g: quota is no longer
//      enforced, so this passes the same non-enforcing default the app does —
//      see lib/schemas/org.ts's ORG_QUOTA_NON_ENFORCING). An entry whose
//      contactName/contactPhone is still the literal "TODO" (as
//      data/orgs.json's one committed row currently is) is reported and
//      skipped, never created with invented contact details.
//
// Idempotent either way: an org that already exists by name is left alone,
// never duplicated; a placeholder org already deleted is simply not found
// again. Uses scripts/lib/db.mjs's runSql — the same transport
// (Management API locally, SUPABASE_DB_URL in CI) every other db script uses.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

const PLACEHOLDER_PREFIX = 'PLACEHOLDER — '
const ORG_QUOTA_NON_ENFORCING = 500 // mirrors lib/schemas/org.ts's ORG_QUOTA_NON_ENFORCING

const ORG_KINDS = ['vendor', 'crew', 'sponsor', 'media', 'security', 'contractor']
const PHONE_RE = /^\+91[6-9][0-9]{9}$/

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const explicitDry = args.includes('--dry')
if (apply && explicitDry) {
  console.error('Pass either --dry or --apply, not both.')
  process.exit(2)
}
const mode = apply ? 'apply' : 'dry'

const q = (sql) => runSql(sql, root)

/** Same technique scripts/load-orgs.mjs / scripts/seed-dummy.mjs use to call SECURITY DEFINER RPCs as a real operator's session. */
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

function validateOrgEntry(org, index) {
  const errors = []
  if (typeof org.name !== 'string' || org.name.trim().length < 2 || org.name.trim().length > 120) {
    errors.push('name must be 2-120 characters')
  }
  if (!ORG_KINDS.includes(org.kind)) {
    errors.push(`kind must be one of ${ORG_KINDS.join(', ')}`)
  }
  const contactName = (org.contactName ?? '').trim()
  const contactPhone = (org.contactPhone ?? '').trim()
  const isTodo = (v) => v.toUpperCase() === 'TODO' || v === ''
  const needsContact = isTodo(contactName) || isTodo(contactPhone)
  if (!needsContact) {
    if (contactName.length < 2 || contactName.length > 80) errors.push('contactName must be 2-80 characters')
    if (!PHONE_RE.test(contactPhone)) errors.push('contactPhone must match +91[6-9]XXXXXXXXX')
  }
  return { index, org, errors, needsContact }
}

async function main() {
  const t = describeTransport(root)
  console.log(`\nreplace-placeholder-orgs — ${t.detail} — mode: ${mode}${mode === 'dry' ? ' (default; pass --apply to write)' : ''}\n`)
  if (t.kind === 'none') {
    console.error('No database credential. Run: corepack pnpm exec supabase login')
    process.exit(1)
  }

  const [{ n: countBefore }] = await q('select count(*)::int as n from public.boa_acc_org')
  console.log(`boa_acc_org before: ${countBefore} row(s)\n`)

  // ---------------------------------------------------------------------
  // 1. Delete placeholder orgs with zero dependents.
  // ---------------------------------------------------------------------
  console.log(`--- Deleting "${PLACEHOLDER_PREFIX}" organisations ---\n`)

  const placeholders = await q(
    `select id, name from public.boa_acc_org where name like ${lit(PLACEHOLDER_PREFIX + '%')} order by name`,
  )

  if (placeholders.length === 0) {
    console.log(`  Found 0 organisation(s) with prefix ${JSON.stringify(PLACEHOLDER_PREFIX)}. Nothing to delete.\n`)
  } else {
    console.log(`  Found ${placeholders.length} placeholder organisation(s).\n`)
  }

  let deleted = 0
  let skippedDependent = 0

  for (const org of placeholders) {
    const [{ n: people }] = await q(`select count(*)::int as n from public.boa_acc_person where org_id = '${org.id}'::uuid`)
    const [{ n: invites }] = await q(`select count(*)::int as n from public.boa_acc_org_invite where org_id = '${org.id}'::uuid`)
    const [{ n: nominations }] = await q(
      `select count(*)::int as n from public.boa_acc_aaa_nomination where org_hint = ${lit(org.name)}`,
    )
    const dependents = people + invites + nominations

    if (dependents > 0) {
      skippedDependent++
      console.log(
        `  [skip] ${org.name} — has dependent rows (${people} people, ${invites} invite(s), ${nominations} AAA nomination(s)); not deleted`,
      )
      continue
    }

    if (mode === 'dry') {
      console.log(`  [would delete] ${org.name} — 0 dependents`)
      continue
    }

    await q(`select private.boa_acc_wipe_org(${lit(org.name)})`)
    console.log(`  [deleted] ${org.name}`)
    deleted++
  }

  // ---------------------------------------------------------------------
  // 2. Create the real organisations from data/orgs.json.
  // ---------------------------------------------------------------------
  console.log(`\n--- Creating organisations from data/orgs.json ---\n`)

  const raw = JSON.parse(await readFile(join(root, 'data', 'orgs.json'), 'utf8'))
  const organisations = Array.isArray(raw.organisations) ? raw.organisations : []
  console.log(`  ${organisations.length} organisation(s) listed.\n`)

  let created = 0
  let skippedExisting = 0
  let skippedInvalid = 0

  let operator = null
  if (mode === 'apply' && organisations.length > 0) {
    ;[operator] = await q(`
      select user_id, role, display_name from public.boa_acc_operator
      where active and role in ('lead', 'admin')
      order by role, created_at limit 1
    `)
    if (!operator) {
      console.error('  No active lead/admin operator exists yet — boa_acc_create_org needs one to authorize as. Skipping creation.')
    } else {
      console.log(`  Acting as operator: ${operator.display_name} (${operator.role})\n`)
    }
  }

  for (let i = 0; i < organisations.length; i++) {
    const entry = organisations[i]
    const { errors, needsContact } = validateOrgEntry(entry, i)

    if (errors.length > 0) {
      skippedInvalid++
      console.log(`  [skip] ${entry.name ?? `entry ${i}`} — invalid: ${errors.join('; ')}`)
      continue
    }
    if (needsContact) {
      skippedInvalid++
      console.log(
        `  [skip] ${entry.name} — contactName/contactPhone is still "TODO" in data/orgs.json; fill in the real values before this can be created`,
      )
      continue
    }

    const [existing] = await q(`select id from public.boa_acc_org where name = ${lit(entry.name)}`)
    if (existing) {
      skippedExisting++
      console.log(`  [skip] ${entry.name} — already exists`)
      continue
    }

    if (mode === 'dry') {
      console.log(`  [would create] ${entry.name} (${entry.kind}, default type ${entry.defaultType ?? 'crew'})`)
      continue
    }
    if (!operator) {
      console.log(`  [skip] ${entry.name} — no lead/admin operator available to authorize as`)
      continue
    }

    const [{ id: orgId }] = await asOperator(
      operator.user_id,
      `select public.boa_acc_create_org(
         ${lit(entry.name)}, ${lit(entry.kind)}::public.boa_acc_org_kind, ${ORG_QUOTA_NON_ENFORCING},
         ${lit(entry.contactName)}, ${lit(entry.contactPhone)},
         ${lit(entry.defaultType ?? 'crew')}::public.boa_acc_type_code
       ) as id`,
    )
    console.log(`  [created] ${entry.name} — id ${orgId}`)
    created++
  }

  const [{ n: countAfter }] = await q('select count(*)::int as n from public.boa_acc_org')

  console.log(`\n--- Summary (${mode}) ---`)
  console.log(`  Placeholders: ${deleted} deleted, ${skippedDependent} skipped (dependent rows)`)
  console.log(`  data/orgs.json: ${created} created, ${skippedExisting} skipped (already exists), ${skippedInvalid} skipped (invalid/TODO)`)
  console.log(`  boa_acc_org: ${countBefore} row(s) before -> ${countAfter} row(s) after`)
  if (mode === 'dry') {
    console.log('\n  Nothing was written. Re-run with --apply to make these changes.')
  }
  console.log('')
}

await main()
