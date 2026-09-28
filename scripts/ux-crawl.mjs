// UX-audit screenshot crawl (round 2). Re-runnable, deterministic, mocked-data
// only. NEVER touches production Supabase and NEVER shows a real person's
// name or a live scannable QR — every payload below is invented fixture data,
// following the same pattern as scripts/visual-check.mjs (desk screens via
// page.route() against /api/desk/*, gate via a seeded Dexie cache) and
// tests/e2e/pass-page.spec.ts (a fixture-only PostgREST stub for /p/[token],
// which is a Server Component calling Supabase in-process and so cannot be
// touched by page.route()).
//
// Usage:
//   corepack pnpm build
//   SUPABASE_URL=http://127.0.0.1:4312 SUPABASE_SERVICE_ROLE_KEY=e2e-fixture-service-role-key \
//     node_modules/.bin/next start -p 4321 &
//   BASE_URL=http://127.0.0.1:4321 node scripts/ux-crawl.mjs
//
// Writes docs/ux-audit/screens-r2/*.png and a manifest.json the README is
// built from. Does not start or stop the app server itself (the caller's
// job, so this can point at any already-running build) — but it DOES start
// its own fixture PostgREST stub on :4312 for /p/[passToken], and tears that
// down when finished.

import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as desk from './visual-fixtures/desk.mjs'
import { FONT_STABLE_ARGS } from './lib/browser.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'docs/ux-audit/screens-r2')
mkdirSync(OUT, { recursive: true })

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321'
const PASS_STUB_PORT = 4312

// ── /p/[passToken] fixture stub ─────────────────────────────────────────────
// Mirrors tests/e2e/pass-page.spec.ts: resolvePassView() calls
// boa_acc_pass_view via the service-role client IN THE NODE PROCESS, which is
// one POST to SUPABASE_URL/rest/v1/rpc/boa_acc_pass_view. page.route() cannot
// see this (it never leaves the server), so a tiny PostgREST-shaped HTTP
// server stands in for it. Same fixed port and fixture-only credentials the
// e2e suite uses; the app server this script points at must already be
// started with SUPABASE_URL=http://127.0.0.1:4312.
const CREW_TOKEN = 'uxCrewPassToken0000000'.slice(0, 22)
const STAGE_TOKEN = 'uxStagePassToken000000'.slice(0, 22)
const AAA_TOKEN = 'uxAaaPassToken00000000'.slice(0, 22)
const VOIDED_TOKEN = 'uxVoidedPassToken00000'.slice(0, 22)
const INVALID_TOKEN = 'not-a-real-token' // wrong shape entirely — never reaches the stub

for (const t of [CREW_TOKEN, STAGE_TOKEN, AAA_TOKEN, VOIDED_TOKEN]) {
  if (!/^[A-Za-z0-9_-]{22}$/.test(t)) throw new Error(`ux-crawl: fixture token "${t}" is not the 22-char shape passTokenParamSchema requires`)
}

const PASS_FIXTURES = {
  [CREW_TOKEN]: {
    fullName: 'Fixture Crew Member',
    role: 'Working crew',
    vehicleReg: null,
    orgName: 'Fixture Rigging Co',
    passRef: 'BOA26-9001',
    typeCode: 'crew',
    dayValidity: 'build_show',
  },
  [STAGE_TOKEN]: {
    fullName: 'Fixture Stage Tech',
    role: 'Stage tech, build and show',
    vehicleReg: 'KA05UX0001',
    orgName: 'Fixture Sound & Light',
    passRef: 'BOA26-9002',
    typeCode: 'stage',
    dayValidity: 'show',
  },
  [AAA_TOKEN]: {
    fullName: 'Fixture Accreditation Lead',
    role: 'Accreditation lead',
    vehicleReg: 'KA01UX0002',
    orgName: 'Fixture Production Core',
    passRef: 'BOA26-9003',
    typeCode: 'aaa',
    dayValidity: 'build_show',
  },
  // VOIDED_TOKEN deliberately absent — boa_acc_pass_view raises the SAME
  // 'not found' for an unknown, voided or merely-submitted token
  // (docs/SECURITY.md: distinguishing them would let a caller enumerate
  // which tokens exist), so a voided pass and an unknown one render
  // byte-identically. That is documented in the README, not treated as
  // a bug in this script.
}

function startPassStub() {
  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rest/v1/rpc/boa_acc_pass_view') {
      const chunks = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        let token
        try {
          token = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')['p_token']
        } catch {
          token = undefined
        }
        res.setHeader('Content-Type', 'application/json')
        const fixture = PASS_FIXTURES[token]
        if (fixture) {
          res.writeHead(200)
          res.end(JSON.stringify(fixture))
          return
        }
        res.writeHead(400)
        res.end(JSON.stringify({ message: 'not found', code: 'P0002' }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  return new Promise((resolve) => server.listen(PASS_STUB_PORT, '127.0.0.1', () => resolve(server)))
}

// ── Desk fixture installer ──────────────────────────────────────────────────
// GETs only, exactly like visual-check.mjs's installDeskFixtures — a write
// the screen attempts falls through to the real server, which refuses it
// without a session. `overrides` lets a scenario swap in an empty payload or
// a 500 for exactly one endpoint without duplicating the whole installer.
async function installDeskFixtures(page, overrides = {}) {
  const passesPayload = overrides.passes ?? (await desk.passesFor())
  const send = (name, body, status = 200) => (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (status !== 200) return route.fulfill({ status, json: { error: overrides[`${name}ErrorCode`] ?? 'internal' } })
    return route.fulfill({ json: body })
  }
  await page.route(/\/api\/desk\/dashboard(\?|$)/, send('dashboard', overrides.dashboard ?? desk.dashboard, overrides.dashboardStatus))
  await page.route(/\/api\/desk\/operators(\?|$)/, send('operators', overrides.operators ?? desk.operators, overrides.operatorsStatus))
  await page.route(/\/api\/desk\/orgs(\?|$)/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (overrides.orgsStatus && overrides.orgsStatus !== 200) {
      return route.fulfill({ status: overrides.orgsStatus, json: { error: 'internal' } })
    }
    if (overrides.orgsMalformed) return route.fulfill({ json: {} }) // triggers app/error.tsx — see README
    return route.fulfill({ json: overrides.orgs ?? { orgs: DEFAULT_ORGS } })
  })
  await page.route(/\/api\/desk\/master(\?|$)/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    if (overrides.masterStatus && overrides.masterStatus !== 200) {
      return route.fulfill({ status: overrides.masterStatus, json: { error: 'internal' } })
    }
    if (overrides.masterByOrg) {
      const params = new URL(route.request().url()).searchParams
      const org = params.get('org') ?? ''
      const inBms = params.get('in_bms')
      const byOrg = org ? overrides.masterByOrg[org] ?? [] : overrides.masterByOrg.__all__
      const rows = inBms === 'true' || inBms === 'false' ? byOrg.filter((r) => r.inBms === (inBms === 'true')) : byOrg
      return route.fulfill({ json: { rows, total: overrides.masterByOrg.__all__.length } })
    }
    return route.fulfill({ json: overrides.master ?? desk.master })
  })
  await page.route(/\/api\/desk\/passes\/send(\?|$)/, send('passesSend', overrides.passesSend ?? { canSend: true, configured: true, people: [] }, overrides.passesSendStatus))
  await page.route(/\/api\/desk\/passes(\?|$)/, send('passes', overrides.passesStatus ? undefined : { passes: passesPayload.passes ?? passesPayload }, overrides.passesStatus))
}

// A second organisation, since /desk/orgs's own screenshot only needs the
// design's 7-org fixture (desk.dashboard.orgs shape differs from
// orgRowWithCountsSchema, so /api/desk/orgs gets its own small fixture here).
const ORG_A = 'a1111111-1111-4111-8111-111111111111'
const ORG_B = 'a2222222-2222-4222-8222-222222222222'
const DEFAULT_ORGS = [
  { id: ORG_A, name: 'Chakra Sound & Light', kind: 'vendor', quota: 500, default_type: 'stage', contact_name: 'Ranjith K', contact_phone: '+919886104422', status: 'open', notes: null, created_at: '2026-09-10T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z', submittedCount: 14, approvedCount: 12, collectedCount: 9 },
  { id: ORG_B, name: 'Sentinel Security Services', kind: 'security', quota: 500, default_type: 'crew', contact_name: 'Faisal M', contact_phone: '+919901288104', status: 'approved', notes: null, created_at: '2026-09-10T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z', submittedCount: 68, approvedCount: 66, collectedCount: 41 },
]
function masterRow(id, fullName, orgName, overrides = {}) {
  return {
    id, fullName, phone: '+919000000001', orgName, orgKind: 'vendor', typeCode: 'crew',
    status: 'approved', passRef: `BOA26-${id.slice(-4)}`, vehicleReg: null, bandSerial: null,
    stickerNo: null, inBms: false, collectedAt: null, gateLabel: null, decidedAt: null, ...overrides,
  }
}
const MASTER_BY_ORG = {
  __all__: [
    masterRow('b0000000-0000-4000-8000-000000000001', 'Ranjith Kumar', 'Chakra Sound & Light', { inBms: true }),
    masterRow('b0000000-0000-4000-8000-000000000002', 'Vinay Shetty', 'Chakra Sound & Light'),
    masterRow('b0000000-0000-4000-8000-000000000003', 'Faisal Mohammed', 'Sentinel Security Services', { inBms: true }),
  ],
  [ORG_A]: [
    masterRow('b0000000-0000-4000-8000-000000000001', 'Ranjith Kumar', 'Chakra Sound & Light', { inBms: true }),
    masterRow('b0000000-0000-4000-8000-000000000002', 'Vinay Shetty', 'Chakra Sound & Light'),
  ],
  [ORG_B]: [
    masterRow('b0000000-0000-4000-8000-000000000003', 'Faisal Mohammed', 'Sentinel Security Services', { inBms: true }),
  ],
}

// ── Empty-data desk fixtures ────────────────────────────────────────────────
const EMPTY_DASHBOARD = {
  ...desk.dashboard,
  submittedTotal: 0, submittedOrgs: 0, approvedTotal: 0, pendingTotal: 0,
  bandsIssued: 0, bandsNotCollected: 0, stickersActive: 0, stickersPending: 0,
  bmsAdded: 0, bmsPending: 0, aaaStamped: 0, aaaNominatedApproved: 0, doubleIssues: 0,
  doubleIssueList: [], types: desk.dashboard.types.map((t) => ({ ...t, count: 0 })), orgs: [],
}

// ── Gate/Dexie seeding ───────────────────────────────────────────────────────
// Ported from scripts/visual-check.mjs's seedGateDexie — same store shapes,
// trimmed to what a UX screenshot needs (no attempt to reproduce the design's
// exact 612/184/3 counts).
const GATE_PERSON = {
  passToken: 'ux-crawl-ranjith-pass',
  personId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  fullName: 'Fixture Ranjith Kumar',
  roleText: 'Stage tech',
  orgName: 'Fixture Chakra Sound & Light',
  typeCode: 'stage',
  dayValidity: 'build_show',
}
const GATE_PLATE = 'KA 05 UX 0001'
const GATE_TIME = '2026-10-09T08:14:00.000+05:30'

async function installGateSession(page) {
  await page.route(/\/api\/gate\/session(\?|$)/, (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { operatorId: '11111111-1111-4111-8111-1111111111aa', displayName: 'Fixture Bhoopesh', role: 'issuer' } })
      : route.fallback(),
  )
}
async function installGateUplinkDown(page) {
  const down = (route) => route.fulfill({ status: 503, json: { error: 'offline' } })
  await page.route(/\/api\/gate\/pull(\?|$)/, down)
  await page.route(/\/api\/gate\/issue(\?|$)/, down)
}

async function seedGateDexie(page, { vehicle = false } = {}) {
  await page.evaluate(({ vehicle, person, plate, time }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('boa-accreditation-gate')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const tx = database.transaction(['roster', 'ledger', 'outbox', 'sticker', 'meta'], 'readwrite')
      for (const store of ['roster', 'ledger', 'outbox', 'sticker', 'meta']) tx.objectStore(store).clear()
      const roster = tx.objectStore('roster')
      for (let i = 0; i < 40; i++) {
        roster.put({
          passToken: i === 0 ? person.passToken : `ux-crawl-pass-${i}`,
          personId: i === 0 ? person.personId : `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`,
          orgId: person.orgId,
          status: 'approved',
          fullName: i === 0 ? person.fullName : `Fixture crew ${i}`,
          roleText: i === 0 ? person.roleText : 'Working crew',
          orgName: i === 0 ? person.orgName : 'Fixture Org',
          typeCode: i === 0 ? person.typeCode : 'crew',
          dayValidity: i === 0 ? person.dayValidity : 'build_show',
          ...(i === 0 ? { vehicleReg: plate } : {}),
          updatedAt: time,
        })
      }
      const ledger = tx.objectStore('ledger')
      for (let i = 0; i < 6; i++) {
        ledger.put({
          id: `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`,
          personId: `33333333-3333-4333-8333-${String(i + 1).padStart(12, '0')}`,
          kind: 'wristband', occurredAt: time, bandSerial: `#0${100 + i}`,
          gateLabel: 'Gate 1', volunteerName: 'Fixture Ravi', isReissue: false,
        })
      }
      if (vehicle) {
        tx.objectStore('sticker').put({ plate: plate.replace(/\s+/g, ''), stickerNo: '#V-0099', personId: person.personId, issuedAt: time })
        ledger.put({ id: '66666666-6666-4666-8666-666666666666', personId: person.personId, kind: 'wristband', occurredAt: time, bandSerial: '#0412', gateLabel: 'Gate 1', volunteerName: 'Fixture Ravi', isReissue: false })
      }
      const outbox = tx.objectStore('outbox')
      for (let i = 0; i < 3; i++) {
        outbox.put({
          id: `77777777-7777-4777-8777-${String(i + 1).padStart(12, '0')}`,
          kind: 'wristband', idempotencyKey: `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}`,
          status: 'pending', nextAttemptAt: Date.now(), createdAt: Date.now(),
          payload: { passToken: `ux-crawl-queued-${i}`, kind: 'wristband', bandSerial: '', vehicleReg: null, isReissue: false, idempotencyKey: `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}` },
          attempts: 0,
        })
      }
      const meta = tx.objectStore('meta')
      meta.put({ key: 'gateLabel', value: 'Gate 1' })
      meta.put({ key: 'volunteerName', value: 'Fixture Ravi' })
      meta.put({ key: 'rosterAsOf', value: time })
      meta.put({ key: 'ledgerAsOf', value: time })
      tx.oncomplete = () => { database.close(); resolve() }
      tx.onerror = () => reject(tx.error)
    }
  }), { vehicle, person: GATE_PERSON, plate: GATE_PLATE, time: GATE_TIME })
}

// ── Login / supabase-auth mocks ─────────────────────────────────────────────
// NEXT_PUBLIC_SUPABASE_URL is baked into the client bundle at build time
// (read from .env.local: https://tjbfvuboyvaephtewjwq.supabase.co). Routing
// every request under that origin through page.route() means the browser
// never makes a real request to it — production Supabase is never touched.
const SUPABASE_PUBLIC_URL = 'https://tjbfvuboyvaephtewjwq.supabase.co'
async function installAuthMocks(page) {
  await page.route(`${SUPABASE_PUBLIC_URL}/auth/v1/user*`, (route) =>
    route.fulfill({ status: 401, json: { error: 'invalid_token' } }),
  )
  // Always intercepted, never forwarded — this crawl never needs (or wants) a
  // "successful sign-in" state, and forwarding here would be the one place a
  // real credential-shaped POST could reach production Supabase.
  await page.route(`${SUPABASE_PUBLIC_URL}/auth/v1/token*`, (route) =>
    route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }),
  )
}

// ── Capture plumbing ─────────────────────────────────────────────────────────
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }
const STABILIZE_CSS = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }
  .rv { opacity: 1 !important; transform: none !important; filter: none !important; }
`

async function settleAndStabilize(page) {
  await page.evaluate(() => document.fonts.ready).catch(() => {})
  await page.addStyleTag({ content: STABILIZE_CSS }).catch(() => {})
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('[data-count], main .num')]
    if (nodes.length === 0) return true
    const sig = nodes.map((n) => n.textContent).join('|')
    window.__uxStable = window.__uxStable ?? { sig: '', count: 0 }
    if (window.__uxStable.sig === sig) window.__uxStable.count++
    else { window.__uxStable.sig = sig; window.__uxStable.count = 0 }
    return window.__uxStable.count >= 3
  }, undefined, { timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(200)
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
  await page.mouse.move(0, 0)
  await page.waitForTimeout(100)
}

const manifest = []
const consoleFindings = {}
const overflowFindings = []

function trackPage(page, routeLabel) {
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 300))
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`.slice(0, 300)))
  page.on('requestfailed', (req) => {
    // Ignore requests we deliberately fail (mocked 500s/503s) — only report
    // genuinely unexpected network failures.
    if (req.url().includes('/api/') && (req.failure()?.errorText ?? '').includes('net::ERR_FAILED')) return
    errors.push(`requestfailed: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`.slice(0, 300))
  })
  consoleFindings[routeLabel] = errors
  return errors
}

async function capture(context, { name, route, theme, viewport, setup, postNav, extra = false, note = '' }) {
  const page = await context.newPage()
  const errors = trackPage(page, `${name} (${route})`)
  try {
    if (setup) await setup(page)
    const response = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 30000 })
    if (postNav) await postNav(page)
    await settleAndStabilize(page)
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    const file = `${name}-${viewport}-${theme}.png`
    await page.screenshot({ path: join(OUT, file), fullPage: true })
    const overflows = overflow.scrollWidth > overflow.innerWidth
    if (overflows) overflowFindings.push({ file, scrollWidth: overflow.scrollWidth, innerWidth: overflow.innerWidth })
    manifest.push({
      file, route, state: name, viewport, theme, status: response?.status() ?? null,
      overflow: overflows, overflowBy: overflows ? overflow.scrollWidth - overflow.innerWidth : 0,
      consoleErrors: errors.length, note, extra,
    })
    console.log(`  ${overflows ? 'OVERFLOW' : 'ok'}  ${file}${errors.length ? `  (${errors.length} console error(s))` : ''}`)
  } catch (err) {
    manifest.push({ file: null, route, state: name, viewport, theme, error: String(err).slice(0, 500), note, extra })
    console.log(`  FAILED  ${name}-${viewport}-${theme}: ${String(err).slice(0, 200)}`)
  } finally {
    await page.close()
  }
}

// The app ignores prefers-color-scheme: app/layout.tsx renders a static
// <html data-theme="dark"> and light is reachable only through the operator
// menu's toggle. colorScheme alone therefore captures dark twice, so a light
// shot also sets data-theme="light" the way that toggle does.
async function newContext(browser, viewportName, theme) {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewportName], colorScheme: theme })
  if (theme === 'light') {
    await context.addInitScript(() => {
      const apply = () => document.documentElement?.setAttribute('data-theme', 'light')
      apply()
      document.addEventListener('DOMContentLoaded', apply)
      new MutationObserver(() => {
        if (document.documentElement.getAttribute('data-theme') !== 'light') apply()
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] })
    })
  }
  return context
}

/** THEMES=light re-shoots only the light set; default is both. */
const THEMES = (process.env.THEMES ?? 'dark,light').split(',').filter((t) => t === 'dark' || t === 'light')

// ── Main ─────────────────────────────────────────────────────────────────────
let passStub
let browser
const notCaptured = []

try {
  passStub = await startPassStub()
  console.log(`ux-crawl: pass-page fixture stub listening on :${PASS_STUB_PORT}`)

  browser = await chromium.launch({ args: FONT_STABLE_ARGS })

  // Each `capture` needs a context matching its own viewport+theme, so the
  // full-matrix screens open their own context per shot rather than reusing
  // one — contexts are cheap and this keeps colorScheme/viewport honest.
  async function shot(name, route, setup, opts = {}) {
    for (const theme of THEMES) {
      for (const viewportName of Object.keys(VIEWPORTS)) {
        const context = await newContext(browser, viewportName, theme)
        await capture(context, { name, route, setup, viewport: viewportName, theme, ...opts })
        await context.close()
      }
    }
  }
  async function shotExtra(name, route, setup, opts = {}) {
    for (const viewportName of ['desktop', 'mobile']) {
      const context = await newContext(browser, viewportName, 'dark')
      await capture(context, { name, route, setup, viewport: viewportName, theme: 'dark', extra: true, ...opts })
      await context.close()
    }
  }

  console.log('\n== Desk screens (default data) ==')
  await shot('desk-control-room', '/desk', (p) => installDeskFixtures(p))
  await shot('desk-master', '/desk/master', (p) => installDeskFixtures(p))
  await shot('desk-orgs', '/desk/orgs', (p) => installDeskFixtures(p))
  await shot('desk-passes', '/desk/passes', (p) => installDeskFixtures(p))
  await shot('desk-users', '/desk/users', (p) => installDeskFixtures(p))

  console.log('\n== Gate screens (default data, seeded cache) ==')
  await shot('gate', '/gate', async (p) => {
    await installGateSession(p)
    await installGateUplinkDown(p)
  }, {
    postNav: async (p) => { await seedGateDexie(p, { vehicle: false }); await p.goto(`${BASE}/gate`, { waitUntil: 'networkidle' }) },
  })
  await shot('gate-vehicle', '/gate/vehicle', async (p) => {
    await installGateSession(p)
    await installGateUplinkDown(p)
  }, {
    postNav: async (p) => { await seedGateDexie(p, { vehicle: true }); await p.goto(`${BASE}/gate/vehicle`, { waitUntil: 'networkidle' }) },
  })

  console.log('\n== Pass page (5 states) ==')
  await shot('pass-crew', `/p/${CREW_TOKEN}`)
  await shot('pass-stage', `/p/${STAGE_TOKEN}`)
  await shot('pass-aaa', `/p/${AAA_TOKEN}`)
  await shot('pass-voided', `/p/${VOIDED_TOKEN}`, undefined, { note: 'Same "not valid" response as an unknown token — boa_acc_pass_view intentionally does not distinguish (docs/SECURITY.md).' })
  await shot('pass-invalid', `/p/${INVALID_TOKEN}`, undefined, { note: 'Malformed shape — rejected by passTokenParamSchema before any RPC call.' })

  console.log('\n== Login ==')
  await shot('login-default', '/desk/login', (p) => installAuthMocks(p))
  await shot('login-error', '/desk/login', (p) => installAuthMocks(p), {
    postNav: async (p) => {
      await p.getByLabel('Email').fill('operator@example.com')
      await p.getByLabel('Password').fill('wrong-password')
      await p.getByRole('button', { name: 'Sign in' }).click()
      await p.getByRole('alert').waitFor({ timeout: 5000 }).catch(() => {})
    },
  })

  console.log('\n== 404 / error ==')
  await shot('404', '/nope')
  await shot('error-boundary', '/desk/orgs', (p) => installDeskFixtures(p, { orgsMalformed: true }), {
    note: '/desk/orgs reads `body.orgs` with no Zod parse (app/desk/orgs/orgs-screen.tsx); a malformed 200 ({}) leaves `orgs` undefined and `orgs.length` throws at render, which app/error.tsx catches. This is also a real bug (non-negotiable #8: "Zod at every boundary") — see README.',
  })

  // The extras are dark-only; THEMES=light skips them.
  if (THEMES.includes('dark')) {
  console.log('\n== Extra states (1440 + 390, dark only) ==')
  await shotExtra('desk-control-room-empty', '/desk', (p) => installDeskFixtures(p, { dashboard: EMPTY_DASHBOARD }))
  await shotExtra('desk-master-empty', '/desk/master', (p) => installDeskFixtures(p, { master: { rows: [], total: 0 } }))
  await shotExtra('desk-orgs-empty', '/desk/orgs', (p) => installDeskFixtures(p, { orgs: { orgs: [] } }))
  await shotExtra('desk-passes-empty', '/desk/passes', (p) => installDeskFixtures(p, { passes: { passes: [] } }))
  await shotExtra('desk-users-empty', '/desk/users', (p) => installDeskFixtures(p, { operators: { callerId: 'operator-1', operators: [] } }))

  await shotExtra('desk-control-room-500', '/desk', (p) => installDeskFixtures(p, { dashboardStatus: 500 }))
  await shotExtra('desk-master-500', '/desk/master', (p) => installDeskFixtures(p, { masterStatus: 500 }))
  await shotExtra('desk-orgs-500', '/desk/orgs', (p) => installDeskFixtures(p, { orgsStatus: 500 }))
  await shotExtra('desk-passes-500', '/desk/passes', (p) => installDeskFixtures(p, { passesStatus: 500 }))
  await shotExtra('desk-users-500', '/desk/users', (p) => installDeskFixtures(p, { operatorsStatus: 500 }))

  await shotExtra('gate-offline', '/gate', async (p) => {
    await installGateSession(p)
    await installGateUplinkDown(p)
  }, {
    postNav: async (p) => {
      await seedGateDexie(p, { vehicle: false })
      await p.context().setOffline(true)
      await p.goto(`${BASE}/gate`, { waitUntil: 'networkidle' })
    },
    note: 'Roster seeded, then context.setOffline(true) before reload — status line reads "Offline | N queued".',
  })
  await shotExtra('gate-empty-cache', '/gate', async (p) => {
    await installGateSession(p)
    await installGateUplinkDown(p)
  }, { note: 'No Dexie seeding at all: online, session mocked, /api/gate/pull mocked 503 — the boot pull fails and the retry error state renders.' })

  await shotExtra('desk-master-filtered-by-org', `/desk/master?org=${ORG_A}`, (p) => installDeskFixtures(p, { masterByOrg: MASTER_BY_ORG }))

  console.log('\n== Interactive surfaces ==')
  await shot('desk-operator-menu-open', '/desk', (p) => installDeskFixtures(p), {
    postNav: async (p) => { await p.getByRole('button', { name: 'Operator menu' }).click(); await p.waitForTimeout(150) },
  })
  await shotExtra('gate-operator-menu-open', '/gate', async (p) => {
    await installGateSession(p)
    await installGateUplinkDown(p)
  }, {
    postNav: async (p) => {
      await seedGateDexie(p, { vehicle: false })
      await p.goto(`${BASE}/gate`, { waitUntil: 'networkidle' })
      await p.getByRole('button', { name: 'Operator menu' }).click()
      await p.waitForTimeout(150)
    },
  })
  // Mobile-only: the burger button is CSS-hidden at desktop width, and its
  // aria-label ("Menu") is a substring of the profile button's ("Operator
  // menu") — `exact: true` avoids Playwright's strict-mode ambiguity.
  {
    const context = await newContext(browser, 'mobile', 'dark')
    await capture(context, {
      name: 'desk-mobile-menu-open', route: '/desk', viewport: 'mobile', theme: 'dark', extra: true,
      setup: (p) => installDeskFixtures(p),
      postNav: async (p) => { await p.getByRole('button', { name: 'Menu', exact: true }).click(); await p.waitForTimeout(150) },
    })
    await context.close()
  }

  // ── The org-filter walkthrough ─────────────────────────────────────────────
  console.log('\n== Org-filter walkthrough ==')
  const orgFilterSteps = []
  {
    const context = await newContext(browser, 'desktop', 'dark')
    const page = await context.newPage()
    trackPage(page, 'org-filter-walkthrough')
    await installDeskFixtures(page, { orgs: { orgs: DEFAULT_ORGS }, masterByOrg: MASTER_BY_ORG })

    await page.goto(`${BASE}/desk/orgs`, { waitUntil: 'networkidle' })
    await settleAndStabilize(page)
    orgFilterSteps.push({ step: '1. /desk/orgs loaded', url: page.url() })

    const orgLink = page.getByRole('link', { name: /Chakra Sound & Light — show their people/ })
    await orgLink.click()
    await page.waitForURL(/\/desk\/master\?org=/)
    await settleAndStabilize(page)
    orgFilterSteps.push({ step: '2. clicked the "Chakra Sound & Light" row', url: page.url() })
    await page.screenshot({ path: join(OUT, 'orgfilter-1-filtered-desktop-dark.png'), fullPage: true })
    manifest.push({ file: 'orgfilter-1-filtered-desktop-dark.png', route: page.url().replace(BASE, ''), state: 'orgfilter-1-filtered', viewport: 'desktop', theme: 'dark', extra: true, note: 'Step 2 of the org-filter walkthrough — see README.' })

    // Mobile version of the same filtered state.
    {
      const mctx = await newContext(browser, 'mobile', 'dark')
      const mpage = await mctx.newPage()
      trackPage(mpage, 'org-filter-walkthrough-mobile')
      await installDeskFixtures(mpage, { orgs: { orgs: DEFAULT_ORGS }, masterByOrg: MASTER_BY_ORG })
      await mpage.goto(`${BASE}${page.url().replace(BASE, '')}`, { waitUntil: 'networkidle' })
      await settleAndStabilize(mpage)
      await mpage.screenshot({ path: join(OUT, 'orgfilter-1-filtered-mobile-dark.png'), fullPage: true })
      manifest.push({ file: 'orgfilter-1-filtered-mobile-dark.png', route: page.url().replace(BASE, ''), state: 'orgfilter-1-filtered', viewport: 'mobile', theme: 'dark', extra: true })
      await mctx.close()
    }

    // Clearing method 1: the "Show everyone" banner link.
    const showEveryone = page.getByRole('link', { name: 'Show everyone' })
    const hasShowEveryone = await showEveryone.count()
    orgFilterSteps.push({ step: '3. "Show everyone" banner link present?', result: hasShowEveryone > 0 })
    if (hasShowEveryone > 0) {
      await showEveryone.click()
      await page.waitForURL(/\/desk\/master$/)
      await settleAndStabilize(page)
      orgFilterSteps.push({ step: '4. clicked "Show everyone"', url: page.url(), result: 'filter cleared' })
      await page.screenshot({ path: join(OUT, 'orgfilter-2-cleared-via-show-everyone-desktop-dark.png'), fullPage: true })
      manifest.push({ file: 'orgfilter-2-cleared-via-show-everyone-desktop-dark.png', route: page.url().replace(BASE, ''), state: 'orgfilter-2-cleared', viewport: 'desktop', theme: 'dark', extra: true })
    }

    // Re-filter, then try clearing method 2: the "Master list" nav link.
    await page.goto(`${BASE}/desk/master?org=${ORG_A}`, { waitUntil: 'networkidle' })
    await settleAndStabilize(page)
    const masterNavLink = page.locator('#desk-links a', { hasText: 'Master list' })
    await masterNavLink.click()
    await page.waitForLoadState('networkidle')
    await settleAndStabilize(page)
    orgFilterSteps.push({ step: '5. re-filtered, then clicked the "Master list" nav item', url: page.url(), result: page.url().includes('?org=') ? 'filter NOT cleared' : 'filter cleared (nav link has no query string)' })

    // Method 3: typing in the search box while filtered — does it clear org?
    await page.goto(`${BASE}/desk/master?org=${ORG_A}`, { waitUntil: 'networkidle' })
    await settleAndStabilize(page)
    await page.getByLabel('Search master list').fill('Vinay')
    await page.waitForTimeout(400)
    orgFilterSteps.push({ step: '6. typed into the search box while org-filtered', url: page.url(), result: page.url().includes('?org=') ? 'org filter untouched by search (URL unchanged, expected — search is client state)' : 'unexpected: URL changed' })

    // Method 4: is there any per-filter chip/select to clear ONLY org (not
    // in_bms) when both are active?
    await page.goto(`${BASE}/desk/master?org=${ORG_A}&in_bms=false`, { waitUntil: 'networkidle' })
    await settleAndStabilize(page)
    const clearControls = await page.locator('button, a').filter({ hasText: /clear|reset|×|✕/i }).count()
    orgFilterSteps.push({
      step: '7. both org and in_bms filters active — any control to clear just one?',
      url: page.url(),
      result: `${clearControls} chip/clear-labelled control(s) found; the only escape is "Show everyone", which clears BOTH filters at once (master-screen.tsx:174, masterFilterSummary in lib/format.ts)`,
    })
    await page.screenshot({ path: join(OUT, 'orgfilter-3-both-filters-active-desktop-dark.png'), fullPage: true })
    manifest.push({ file: 'orgfilter-3-both-filters-active-desktop-dark.png', route: page.url().replace(BASE, ''), state: 'orgfilter-3-both-filters', viewport: 'desktop', theme: 'dark', extra: true })

    await context.close()
  }
  writeFileSync(join(OUT, 'org-filter-walkthrough.json'), JSON.stringify(orgFilterSteps, null, 2))
  console.log(orgFilterSteps.map((s) => `  ${s.step}${s.url ? ` -> ${s.url}` : ''}${s.result !== undefined ? ` [${s.result}]` : ''}`).join('\n'))
  }

} finally {
  await browser?.close()
  await new Promise((resolve) => passStub?.close(resolve))
}

// ── Manifest + summary ───────────────────────────────────────────────────────
writeFileSync(join(OUT, THEMES.includes('dark') ? 'manifest.json' : 'manifest-light.json'), JSON.stringify({ manifest, consoleFindings, overflowFindings, notCaptured }, null, 2))

console.log(`\nux-crawl: ${manifest.filter((m) => m.file).length} screenshot(s) written to ${OUT}`)
console.log(`ux-crawl: ${overflowFindings.length} screen(s) with horizontal overflow`)
const withErrors = Object.entries(consoleFindings).filter(([, errs]) => errs.length > 0)
console.log(`ux-crawl: ${withErrors.length} route(s) with unexpected console/network errors`)
