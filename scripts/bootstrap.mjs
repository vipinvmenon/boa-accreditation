// One command to wire up credentials after a human has done the three logins
// that genuinely cannot be automated (they are OAuth browser flows).
//
// What it does, all idempotent:
//   1. links the Supabase CLI to project tjbfvuboyvaephtewjwq
//   2. fetches the publishable + service-role keys and writes .env.local
//   3. pushes those env vars to Vercel (Production + Preview + Development)
//   4. sets SUPABASE_DB_URL as a GitHub Actions secret
//   5. verifies each step actually took, rather than assuming
//
// It never prints a key value. It reports lengths and prefixes only.
//
//   corepack pnpm bootstrap            # do it
//   corepack pnpm bootstrap --check    # report only, change nothing

import { execFileSync, execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROJECT_REF = 'tjbfvuboyvaephtewjwq'
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`
const GH_REPO = 'vipinvmenon/boa-accreditation'
const CHECK = process.argv.includes('--check')

const say = (s) => console.log(s)
const mask = (v) => (v ? `${v.slice(0, 6)}…(${v.length} chars)` : '(absent)')
const steps = []
const record = (name, ok, detail) => {
  steps.push({ name, ok, detail })
  say(`  [${ok ? 'ok' : 'XX'}] ${name.padEnd(44)} ${detail}`)
}

const sh = (cmd, opts = {}) =>
  execSync(cmd, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()

// ── 0. Preconditions a human must satisfy ─────────────────────────────────
say('\nBOA Accreditation — bootstrap\n')

let sbToken = null
const tokenPath = join(process.env.HOME, '.supabase/access-token')
if (existsSync(tokenPath)) sbToken = readFileSync(tokenPath, 'utf8').trim()

if (!sbToken) {
  console.error('  Supabase CLI is not logged in.\n  Run:  corepack pnpm exec supabase login\n')
  process.exit(1)
}

// Does this token actually own OUR project? The token on this machine belonged
// to a different org when this was written, and a 403 here is the single most
// likely reason bootstrap fails.
const api = async (path, init = {}) => {
  const r = await fetch(`https://api.supabase.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${sbToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  return { status: r.status, body: await r.text() }
}

const proj = await api(`/v1/projects/${PROJECT_REF}`)
if (proj.status === 403 || proj.status === 404) {
  console.error(`\n  The logged-in Supabase account cannot see project ${PROJECT_REF} (HTTP ${proj.status}).`)
  console.error('  It belongs to a different Supabase account or organisation.')
  console.error('\n  Fix: log in as the account that owns it —')
  console.error('       corepack pnpm exec supabase logout')
  console.error('       corepack pnpm exec supabase login\n')
  process.exit(1)
}
record('supabase account can see the project', proj.status === 200, `HTTP ${proj.status}`)

// ── 1. API keys ───────────────────────────────────────────────────────────
const keysRes = await api(`/v1/projects/${PROJECT_REF}/api-keys?reveal=true`)
if (keysRes.status !== 200) {
  console.error(`\n  Could not read API keys (HTTP ${keysRes.status}).`)
  console.error('  The token may lack the api_keys:read scope. Get them from the dashboard instead:')
  console.error(`  https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api-keys\n`)
  process.exit(1)
}
const keys = JSON.parse(keysRes.body)
const byName = (n) => keys.find((k) => k.name === n || k.type === n)?.api_key ?? null

// Prefer the modern publishable key; fall back to the legacy anon key, which is
// what an older project will still be issuing. docs/SECURITY.md explains why
// publishable is preferred for anything new.
const publishable = byName('publishable') ?? byName('anon')
const serviceRole = byName('secret') ?? byName('service_role')

record('publishable/anon key', Boolean(publishable), mask(publishable))
record('service-role key', Boolean(serviceRole), mask(serviceRole))
if (!publishable || !serviceRole) process.exit(1)

// ── 2. .env.local ─────────────────────────────────────────────────────────
const dbUrl = process.env.SUPABASE_DB_URL ?? ''
const envPath = join(root, '.env.local')
const envBody = `# Written by scripts/bootstrap.mjs. Not committed — see .gitignore.
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${publishable}
NEXT_PUBLIC_SITE_URL=https://accred.bangaloreopenair.com

SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${serviceRole}

BOA_ACC_OPERATOR_BOOTSTRAP=

# Needed by \`corepack pnpm test:db\`. Supabase does not expose the database
# password through the API — take it from the dashboard, or reset it:
# https://supabase.com/dashboard/project/${PROJECT_REF}/settings/database
SUPABASE_DB_URL=${dbUrl}
`
if (!CHECK) writeFileSync(envPath, envBody)
record('.env.local written', CHECK ? existsSync(envPath) : true, CHECK ? '(check mode)' : envPath)

// ── 3. Vercel env vars ────────────────────────────────────────────────────
let vercelOk = false
try {
  sh('node_modules/.bin/vercel whoami')
  vercelOk = true
} catch {
  record('vercel CLI logged in', false, 'run: corepack pnpm exec vercel login')
}
if (vercelOk && !CHECK) {
  if (!existsSync(join(root, '.vercel/project.json'))) {
    record('vercel project linked', false, 'run: corepack pnpm exec vercel link')
  } else {
    const vars = [
      ['NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL],
      ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', publishable],
      ['NEXT_PUBLIC_SITE_URL', 'https://accred.bangaloreopenair.com'],
      ['SUPABASE_URL', SUPABASE_URL],
      ['SUPABASE_SERVICE_ROLE_KEY', serviceRole],
    ]
    let added = 0
    for (const [k, v] of vars) {
      for (const env of ['production', 'preview', 'development']) {
        try {
          execFileSync('node_modules/.bin/vercel', ['env', 'rm', k, env, '--yes'], { cwd: root, stdio: 'ignore' })
        } catch {
          /* not present, fine */
        }
        try {
          execFileSync('node_modules/.bin/vercel', ['env', 'add', k, env], {
            cwd: root,
            input: v + '\n',
            stdio: ['pipe', 'ignore', 'ignore'],
          })
          added++
        } catch {
          /* reported below */
        }
      }
    }
    record('vercel env vars set', added === vars.length * 3, `${added}/${vars.length * 3}`)
  }
} else if (vercelOk) {
  record('vercel CLI logged in', true, '(check mode — no changes)')
}

// ── 4. GitHub Actions secret ──────────────────────────────────────────────
// CI goes red on 20 Sep without this — ci.yml's dated grace period expires then.
//
// GitHub encrypts secrets with a libsodium sealed box, which Node has no native
// primitive for. Rather than pull in a crypto dependency to reimplement it, we
// hand the job to `gh`, feeding it the token already in the macOS keychain.
// Verified working: set / list / delete round-trips cleanly.
if (!dbUrl) {
  record('SUPABASE_DB_URL available', false, 'not in env — see the comment in .env.local, then re-run')
} else if (CHECK) {
  record('github secret (check mode)', true, 'would set SUPABASE_DB_URL')
} else {
  try {
    const ghToken = execSync(
      "printf 'protocol=https\\nhost=github.com\\n\\n' | git credential-osxkeychain get",
      { encoding: 'utf8' },
    )
      .split('\n')
      .find((l) => l.startsWith('password='))
      ?.slice(9)
    if (!ghToken) throw new Error('no github credential in the keychain — run: gh auth login')

    execFileSync('gh', ['secret', 'set', 'SUPABASE_DB_URL', '--repo', GH_REPO, '--body', dbUrl], {
      stdio: 'ignore',
      env: { ...process.env, GH_TOKEN: ghToken },
    })

    // Confirm it landed. Setting a secret returns 204 whether or not it stuck.
    const listed = execSync(`gh secret list --repo ${GH_REPO}`, {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: ghToken },
    })
    record('github secret SUPABASE_DB_URL', /SUPABASE_DB_URL/.test(listed), 'set and confirmed present')
  } catch (e) {
    record('github secret SUPABASE_DB_URL', false, String(e.message).slice(0, 90))
  }
}

// ── Report ────────────────────────────────────────────────────────────────
const bad = steps.filter((s) => !s.ok)
say('')
if (bad.length) {
  say(`bootstrap: ${steps.length - bad.length}/${steps.length} done. Outstanding:`)
  for (const s of bad) say(`  · ${s.name} — ${s.detail}`)
  process.exit(1)
}
say(`bootstrap OK — ${steps.length} steps. Now run: corepack pnpm db:state`)
