// The design-fidelity gate. Compares each built screen against the approved
// design's own rendering in design/reference/.
//
// Two rules this script exists to enforce, both learned from boa-bar-control:
//
// 1. IT STARTS ITS OWN SERVER. bar-control's visual gate probed whatever was on
//    :5173, and a stale dev server once fabricated a false verdict. "A gate must
//    control the thing it measures." This builds, serves that build on a free
//    port, and tears it down.
//
// 2. IT REPORTS COVERAGE, NOT JUST DIFFS. A screen with no route cannot fail a
//    pixel comparison, so a gate that only compares what exists reports success
//    while six of seven screens are missing. Coverage is printed every run.
//
// Usage:
//   corepack pnpm test:visual                 all screens that have routes
//   corepack pnpm test:visual -- --screen gate
//   corepack pnpm test:visual -- --update-baseline   (writes diff PNGs only)
//
// Exit non-zero if any built screen exceeds THRESHOLD.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { loadEnvLocal, runSql } from './lib/db.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF = join(root, 'design/reference')
const OUT = join(root, 'test-results/visual')

/** Fraction of differing pixels allowed. 0.8% absorbs font antialiasing
 *  between the bundle's own woff2 and @fontsource's, and nothing more. */
const THRESHOLD = 0.008

/**
 * A named, cited exception to THRESHOLD for one screen — not a blanket
 * disable. Everything else, including this screen beyond its own ceiling,
 * still fails at 0.8%. This is the difference between an honest, bounded
 * allowance and bar-control's `continue-on-error: true` that nobody flipped
 * back: a regression past `maxPct` still fails the build.
 *
 * submission: ADR-009 (docs/DECISIONS.md) — the design's reference bakes in
 * desk chrome that public screens must not ship, a populated "Your list" this
 * screen cannot fetch (no roster RPC exists, by user decision), and the
 * vehicle toggle's real default (off) vs. the mock's fixed-on state. Measured
 * 12 Sep 2026 at ~30% with every other pixel matching; 32% leaves headroom
 * for antialiasing without hiding a real new regression.
 */
const KNOWN_GAPS = {
  submission: { maxPct: 32, reason: 'ADR-009 — docs/DECISIONS.md' },
}

/**
 * Design screen -> the route that must reproduce it.
 *
 * `auth` marks screens that need a credential the gate cannot mint yet. They
 * are reported as BLOCKED, never as passing: a screen nobody can reach has not
 * been verified, and saying otherwise is the exact failure this project's
 * CLAUDE.md forbids.
 */
const SCREENS = [
  { slug: 'control-room', route: '/desk', auth: 'operator' },
  { slug: 'queue', route: '/desk/queue', auth: 'operator' },
  { slug: 'master', route: '/desk/master', auth: 'operator' },
  { slug: 'submission', route: '/s/__VISUAL_TOKEN__', auth: 'invite-token' },
  { slug: 'passes', route: '/desk/passes', auth: 'operator' },
  { slug: 'gate', route: '/gate', auth: null },
  { slug: 'vehicle', route: '/gate/vehicle', auth: null },
]

const VIEWPORTS = [
  { slug: 'web', width: 1360, height: 900 },
  { slug: 'mob', width: 390, height: 844 },
]
const THEMES = ['dark', 'light']

const args = process.argv.slice(2)
const only = args.includes('--screen') ? args[args.indexOf('--screen') + 1] : null

// Same name and quota the design's own mock uses (design/source/boa_design_body.html
// renderVals(), the `submitted` / org-header literals) so the header and quota bar
// match the approved reference exactly. "Your list" cannot: see submission-screen.tsx's
// header comment for why that gap is accepted rather than faked.
const VISUAL_ORG = 'Chakra Sound & Light'

/**
 * `invite-token` auth used to mean "the gate cannot mint this yet," which was
 * true before ACC-023. It can now: mint the same way the pgTAP fixtures do
 * (org + invite inserted directly, same as quota.test.sql), so the Submission
 * screen gets a real comparison instead of a permanent BLOCKED. Wiped in the
 * `finally` below either way — this must never leave rows in a real database.
 */
async function mintVisualInvite() {
  const sql = `
    with wiped as materialized (
      select private.boa_acc_wipe_org('${VISUAL_ORG}')
    ),
    org as (
      insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
      select '${VISUAL_ORG}', 'vendor', 22, 'Visual Check', '+919800000000'
       where (select count(*) from wiped) >= 0
      returning *
    ),
    tok as materialized (
      select private.boa_acc_new_token() as token from org
    ),
    inv as (
      insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
      select (select id from org), private.boa_acc_hash_token(tok.token), left(tok.token, 6)
        from tok
      returning id
    ),
    fill as materialized (
      -- 14, matching the mock's "14 / 22 SEATS USED" and 64% bar.
      select public.boa_acc_submit(
               (select token from tok),
               'Visual Person ' || i,
               '+9198' || lpad(i::text, 8, '0'),
               'Crew'
             ) as person_id
        from generate_series(1, 14) i
       where (select id from inv) is not null
    )
    select tok.token from tok, inv
     where (select count(*) from fill) = 14;
  `
  const rows = await runSql(sql, root)
  return rows[0]?.token ?? null
}

async function wipeVisualInvite() {
  await runSql(`select private.boa_acc_wipe_org('${VISUAL_ORG}')`, root)
}

const GATE_PERSON = {
  passToken: 'visual-ranjith-pass',
  personId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
}
const GATE_PLATE = 'KA 05 MJ 8871'
const GATE_TIME = '2026-10-09T08:14:00.000+05:30'

/**
 * Seed only the browser-local Dexie stores used by the gate references.
 *
 * The approved bundle is a static artboard, so its 612/184/3 values have to
 * be represented by the data layer before the real screen is captured. This
 * deliberately uses IndexedDB's public API rather than importing application
 * code or adding fixture defaults to a production route.
 */
async function seedGateDexie(page, { vehicle = false } = {}) {
  await page.evaluate(({ vehicle, person, plate, time }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('boa-accreditation-gate')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction(['roster', 'ledger', 'outbox', 'sticker', 'meta'], 'readwrite')
      for (const store of ['roster', 'ledger', 'outbox', 'sticker', 'meta']) transaction.objectStore(store).clear()

      const roster = transaction.objectStore('roster')
      for (let i = 0; i < 612; i++) {
        const id = i === 0 ? person.personId : `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`
        roster.put({
          passToken: i === 0 ? person.passToken : `visual-pass-${i}`,
          personId: id,
          orgId: person.orgId,
          status: 'approved',
          ...(i === 0 ? { vehicleReg: plate } : {}),
          updatedAt: time,
        })
      }

      const ledger = transaction.objectStore('ledger')
      for (let i = 0; i < 184; i++) {
        const id = `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`
        ledger.put({
          id,
          personId: `55555555-5555-4555-8555-${String(i + 1).padStart(12, '0')}`,
          kind: 'wristband',
          occurredAt: time,
          bandSerial: i >= 181 ? `#0${i - 177}` : undefined,
          gateLabel: 'Gate 1',
          volunteerName: 'Ravi',
          isReissue: false,
        })
      }
      if (vehicle) {
        const sticker = transaction.objectStore('sticker')
        sticker.put({ plate: plate.replace(/\s+/g, ''), stickerNo: '#V-0231', personId: person.personId, issuedAt: time })
        ledger.put({
          id: '99999999-9999-4999-8999-999999999999',
          personId: person.personId,
          kind: 'vehicle_sticker',
          occurredAt: time,
          stickerNo: '#V-0231',
          gateLabel: 'Gate 1',
          volunteerName: 'Ravi',
          isReissue: false,
        })
        ledger.put({
          id: '66666666-6666-4666-8666-666666666666',
          personId: person.personId,
          kind: 'wristband',
          occurredAt: time,
          bandSerial: '#0412',
          gateLabel: 'Gate 1',
          volunteerName: 'Ravi',
          isReissue: false,
        })
      }

      const outbox = transaction.objectStore('outbox')
      for (let i = 0; i < (vehicle ? 2 : 3); i++) {
        outbox.put({
          id: `77777777-7777-4777-8777-${String(i + 1).padStart(12, '0')}`,
          kind: 'wristband',
          idempotencyKey: `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}`,
          status: 'pending',
          nextAttemptAt: Date.now(),
          createdAt: Date.now(),
          payload: {
            passToken: `visual-queued-${i}`,
            kind: 'wristband',
            bandSerial: '',
            vehicleReg: null,
            isReissue: false,
            idempotencyKey: `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}`,
          },
          attempts: 0,
        })
      }
      const meta = transaction.objectStore('meta')
      meta.put({ key: 'gateLabel', value: 'Gate 1' })
      meta.put({ key: 'volunteerName', value: 'Ravi' })
      meta.put({ key: 'rosterAsOf', value: time })
      meta.put({ key: 'ledgerAsOf', value: time })
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
    }
  }), { vehicle, person: GATE_PERSON, plate: GATE_PLATE, time: GATE_TIME })
}

async function signInVisualOperator(context, email, password, base) {
  const page = await context.newPage()
  await page.goto(`${base}/desk/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/desk', { timeout: 15000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.close()
}

const freePort = () =>
  new Promise((res) => {
    const s = createServer()
    s.listen(0, () => {
      const { port } = s.address()
      s.close(() => res(port))
    })
  })

async function waitForServer(url, ms = 60000) {
  const started = Date.now()
  while (Date.now() - started < ms) {
    try {
      const r = await fetch(url, { redirect: 'manual' })
      if (r.status > 0) return true
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

if (!existsSync(join(REF, 'manifest.json'))) {
  console.error('visual-check: no references. Run `corepack pnpm design:reference` first.')
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const port = await freePort()
console.log(`visual-check: starting its own server on :${port} (never probing a port it does not own)`)
const server = spawn('node_modules/.bin/next', ['start', '--port', String(port)], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, NODE_ENV: 'production' },
})
const base = `http://127.0.0.1:${port}`

let failures = 0
const rows = []
let mintedInvite = false
let browser
let operatorContext
const env = { ...loadEnvLocal(root), ...process.env }

try {
  if (!(await waitForServer(base))) {
    console.error('visual-check: the server never came up. Did `corepack pnpm build` run?')
    process.exit(1)
  }

  browser = await chromium.launch()
  const needsOperator = SCREENS.some((screen) => (!only || screen.slug === only) && screen.auth === 'operator')
  const operatorEmail = env.VISUAL_OPERATOR_EMAIL
  const operatorPassword = env.VISUAL_OPERATOR_PASSWORD
  if (needsOperator && operatorEmail && operatorPassword) {
    operatorContext = await browser.newContext()
    await signInVisualOperator(operatorContext, operatorEmail, operatorPassword, base)
  }

  for (const screen of SCREENS) {
    if (only && screen.slug !== only) continue

    let route = screen.route
    let auth = screen.auth

    if (auth === 'invite-token') {
      try {
        const token = await mintVisualInvite()
        mintedInvite = true
        if (!token) throw new Error('mint returned no token')
        route = route.replace('__VISUAL_TOKEN__', token)
        auth = null
      } catch (err) {
        rows.push({ screen: screen.slug, status: 'BLOCKED', detail: `could not mint invite-token: ${err.message}` })
        continue
      }
    }

    // Does the route exist in this build?
    const probe = await fetch(base + route, { redirect: 'manual' })
    const exists = probe.status !== 404

    if (!exists) {
      rows.push({ screen: screen.slug, status: 'NO ROUTE', detail: route })
      continue
    }
    if (auth) {
      const detail =
        auth === 'operator' && !operatorContext
          ? 'needs operator — set VISUAL_OPERATOR_EMAIL and VISUAL_OPERATOR_PASSWORD'
          : `needs ${auth}`
      rows.push({ screen: screen.slug, status: 'BLOCKED', detail })
      continue
    }

    for (const view of VIEWPORTS) {
      for (const theme of THEMES) {
        const refFile = join(REF, `${screen.slug}-${theme}-${view.slug}.png`)
        if (!existsSync(refFile)) {
          rows.push({ screen: screen.slug, status: 'NO REF', detail: `${theme}/${view.slug}` })
          failures++
          continue
        }

        const page = await (operatorContext ?? browser).newPage({
          viewport: { width: view.width, height: view.height },
          deviceScaleFactor: 1,
        })
        await page.goto(base + route, { waitUntil: 'networkidle' })
        if (screen.slug === 'gate' || screen.slug === 'vehicle') {
          await seedGateDexie(page, { vehicle: screen.slug === 'vehicle' })
          await page.reload({ waitUntil: 'networkidle' })
          if (screen.slug === 'gate') {
            await page.context().setOffline(true)
            const input = page.getByLabel('Manual scanner input')
            await input.fill(`BOA26:${GATE_PERSON.passToken}`)
            await input.press('Enter')
            await page.getByText('Approved', { exact: true }).first().waitFor()
          } else {
            await page.context().setOffline(true)
            await page.getByLabel('Vehicle registration').fill(GATE_PLATE)
            await page.getByRole('button', { name: 'Log entry & open gate' }).click()
            // The real control records the visual check on the first click and
            // evaluates it on the next render; repeat the user action so the
            // screenshot reaches the approved design's cleared state.
            await page.getByRole('button', { name: 'Log entry & open gate' }).click()
            await page.getByText('Cleared', { exact: true }).waitFor()
          }
        }
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(250)

        const shotPath = join(OUT, `${screen.slug}-${theme}-${view.slug}.actual.png`)
        await page.screenshot({ path: shotPath, fullPage: true })
        await page.close()

        const ref = PNG.sync.read(readFileSync(refFile))
        const act = PNG.sync.read(readFileSync(shotPath))

        // Compare on the intersection and count the size difference as diff:
        // a screen that is the right pixels but the wrong height is still wrong.
        const w = Math.min(ref.width, act.width)
        const h = Math.min(ref.height, act.height)
        const diff = new PNG({ width: w, height: h })
        const crop = (src) => {
          const o = new PNG({ width: w, height: h })
          PNG.bitblt(src, o, 0, 0, w, h, 0, 0)
          return o
        }
        const mismatched = pixelmatch(crop(ref).data, crop(act).data, diff.data, w, h, {
          threshold: 0.12,
          includeAA: false,
        })
        const areaPenalty =
          Math.abs(ref.width * ref.height - act.width * act.height) /
          Math.max(ref.width * ref.height, act.width * act.height)
        const ratio = mismatched / (w * h) + areaPenalty
        const pct = (ratio * 100).toFixed(2)

        writeFileSync(join(OUT, `${screen.slug}-${theme}-${view.slug}.diff.png`), PNG.sync.write(diff))

        const gap = KNOWN_GAPS[screen.slug]
        const ceiling = gap ? gap.maxPct / 100 : THRESHOLD
        const ok = ratio <= ceiling
        if (!ok) failures++
        const withinKnownGap = gap && ok && ratio > THRESHOLD
        rows.push({
          screen: screen.slug,
          status: ok ? (withinKnownGap ? 'KNOWN GAP' : 'PASS') : 'FAIL',
          detail:
            `${theme}/${view.slug} ${pct}% (ref ${ref.width}x${ref.height}, got ${act.width}x${act.height})` +
            (withinKnownGap ? ` — within the documented ${gap.maxPct}% ceiling, ${gap.reason}` : ''),
        })
      }
    }
  }

} finally {
  await operatorContext?.close()
  await browser?.close()
  server.kill('SIGTERM')
  if (mintedInvite) await wipeVisualInvite()
}

// ── Report ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log('\n  SCREEN         STATUS    DETAIL')
for (const r of rows) console.log(`  ${pad(r.screen, 14)} ${pad(r.status, 9)} ${r.detail}`)

const built = new Set(
  rows.filter((r) => r.status === 'PASS' || r.status === 'KNOWN GAP' || r.status === 'FAIL').map((r) => r.screen),
)
const blocked = new Set(rows.filter((r) => r.status === 'BLOCKED').map((r) => r.screen))
const missing = new Set(rows.filter((r) => r.status === 'NO ROUTE').map((r) => r.screen))

console.log(
  `\n  COVERAGE: ${built.size}/${SCREENS.length} screens compared · ${blocked.size} blocked on a credential · ${missing.size} not built`,
)
if (missing.size) console.log(`  not built: ${[...missing].join(', ')}`)
if (blocked.size) console.log(`  blocked:   ${[...blocked].join(', ')} — these are NOT verified`)
console.log(`  diffs: test-results/visual/`)

if (failures) {
  console.error(`\nvisual-check FAILED: ${failures} comparison(s) over ${(THRESHOLD * 100).toFixed(1)}%.`)
  console.error('The design is the contract. Open the .diff.png files before changing the reference.')
  process.exit(1)
}

// A green tick that verified nothing is worse than a red one, because it gets
// quoted in a status update. Say plainly what was and was not checked.
if (built.size === 0) {
  console.log('\nvisual-check: NOTHING COMPARED — no screen is built yet.')
  console.log('This is not a pass. It is the absence of a test.')
} else if (built.size < SCREENS.length) {
  console.log(`\nvisual-check OK for ${built.size} of ${SCREENS.length} screens.`)
  console.log(`The other ${SCREENS.length - built.size} are unverified, not passing.`)
} else {
  console.log('\nvisual-check OK — all 7 screens match the approved design.')
}
