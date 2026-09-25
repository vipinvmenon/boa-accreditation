// ACC-145 follow-up · The daily loop, as one command.
//
//   corepack pnpm roster:sync                      # fetch, validate, dry-run
//   corepack pnpm roster:sync --as you@boa.test    # ...and load, if those pass
//
// Runs, in order: scripts/fetch-roster.mjs, then import-roster --offline, then
// --dry. It STOPS there unless --as names an operator, because everything up to
// that point is read-only and the load is not.
//
// Why a script and not three lines in a doc: the sheet keeps changing until the
// form closes (ACC-140e), so this runs many times, and the failure mode of a
// hand-typed sequence is skipping --dry on a busy build day.
//
// Re-running the whole sheet is the sync. public.boa_acc_import_approve is
// idempotent on (org, phone): new decided rows are approved and a pass minted,
// rows already imported come back `unchanged`, and a decision CHANGED after
// someone was approved is reported as `tier_changed` and never applied — a
// person holding a pass never has it silently swapped. Those reports need a
// human; that is the point of them.
//
// Any step failing stops the rest: a --dry that refuses rows must not be
// followed by a load.

import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
function opt(flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1] ?? null
}

const as = opt('--as')
const gid = opt('--gid')
const today = new Date().toISOString().slice(0, 10)
const out = opt('--out') ?? `data/roster-${today}.local.csv`

function run(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', script), ...args], {
      cwd: root,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${script} exited ${code}`))
    })
  })
}

function step(n, total, what) {
  console.log(`\n── ${n}/${total} ${what} ──`)
}

const total = as ? 4 : 3
try {
  step(1, total, 'pull the sheet')
  await run('fetch-roster.mjs', ['--out', out, ...(gid ? ['--gid', gid] : [])])

  step(2, total, 'validate, no database')
  await run('import-roster.mjs', [out, '--offline'])

  step(3, total, 'dry run against the database')
  await run('import-roster.mjs', [out, '--dry'])

  if (!as) {
    console.log(
      '\nRead-only so far — nothing was written.\n' +
        `To load, re-run with the operator who is accountable for it:\n` +
        `  corepack pnpm roster:sync --as <operator-email>\n`,
    )
    process.exit(0)
  }

  step(4, total, `load as ${as}`)
  await run('import-roster.mjs', [out, '--as', as, '--report', `data/report-${today}.local.csv`])
  console.log(
    '\nLoaded. Check the report for `tier_changed` rows — a decision changed after\n' +
      'approval is reported, never applied, and needs a person to resolve it.\n' +
      'Then send passes to anyone newly approved (/desk/passes).',
  )
} catch (cause) {
  console.error(`\nroster:sync stopped: ${cause instanceof Error ? cause.message : String(cause)}`)
  console.error('Nothing further ran. Fix the reported rows, or the sheet, and run it again.')
  process.exit(1)
}
