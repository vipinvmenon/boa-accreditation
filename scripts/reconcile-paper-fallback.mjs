// Cross-checks a paper-fallback roster CSV against the REAL, LIVE database.
//
// scripts/validate-paper-fallback.mjs (validate:paper) only checks the CSV's
// SHAPE — headers, no duplicate pass_ref, no token/credential-like columns.
// Its own doc comment says plainly that it does not query Supabase and does
// not claim any row is actually approved. That leaves a gap: ACC-059 prints
// this CSV to paper as the offline fallback roster, but between "someone
// generated the CSV" and "someone hands it to Bhoopesh at the gate" a person
// can be voided, rejected after approval, or have their role/org/type/day
// changed — and the printout would say something the database no longer
// agrees with. A printed pass is not append-only like the ledger; once it is
// on paper it cannot be corrected by a later row. This script is the gate
// that catches that before ink hits it.
//
// READ-ONLY. It runs a plain `select` against boa_acc_person/boa_acc_org as
// the script's own transport (see scripts/lib/db.mjs) — the same technique
// scripts/db-state.mjs uses to read those tables. No asOperator/set_config,
// no RLS bypass tricks, and nothing here ever writes.
//
//   corepack pnpm validate:paper:live -- path/to/approved-roster.csv

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeTransport, runSql } from './lib/db.mjs'
import { loadPaperFallbackFile } from './validate-paper-fallback.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const FIELDS_THAT_MATTER = ['organisation', 'role', 'type_code', 'day_validity']

function usage() {
  console.error('usage: node scripts/reconcile-paper-fallback.mjs <approved-roster.csv>')
  console.error('       corepack pnpm validate:paper:live -- path/to/approved-roster.csv')
}

async function main() {
  const inputPath = process.argv[2] === '--' ? process.argv[3] : process.argv[2]
  if (!inputPath) {
    usage()
    process.exitCode = 2
    return
  }

  // Step 1: reuse the existing shape validator. No point cross-checking a CSV
  // that is not even well-formed.
  const { rows: csvRows, errors } = await loadPaperFallbackFile(inputPath)
  if (errors.length > 0) {
    console.error('Paper fallback CSV invalid (shape check failed):')
    for (const error of errors) console.error(`  ${error}`)
    process.exitCode = 1
    return
  }
  console.log(`Shape check passed: ${csvRows.length} rows, headers and pass_ref uniqueness OK.\n`)

  // Step 2: ask the live database, not the CSV, what is actually approved
  // right now.
  const transport = describeTransport(root)
  console.log(`Live cross-check — ${transport.detail}`)
  if (transport.kind === 'none') {
    console.error('No database credential. Run: corepack pnpm exec supabase login')
    process.exitCode = 1
    return
  }

  const liveRows = await runSql(
    `select
       p.pass_ref,
       p.full_name,
       p.role_text,
       p.type_code,
       p.day_validity,
       o.name as organisation
     from public.boa_acc_person p
     join public.boa_acc_org o on o.id = p.org_id
     where p.status = 'approved'
     order by p.pass_ref`,
    root,
  )
  console.log(`Live database: ${liveRows.length} currently-approved people.\n`)

  const liveByPassRef = new Map(liveRows.map((row) => [row.pass_ref, row]))
  const csvByPassRef = new Map(csvRows.map((row) => [row.pass_ref, row]))

  // Rows in the CSV whose pass_ref no longer matches a currently-approved
  // person: voided, rejected after approval, or a typo. Printing these hands
  // out a STALE pass.
  const stale = csvRows.filter((row) => !liveByPassRef.has(row.pass_ref))

  // Currently-approved people absent from the CSV entirely: they would be
  // MISSING from the physical printout.
  const missing = liveRows.filter((row) => !csvByPassRef.has(row.pass_ref))

  // Rows present in both but disagreeing on a field that matters for the
  // physical pass: a MISMATCH that would print wrong information.
  const mismatched = []
  for (const csvRow of csvRows) {
    const liveRow = liveByPassRef.get(csvRow.pass_ref)
    if (!liveRow) continue
    const liveAsCsvShape = {
      organisation: liveRow.organisation,
      role: liveRow.role_text,
      type_code: liveRow.type_code,
      day_validity: liveRow.day_validity,
    }
    const differences = FIELDS_THAT_MATTER.filter((field) => {
      const csvValue = (csvRow[field] ?? '').trim()
      const liveValue = (liveAsCsvShape[field] ?? '').trim()
      return csvValue !== liveValue
    })
    if (differences.length > 0) {
      mismatched.push({ pass_ref: csvRow.pass_ref, full_name: csvRow.full_name, differences, csvRow, liveRow })
    }
  }

  console.log('── STALE (in CSV, not currently approved — would print a stale pass) ──')
  if (stale.length === 0) console.log('  (none)')
  else for (const row of stale) console.log(`  ${row.pass_ref}  ${row.full_name}  (${row.organisation})`)

  console.log('\n── MISSING (currently approved, not in CSV — would be left off the printout) ──')
  if (missing.length === 0) console.log('  (none)')
  else for (const row of missing) console.log(`  ${row.pass_ref}  ${row.full_name}  (${row.organisation})`)

  console.log('\n── MISMATCH (in both, but a printed field differs — would print wrong info) ──')
  if (mismatched.length === 0) console.log('  (none)')
  else {
    for (const row of mismatched) {
      console.log(`  ${row.pass_ref}  ${row.full_name}`)
      for (const field of row.differences) {
        console.log(`      ${field}: CSV="${row.csvRow[field] ?? ''}"  live="${(field === 'role' ? row.liveRow.role_text : row.liveRow[field]) ?? ''}"`)
      }
    }
  }

  const problems = stale.length + missing.length + mismatched.length
  console.log('')
  if (problems > 0) {
    console.error(
      `RECONCILE FAILED: ${stale.length} stale, ${missing.length} missing, ${mismatched.length} mismatched ` +
        `out of ${liveRows.length} approved people. Do not print this CSV as-is — regenerate it from the live data.`,
    )
    process.exitCode = 1
    return
  }

  console.log(`RECONCILE OK: ${liveRows.length} approved people, all match the CSV.`)
}

await main()
