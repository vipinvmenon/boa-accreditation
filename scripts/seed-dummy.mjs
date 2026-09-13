// ACC-035 · dummy QA data, through the real RPCs only.
//
// Creates 6 organisations named `TEST — <Kind> Co` (one per
// public.boa_acc_org_kind value) and 18 people across them, entirely by
// calling the same SECURITY DEFINER functions the app calls:
//
//   boa_acc_create_org   (lead/admin)
//   boa_acc_mint_invite  (lead/admin)
//   boa_acc_submit       (token-first, no operator needed)
//   boa_acc_nominate_aaa / boa_acc_approve_aaa_nomination  (operator)
//   boa_acc_decide       (any active operator)
//
// No raw INSERT/UPDATE touches boa_acc_org, boa_acc_person or
// boa_acc_aaa_nomination — every row this script creates went through the
// same validation the desk and the public submission screen go through.
// boa_acc_checkin (the append-only gate ledger, non-negotiable #2) is never
// referenced here at all.
//
// STATUSES REACHABLE THROUGH A REAL RPC, AND WHY TWO ARE NOT
//
// public.boa_acc_person_status has five values: draft, submitted, approved,
// rejected, voided. Only three are reachable without touching the table
// directly:
//   - boa_acc_submit always inserts status='submitted' — 'draft' is the
//     column's default, but no shipped RPC ever leaves a row sitting there.
//   - boa_acc_decide moves submitted -> approved or -> rejected.
//   - nothing in supabase/migrations/*.sql moves a person to 'voided' yet
//     (grep confirms it — the word appears only for boa_acc_checkin's own
//     `void` ledger-entry kind, a different enum on a different table).
// This script seeds submitted/approved/rejected only. Faking draft or
// voided with a raw UPDATE would violate "never hand-insert via raw SQL"
// and would also assert a code path that does not exist. Recorded here
// instead — see docs/CURRENT-STATE.md for the same note.
//
// Safe to re-run: if any `TEST — %` org already exists, this is a no-op.
// Run `corepack pnpm wipe:dummy` first to reseed from a clean slate.

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { describeTransport, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Shapes (same rules the database CHECK constraints enforce) ────────────

const ORG_KINDS = ['vendor', 'crew', 'sponsor', 'media', 'security', 'contractor']
const TYPE_CODES = ['crew', 'stage', 'aaa']
const DAY_VALIDITIES = ['build', 'show', 'build_show']
const PHONE_RE = /^\+91[6-9][0-9]{9}$/
const PLATE_RE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/

const orgDefSchema = z.object({
  kind: z.enum(ORG_KINDS),
  quota: z.number().int().min(0).max(500),
  contactName: z.string().trim().min(2).max(80),
  contactPhone: z.string().regex(PHONE_RE),
  overQuota: z.boolean().optional(),
})

const personDefSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().regex(PHONE_RE),
  role: z.string().trim().min(2).max(60),
  vehicleReg: z.string().regex(PLATE_RE).optional(),
  decision: z.enum(['submitted', 'approve', 'reject', 'aaa']),
  type: z.enum(TYPE_CODES).optional(),
  day: z.enum(DAY_VALIDITIES).optional(),
  reason: z.string().min(1).optional(),
})

const TEST_PREFIX = 'TEST — '
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const orgName = (kind) => `${TEST_PREFIX}${cap(kind)} Co`
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── The 6 orgs, one per org_kind, 3 seeded people each (18 total) ─────────
// The vendor org's quota is deliberately smaller than what this script
// tries to submit, so the RPC's own row-locked quota check gets exercised
// for real, not just asserted.

/** @type {Record<string, z.infer<typeof orgDefSchema>>} */
const ORGS = {
  vendor: { kind: 'vendor', quota: 3, contactName: 'Test Vendor Contact', contactPhone: '+919810000001', overQuota: true },
  crew: { kind: 'crew', quota: 5, contactName: 'Test Crew Contact', contactPhone: '+919810000002' },
  sponsor: { kind: 'sponsor', quota: 5, contactName: 'Test Sponsor Contact', contactPhone: '+919810000003' },
  media: { kind: 'media', quota: 5, contactName: 'Test Media Contact', contactPhone: '+919810000004' },
  security: { kind: 'security', quota: 5, contactName: 'Test Security Contact', contactPhone: '+919810000005' },
  contractor: { kind: 'contractor', quota: 5, contactName: 'Test Contractor Contact', contactPhone: '+919810000006' },
}

const phone = (org, person) => `+91982000${String(org).padStart(2, '0')}${String(person).padStart(2, '0')}`

/** @type {Record<string, z.infer<typeof personDefSchema>[]>} */
const PEOPLE = {
  vendor: [
    { name: 'Test Vendor One', phone: phone(1, 1), role: 'Rigger', decision: 'approve', type: 'crew', day: 'show' },
    { name: 'Test Vendor Two', phone: phone(1, 2), role: 'Stagehand', decision: 'approve', type: 'stage', day: 'build' },
    { name: 'Test Vendor Three', phone: phone(1, 3), role: 'Loader', decision: 'submitted' },
  ],
  crew: [
    { name: 'Test Crew One', phone: phone(2, 1), role: 'Backline Tech', decision: 'submitted' },
    { name: 'Test Crew Two', phone: phone(2, 2), role: 'Runner', decision: 'reject', reason: 'Duplicate submission' },
    { name: 'Test Crew Three', phone: phone(2, 3), role: 'FOH Engineer', decision: 'approve', type: 'crew', day: 'build_show' },
  ],
  sponsor: [
    { name: 'Test Sponsor One', phone: phone(3, 1), role: 'Brand Ambassador', decision: 'approve', type: 'stage', day: 'show' },
    { name: 'Test Sponsor Two', phone: phone(3, 2), role: 'VIP Host', decision: 'aaa', day: 'build_show' },
    { name: 'Test Sponsor Three', phone: phone(3, 3), role: 'Coordinator', decision: 'submitted' },
  ],
  media: [
    { name: 'Test Media One', phone: phone(4, 1), role: 'Photographer', decision: 'reject', reason: 'Incomplete accreditation request' },
    { name: 'Test Media Two', phone: phone(4, 2), role: 'Videographer', decision: 'approve', type: 'crew', day: 'build' },
    { name: 'Test Media Three', phone: phone(4, 3), role: 'Reporter', decision: 'approve', type: 'stage', day: 'build_show' },
  ],
  security: [
    { name: 'Test Security One', phone: phone(5, 1), role: 'Gate Marshal', decision: 'approve', type: 'crew', day: 'show', vehicleReg: 'KA01AB1234' },
    { name: 'Test Security Two', phone: phone(5, 2), role: 'Patrol', decision: 'submitted', vehicleReg: 'KA02CD5678' },
    { name: 'Test Security Three', phone: phone(5, 3), role: 'Supervisor', decision: 'reject', reason: 'Background check pending' },
  ],
  contractor: [
    { name: 'Test Contractor One', phone: phone(6, 1), role: 'Electrician', decision: 'approve', type: 'stage', day: 'build' },
    { name: 'Test Contractor Two', phone: phone(6, 2), role: 'Carpenter', decision: 'approve', type: 'crew', day: 'show' },
    { name: 'Test Contractor Three', phone: phone(6, 3), role: 'Plumber', decision: 'submitted' },
  ],
}

// Validate the fixtures themselves before touching the database — the same
// "Zod at every boundary" rule the app code follows.
for (const [key, def] of Object.entries(ORGS)) orgDefSchema.parse(def, { path: [key] })
for (const [key, people] of Object.entries(PEOPLE)) for (const p of people) personDefSchema.parse(p, { path: [key] })

// ── DB plumbing ─────────────────────────────────────────────────────────

const t = describeTransport(root)
console.log(`\nseed:dummy — ${t.detail}\n`)
if (t.kind === 'none') {
  console.error('No database credential. Run: corepack pnpm exec supabase login')
  process.exit(1)
}

const q = (sql) => runSql(sql, root)

/**
 * Runs `sql` as if an active operator's session were making the call, by
 * setting request.jwt.claims for the duration of one statement — the exact
 * technique supabase/tests/*.test.sql already uses to exercise
 * SECURITY DEFINER RPCs that check `(select auth.uid())`. This is not a
 * bypass: private.boa_acc_is_operator() still runs its real check against
 * boa_acc_operator for whatever uuid is set here.
 */
const asOperator = (operatorId, expr) => q(`
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
  const existing = await q(`select count(*)::int as n from public.boa_acc_org where name like ${lit(TEST_PREFIX + '%')}`)
  if (existing[0].n > 0) {
    console.log(`  ${existing[0].n} TEST — org(s) already exist. Not touching anything.`)
    console.log('  Run `corepack pnpm wipe:dummy` first to reseed from a clean slate.\n')
    return
  }

  const [operator] = await q(`
    select user_id, role, display_name from public.boa_acc_operator
    where active and role in ('lead', 'admin')
    order by role, created_at limit 1
  `)
  if (!operator) {
    console.error('  No active lead/admin operator exists yet. boa_acc_create_org/mint_invite/decide')
    console.error('  need a real operator row to authorize as — seed one first (see docs/SETUP.md).')
    process.exit(1)
  }
  console.log(`  Acting as operator: ${operator.display_name} (${operator.role})\n`)
  const opId = operator.user_id

  let orgCount = 0
  let personCount = 0

  for (const [key, org] of Object.entries(ORGS)) {
    const name = orgName(org.kind)
    const [{ id: orgResult }] = await asOperator(
      opId,
      `select public.boa_acc_create_org(
         ${lit(name)}, ${lit(org.kind)}::public.boa_acc_org_kind, ${org.quota},
         ${lit(org.contactName)}, ${lit(org.contactPhone)}, 'crew'::public.boa_acc_type_code
       ) as id`,
    )
    const orgId = orgResult
    orgCount++

    const [invite] = await asOperator(
      opId,
      `select * from public.boa_acc_mint_invite('${orgId}'::uuid, 'ACC-035 seed')`,
    )
    const token = invite.token

    for (const person of PEOPLE[key]) {
      const [{ id: personId }] = await q(`
        select public.boa_acc_submit(
          ${lit(token)}, ${lit(person.name)}, ${lit(person.phone)}, ${lit(person.role)},
          ${person.vehicleReg ? lit(person.vehicleReg) : 'null'}
        ) as id
      `)
      personCount++

      if (person.decision === 'submitted') {
        continue
      }

      if (person.decision === 'reject') {
        await asOperator(opId, `select public.boa_acc_decide('${personId}'::uuid, false, null, null, ${lit(person.reason)})`)
        continue
      }

      if (person.decision === 'approve') {
        await asOperator(
          opId,
          `select public.boa_acc_decide(
             '${personId}'::uuid, true, ${lit(person.type)}::public.boa_acc_type_code, ${lit(person.day)}::public.boa_acc_day_validity, null
           )`,
        )
        continue
      }

      if (person.decision === 'aaa') {
        const [nomination] = await asOperator(
          opId,
          `select * from public.boa_acc_nominate_aaa(${lit(person.name)}, ${lit(person.phone)}, ${lit(orgName(org.kind))})`,
        )
        await asOperator(opId, `select public.boa_acc_approve_aaa_nomination('${nomination.id}'::uuid)`)
        await asOperator(
          opId,
          `select public.boa_acc_decide(
             '${personId}'::uuid, true, 'aaa'::public.boa_acc_type_code, ${lit(person.day)}::public.boa_acc_day_validity, null
           )`,
        )
      }
    }

    console.log(`  [ok] ${name} — quota ${org.quota}, ${PEOPLE[key].length} people`)

    // ── The over-quota proof ────────────────────────────────────────────
    // The vendor org's 3 seeded people already fill its quota=3 ceiling.
    // Submit one more against the SAME live token and confirm the RPC — not
    // this script — refuses it.
    if (org.overQuota) {
      const overflowPhone = phone(1, 9)
      let refused = false
      let errorMessage = ''
      try {
        await q(`
          select public.boa_acc_submit(
            ${lit(token)}, 'Test Vendor Overflow', ${lit(overflowPhone)}, 'Extra Hand', null
          ) as id
        `)
      } catch (e) {
        refused = true
        errorMessage = e.message
      }
      const [{ n: usedAfter }] = await q(
        `select count(*)::int as n from public.boa_acc_person where org_id = '${orgId}'::uuid and status <> 'voided'`,
      )
      if (!refused) {
        console.error(`  [FAIL] over-quota submission to ${name} was NOT refused — RPC quota enforcement is broken.`)
        process.exit(1)
      }
      if (!/quota_exceeded/.test(errorMessage)) {
        console.error(`  [FAIL] over-quota submission was refused, but not with quota_exceeded: ${errorMessage}`)
        process.exit(1)
      }
      if (usedAfter !== org.quota) {
        console.error(`  [FAIL] ${name} has ${usedAfter} non-voided people, expected exactly quota=${org.quota} — the refused row leaked in.`)
        process.exit(1)
      }
      console.log(`  [ok] over-quota submit to ${name} correctly refused: ${errorMessage} (still ${usedAfter}/${org.quota})`)
    }
  }

  console.log(`\n  Created ${orgCount} TEST — orgs, ${personCount} people, through the real RPCs.`)
  if (orgCount !== 6 || personCount !== 18) {
    console.error(`  [FAIL] expected 6 orgs / 18 people, got ${orgCount} / ${personCount}.`)
    process.exit(1)
  }
  console.log('  6 TEST — orgs, 18 people, one real quota_exceeded rejection. Verify with `corepack pnpm db:state`.\n')
}

await main()
