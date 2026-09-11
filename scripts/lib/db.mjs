// One way to talk to the database, used by db-test, db-state and db-push.
//
// TWO TRANSPORTS, on purpose:
//
//  1. Supabase Management API (`/database/query`) — the default locally. It runs
//     SQL as `postgres` authenticated by the CLI token already in the macOS
//     keychain, so no database password has to exist on this machine at all.
//     Verified: multi-statement transactions work, `set local role authenticated`
//     works (essential for testing RLS as a client role), and rollback is clean.
//
//  2. node-postgres over SUPABASE_DB_URL — used when that env var is set, which
//     is how CI runs.
//
// Why not use the management token in CI too: an `sbp_` token can create and
// delete ANY project in the account and read every key. SUPABASE_DB_URL is
// scoped to one database. CI gets the narrow credential; a developer's own
// machine already holds the broad one.

import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PROJECT_REF = 'tjbfvuboyvaephtewjwq'

/** .env.local, without pulling in a dotenv dependency. */
export function loadEnvLocal(root) {
  const p = join(root, '.env.local')
  if (!existsSync(p)) return {}
  const out = {}
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    out[t.slice(0, i)] = t.slice(i + 1).replace(/^["']|["']$/g, '')
  }
  return out
}

/** keychain -> file -> env. The current CLI stores it in the macOS keychain. */
export function supabaseToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim()
  try {
    const t = execSync('security find-generic-password -s "Supabase CLI" -w', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (t) return t
  } catch {
    /* not macOS, or not logged in */
  }
  const p = join(process.env.HOME ?? '', '.supabase/access-token')
  if (existsSync(p)) {
    const t = readFileSync(p, 'utf8').trim()
    if (t) return t
  }
  return null
}

/**
 * A placeholder that was pasted literally rather than substituted. This has
 * happened once already ("<the value you put in Vercel>"), and it fails later
 * as an unresolvable-host DNS error that looks like a network problem.
 */
export function looksLikePlaceholder(v) {
  return !v || /[<\[](your|the|password|host|ref)/i.test(v) || v.includes('YOUR-PASSWORD')
}

export function describeTransport(root) {
  const env = { ...loadEnvLocal(root), ...process.env }
  const url = env.SUPABASE_DB_URL
  if (url && !looksLikePlaceholder(url)) return { kind: 'postgres', detail: 'SUPABASE_DB_URL' }
  if (url && looksLikePlaceholder(url))
    return { kind: 'management', detail: 'management API (SUPABASE_DB_URL is an unsubstituted placeholder)' }
  const t = supabaseToken()
  if (t) return { kind: 'management', detail: 'management API (Supabase CLI token)' }
  return { kind: 'none', detail: 'no credential — run `corepack pnpm exec supabase login`' }
}

/**
 * Run SQL. Returns an array of result rows for the LAST statement that produced
 * any, matching what both transports naturally give back.
 */
export async function runSql(sql, root, opts = {}) {
  const env = { ...loadEnvLocal(root), ...process.env }
  const url = env.SUPABASE_DB_URL

  if (url && !looksLikePlaceholder(url)) {
    const { default: pg } = await import('pg')
    const client = new pg.Client({ connectionString: url })
    await client.connect()
    try {
      // Transaction pooler reuses sessions. pgTAP stores the plan in
      // session state, so a second file (or a second test:db run) on the
      // same pooled backend raises "You tried to plan twice!".
      if (opts.resetSession) await client.query('discard all')
      const res = await client.query(sql)
      const last = Array.isArray(res) ? res[res.length - 1] : res
      return last?.rows ?? []
    } finally {
      await client.end()
    }
  }

  const token = supabaseToken()
  if (!token) throw new Error('no database credential. Run: corepack pnpm exec supabase login')

  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const text = await r.text()
  if (!r.ok) {
    let msg = text
    try {
      const j = JSON.parse(text)
      msg = j.message ?? j.error ?? text
    } catch {
      /* keep raw */
    }
    const err = new Error(msg)
    err.status = r.status
    throw err
  }
  try {
    return JSON.parse(text)
  } catch {
    return []
  }
}
