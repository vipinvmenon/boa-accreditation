// ACC-145 follow-up · Pull the live response sheet straight from Google, so the
// daily loop (docs/OPERATIONS.md) is one command instead of "File ▸ Download ▸
// CSV, find it in ~/Downloads, pass the path".
//
//   node scripts/fetch-roster.mjs                       # default sheet, first tab
//   node scripts/fetch-roster.mjs --gid 1269468503      # a specific tab
//   node scripts/fetch-roster.mjs --out data/x.local.csv
//
// The output path must end in `.local.csv` under `data/`, because
// `/data/*.local.csv` is gitignored and this file holds real names and phone
// numbers. The script refuses any other path rather than trusting the caller
// to remember (non-negotiable #9).
//
// AUTHENTICATION, and why this is not simply a fetch:
//
// On 25 Sep 2026 the sheet was shared `anyone with the link can read`, so an
// unauthenticated GET of the CSV export works. That is a finding, not a
// feature: it means 25 crew members' names and WhatsApp numbers are readable
// by anyone holding the URL. When that is corrected — and it should be — the
// unauthenticated path stops working, which is why the service-account path
// below exists and is preferred.
//
// To use it: create a Google Cloud service account, download its JSON key,
// share the sheet with the service account's email as a Viewer, and put the
// key's path in `.env.local` as GOOGLE_SERVICE_ACCOUNT_KEY_FILE. It is read
// locally and never goes near Vercel: the app has no Google dependency and
// must not gain one. Scope is drive.readonly — this script can read that one
// shared sheet and nothing else, and access is revoked by un-sharing it.
//
// No new npm dependency: the JWT is signed with node:crypto.

import { readFile, writeFile } from 'node:fs/promises'
import { createSign } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The BOA 2026 crew roster (form responses). docs/ROSTER-FORM.md. */
const DEFAULT_FILE_ID = '1i8lwUIDdZ3BNuAN-QsTM0UsHceDXStGmINjb3bIVFXs'

const argv = process.argv.slice(2)
function opt(flag) {
  const i = argv.indexOf(flag)
  return i === -1 ? null : argv[i + 1] ?? null
}

const fileId = opt('--id') ?? DEFAULT_FILE_ID
const gid = opt('--gid')
const today = new Date().toISOString().slice(0, 10)
const out = opt('--out') ?? `data/roster-${today}.local.csv`

if (!/^data\/[^/]+\.local\.csv$/.test(out)) {
  console.error(
    `Refusing to write "${out}". The roster holds real names and phone numbers, so it must be\n` +
      'data/<something>.local.csv, which /data/*.local.csv keeps out of git (non-negotiable #9).',
  )
  process.exit(1)
}

/**
 * A service-account access token, or null when no key is configured.
 * Hand-rolled rather than pulling in googleapis for one request.
 */
async function accessToken() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE
  if (!keyFile) return null
  let key
  try {
    key = JSON.parse(await readFile(resolve(root, keyFile), 'utf8'))
  } catch (cause) {
    console.error(`GOOGLE_SERVICE_ACCOUNT_KEY_FILE is set to "${keyFile}" but could not be read as JSON.`)
    throw cause
  }
  if (!key.client_email || !key.private_key) {
    throw new Error('The service-account key is missing client_email or private_key.')
  }
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const signer = createSign('RSA-SHA256')
  signer.update(body)
  const assertion = `${body}.${signer.sign(key.private_key, 'base64url')}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })
  if (!res.ok) {
    throw new Error(`Google refused the service-account assertion (${res.status}): ${await res.text()}`)
  }
  const json = await res.json()
  if (!json.access_token) throw new Error('Google returned no access_token.')
  return json.access_token
}

const url = new URL(`https://docs.google.com/spreadsheets/d/${fileId}/export`)
url.searchParams.set('format', 'csv')
if (gid) url.searchParams.set('gid', gid)

const token = await accessToken()
const res = await fetch(url, {
  headers: token ? { authorization: `Bearer ${token}` } : {},
  redirect: 'follow',
})

if (!res.ok) {
  console.error(`\nCould not read the sheet (${res.status} ${res.statusText}).`)
  if (!token) {
    console.error(
      'No GOOGLE_SERVICE_ACCOUNT_KEY_FILE is configured, so this was an unauthenticated read.\n' +
        'If the sheet has been restricted (which it should be), set up the service account —\n' +
        'see docs/OPERATIONS.md, "Pulling the sheet".',
    )
  }
  process.exit(1)
}

const csv = await res.text()
if (csv.trimStart().startsWith('<')) {
  // Google answers an unauthorised export with a sign-in HTML page, not a 4xx.
  console.error(
    '\nGoogle returned a sign-in page instead of CSV. The sheet is not readable by this caller.\n' +
      'Set GOOGLE_SERVICE_ACCOUNT_KEY_FILE and share the sheet with that service account as a Viewer.',
  )
  process.exit(1)
}

await writeFile(join(root, out), csv, 'utf8')

const rows = csv.trim().split(/\r?\n/).length - 1
console.log(`\nfetch-roster: ${rows} data row(s) -> ${out}`)
console.log(`  sheet ${fileId}${gid ? ` (gid ${gid})` : ' (first tab)'}`)

if (!token) {
  console.warn(
    '\n  WARNING: read WITHOUT credentials, which only works because the sheet is\n' +
      '  shared "anyone with the link can read". That link exposes every crew\n' +
      "  member's name and WhatsApp number to anyone who has it. Restrict the\n" +
      '  sheet and configure GOOGLE_SERVICE_ACCOUNT_KEY_FILE — see\n' +
      '  docs/OPERATIONS.md, "Pulling the sheet".',
  )
}

console.log('\nNext, in order:')
console.log(`  node scripts/import-roster.mjs ${out} --offline`)
console.log(`  node scripts/import-roster.mjs ${out} --dry`)
console.log(`  node scripts/import-roster.mjs ${out} --as <operator-email>`)
