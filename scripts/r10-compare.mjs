// r10 design-fidelity harness: captures the r10 mockup and the running app
// side by side, headless, with no login, so an auditor agent can diff them
// page by page without opening a browser.
//
// Reuses the patterns already proven in scripts/ux-crawl.mjs: desk screens
// via page.route() against /api/desk/* (fixtures from
// scripts/visual-fixtures/desk.mjs), the gate session + seeded Dexie cache,
// supabase auth mocked for /desk/login, and a tiny PostgREST-shaped stub on
// :4312 standing in for the boa_acc_pass_view RPC that /p/[passToken] calls
// server-side (page.route() cannot see that call — it never leaves the
// server process).
//
// Usage:
//   corepack pnpm build
//   SUPABASE_URL=http://127.0.0.1:4312 SUPABASE_SERVICE_ROLE_KEY=e2e-fixture-service-role-key \
//     node_modules/.bin/next start -p 4321 &
//   node scripts/r10-compare.mjs <page|all> [--app http://127.0.0.1:4321] \
//     [--mock http://127.0.0.1:4455] [--out DIR]
//
// <page> is one of: control-room, master, passes, orgs, users, vehicle,
// gate, cold, pass, 404, primitives, or "all".
//
// For each page and each of two viewports (1440x900, 390x844) this writes,
// into --out:
//   <page>-<width>-mock.png / .json   (design/source/r10/r8-*.html, served
//                                       by an already-running static server)
//   <page>-<width>-app.png  / .json   (the running Next app)
// "pass" and "404" have no r10 mockup counterpart (the pass ticket is frozen
// per ADR-025 and reproduces boa_design_v2, which this script does not open;
// the 404 screen has no bespoke r10 design) — only the *-app files are
// written for those two.
//
// The .json files are a capped DOM dump (tag, classes, trimmed text,
// bounding box, and the computed style properties an auditor would want to
// diff exactly rather than eyeball in a screenshot).
//
// This script starts and tears down its own :4312 pass-view stub. It does
// NOT start or stop the app or the :4455 mock server — both must already be
// running (see docs/TOOLING.md / the caller's own setup).

import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import * as desk from './visual-fixtures/desk.mjs'
import { FONT_STABLE_ARGS } from './lib/browser.mjs'


// ── CLI ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
const target = argv[0]
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`)
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback
}
const APP_BASE = flag('app', 'http://127.0.0.1:4321')
const MOCK_BASE = flag('mock', 'http://127.0.0.1:4455')
const OUT = flag(
  'out',
  '/private/tmp/claude-502/-Users-USER-My-Works-BANGALORE-OPEN-AIR-boa-accreditation/0a9b831e-cd0d-4ddc-a0f1-830c341bae79/scratchpad/r10',
)

// ── Fixture token for /p/[passToken] ────────────────────────────────────
// 22 chars, matches passTokenParamSchema's shape. Fixture-only, invented.
const PASS_STUB_PORT = 4312
const FIXTURE_TOKEN = 'r10ComparePassToken001'
if (!/^[A-Za-z0-9_-]{22}$/.test(FIXTURE_TOKEN)) {
  throw new Error(`r10-compare: fixture token "${FIXTURE_TOKEN}" is not the 22-char shape passTokenParamSchema requires`)
}
const PASS_FIXTURE = {
  fullName: 'Fixture R10 Compare',
  role: 'Fixture role for r10-compare.mjs',
  vehicleReg: null,
  orgName: 'Fixture Compare Org',
  passRef: 'BOA26-9999',
  typeCode: 'crew',
  dayValidity: 'build_show',
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
        if (token === FIXTURE_TOKEN) {
          res.writeHead(200)
          res.end(JSON.stringify(PASS_FIXTURE))
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

// ── Desk fixture installer (adapted from ux-crawl.mjs's installDeskFixtures,
// trimmed to the "default, ready" state this harness always wants) ────────
const ORG_A = 'a1111111-1111-4111-8111-111111111111'
const ORG_B = 'a2222222-2222-4222-8222-222222222222'
const DEFAULT_ORGS = [
  { id: ORG_A, name: 'Chakra Sound & Light', kind: 'vendor', quota: 500, default_type: 'stage', contact_name: 'Ranjith K', contact_phone: '+919886104422', status: 'open', notes: null, created_at: '2026-09-10T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z', submittedCount: 14, approvedCount: 12 },
  { id: ORG_B, name: 'Sentinel Security Services', kind: 'security', quota: 500, default_type: 'crew', contact_name: 'Faisal M', contact_phone: '+919901288104', status: 'approved', notes: null, created_at: '2026-09-10T08:00:00.000Z', updated_at: '2026-09-10T08:00:00.000Z', submittedCount: 68, approvedCount: 66 },
]

async function installDeskFixtures(page) {
  const { passes } = await desk.passesFor()
  const send = (body) => (route) => (route.request().method() !== 'GET' ? route.fallback() : route.fulfill({ json: body }))
  await page.route(/\/api\/desk\/dashboard(\?|$)/, send(desk.dashboard))
  await page.route(/\/api\/desk\/operators(\?|$)/, send(desk.operators))
  await page.route(/\/api\/desk\/orgs(\?|$)/, send({ orgs: DEFAULT_ORGS }))
  await page.route(/\/api\/desk\/master(\?|$)/, send(desk.master))
  await page.route(/\/api\/desk\/passes\/send(\?|$)/, send({ canSend: true, configured: true, people: [] }))
  await page.route(/\/api\/desk\/passes(\?|$)/, send({ passes }))
}

// ── Gate session + Dexie seed (copied near-verbatim from ux-crawl.mjs) ────
const GATE_PERSON = {
  passToken: 'r10-compare-ranjith-pass',
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
          passToken: i === 0 ? person.passToken : `r10-compare-pass-${i}`,
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
          payload: { passToken: `r10-compare-queued-${i}`, kind: 'wristband', bandSerial: '', vehicleReg: null, isReissue: false, idempotencyKey: `88888888-8888-4888-8888-${String(i + 1).padStart(12, '0')}` },
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

// ── Supabase auth mocks for /desk/login (copied from ux-crawl.mjs) ────────
// NEXT_PUBLIC_SUPABASE_URL is baked into the client bundle at build time.
// Routing every request under that origin through page.route() means the
// browser never makes a real request to it.
const SUPABASE_PUBLIC_URL = 'https://tjbfvuboyvaephtewjwq.supabase.co'
async function installAuthMocks(page) {
  await page.route(`${SUPABASE_PUBLIC_URL}/auth/v1/user*`, (route) =>
    route.fulfill({ status: 401, json: { error: 'invalid_token' } }),
  )
  await page.route(`${SUPABASE_PUBLIC_URL}/auth/v1/token*`, (route) =>
    route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }),
  )
}

// ── Page registry ────────────────────────────────────────────────────────
// mock: filename under design/source/r10/ served by the :4455 static server,
// or null when there is no r10 mockup for this route (see header comment).
const PAGES = {
  'control-room': { mock: 'r8-control-room.html', appRoute: '/desk', kind: 'desk' },
  master: { mock: 'r8-master.html', appRoute: '/desk/master', kind: 'desk' },
  passes: { mock: 'r8-passes.html', appRoute: '/desk/passes', kind: 'desk' },
  orgs: { mock: 'r8-orgs.html', appRoute: '/desk/orgs', kind: 'desk' },
  users: { mock: 'r8-users.html', appRoute: '/desk/users', kind: 'desk' },
  vehicle: { mock: 'r8-vehicle.html', appRoute: '/gate/vehicle', kind: 'gate' },
  gate: { mock: 'r8-gate.html', appRoute: '/gate', kind: 'gate' },
  cold: { mock: 'r8-cold.html', appRoute: '/desk/login', kind: 'cold' },
  pass: { mock: null, appRoute: `/p/${FIXTURE_TOKEN}`, kind: 'pass' },
  '404': { mock: null, appRoute: '/r10-compare-nonexistent-route', kind: '404' },
  primitives: { mock: 'r8-primitives.html', appRoute: '/dev/r10', kind: 'primitives' },
}
const PAGE_ORDER = Object.keys(PAGES)

if (!target || (target !== 'all' && !PAGES[target])) {
  console.error(`Usage: node scripts/r10-compare.mjs <${PAGE_ORDER.join('|')}|all> [--app URL] [--mock URL] [--out DIR]`)
  process.exit(1)
}
const targets = target === 'all' ? PAGE_ORDER : [target]

mkdirSync(OUT, { recursive: true })

// ── Viewports + settle/stabilize (adapted from ux-crawl.mjs) ──────────────
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]

// Kills leftover transitions/animations and forces reveal-on-scroll content
// visible. Both sides also get reducedMotion:'reduce' + colorScheme:'dark'
// at the context level, and mock pages additionally get ?theme=dark&motion=
// reduced (design/source/r10/r8/ui.js reads these before anything paints;
// the app ignores prefers-color-scheme and defaults <html data-theme="dark">
// per app/layout.tsx, so no app-side theme param is needed).
const STABILIZE_CSS = `
  *, *::before, *::after { animation-duration: 0s !important; animation-delay: 0s !important; transition-duration: 0s !important; transition-delay: 0s !important; }
  .rv { opacity: 1 !important; transform: none !important; filter: none !important; }
  .fade-in { opacity: 1 !important; }
`

async function settleAndStabilize(page) {
  await page.evaluate(() => document.fonts?.ready).catch(() => {})
  await page.addStyleTag({ content: STABILIZE_CSS }).catch(() => {})
  // Both the app's count-up (`[data-count], main .num`, see ux-crawl.mjs) and
  // the mock's CountUp (`[data-count]`, r8/ui.js) land in this selector set;
  // reducedMotion already makes the mock's version resolve instantly, this
  // is the belt-and-braces wait for both.
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('[data-count], main .num')]
    if (nodes.length === 0) return true
    const sig = nodes.map((n) => n.textContent).join('|')
    window.__cmpStable = window.__cmpStable ?? { sig: '', count: 0 }
    if (window.__cmpStable.sig === sig) window.__cmpStable.count++
    else { window.__cmpStable.sig = sig; window.__cmpStable.count = 0 }
    return window.__cmpStable.count >= 3
  }, undefined, { timeout: 4000 }).catch(() => {})
  await page.waitForTimeout(200)
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {})
  await page.mouse.move(0, 0)
  await page.waitForTimeout(100)
}

// ── DOM dump: visible elements, capped, with the computed style an auditor
// needs to diff exact values rather than eyeball pixels ───────────────────
function domDumpInPage(cap) {
  const SKIP_TAGS = new Set(['script', 'style', 'link', 'meta', 'template', 'noscript', 'br', 'option', 'path', 'rect', 'circle', 'polygon', 'polyline', 'line', 'g', 'defs', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'stop', 'symbol', 'use', 'title'])
  const out = []
  const all = document.querySelectorAll('body *')
  for (const el of all) {
    if (out.length >= cap) break
    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) continue
    if (el.closest('.proto')) continue // proposal-only controls bar, not part of the design
    if (el.closest('[aria-hidden="true"]')) continue
    let visible = true
    try {
      visible = typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true
    } catch {
      visible = true
    }
    if (!visible) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const cs = getComputedStyle(el)
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const classes = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || ''
    out.push({
      tag,
      classes,
      text,
      box: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      style: {
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        color: cs.color,
        backgroundColor: cs.backgroundColor,
        border: cs.border,
        borderRadius: cs.borderRadius,
        padding: cs.padding,
        gap: cs.gap,
        boxShadow: cs.boxShadow,
      },
    })
  }
  return out
}

// ── Content sanity check (adapted from ux-crawl.mjs's error.tsx-aware note
// pattern): catches a login redirect, the error boundary, or a skeleton
// still on screen after settling — the three ways a capture can "succeed"
// (status 200, no exception) while showing nothing useful ────────────────
async function assess(page, cfg) {
  const bodyText = await page.evaluate(() => document.body.innerText || '').catch(() => '')
  const skeletonCount = await page.evaluate(() => document.querySelectorAll('.skeleton').length).catch(() => 0)
  const flags = []
  if (cfg.kind !== 'cold' && /Sign in/.test(bodyText) && /Password/i.test(bodyText)) flags.push('looks like the login screen (possible redirect to /desk/login)')
  if (/This screen did not load|Something failed/.test(bodyText)) flags.push('app/error.tsx error boundary rendered')
  if (skeletonCount > 0) flags.push(`${skeletonCount} .skeleton element(s) still present after settling`)
  return { bodyTextSample: bodyText.replace(/\s+/g, ' ').trim().slice(0, 200), flags }
}

// ── Capture: mock side ──────────────────────────────────────────────────
async function captureMock(browser, pageKey, cfg, viewport) {
  if (!cfg.mock) return { skipped: true, reason: 'no r10 mockup for this route' }
  const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    const url = `${MOCK_BASE}/design/source/r10/${cfg.mock}?theme=dark&motion=reduced`
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    await settleAndStabilize(page)
    await page.screenshot({ path: join(OUT, `${pageKey}-${viewport.width}-mock.png`), fullPage: true })
    const dump = await page.evaluate(domDumpInPage, 400)
    writeFileSync(join(OUT, `${pageKey}-${viewport.width}-mock.json`), JSON.stringify(dump, null, 2))
    return { ok: true, status: resp?.status() ?? null, elements: dump.length }
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 500) }
  } finally {
    await context.close()
  }
}

// ── Capture: app side ────────────────────────────────────────────────────
async function captureApp(browser, pageKey, cfg, viewport) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' })
  const page = await context.newPage()
  try {
    const url = `${APP_BASE}${cfg.appRoute}`
    if (cfg.kind === 'desk') await installDeskFixtures(page)
    else if (cfg.kind === 'gate') { await installGateSession(page); await installGateUplinkDown(page) }
    else if (cfg.kind === 'cold') await installAuthMocks(page)

    let resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    if (cfg.kind === 'gate') {
      await seedGateDexie(page, { vehicle: pageKey === 'vehicle' })
      resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
    }
    await settleAndStabilize(page)
    const status = resp?.status() ?? null
    const { bodyTextSample, flags } = await assess(page, cfg)
    await page.screenshot({ path: join(OUT, `${pageKey}-${viewport.width}-app.png`), fullPage: true })
    const dump = await page.evaluate(domDumpInPage, 400)
    writeFileSync(join(OUT, `${pageKey}-${viewport.width}-app.json`), JSON.stringify(dump, null, 2))
    return { ok: true, status, elements: dump.length, bodyTextSample, flags }
  } catch (err) {
    return { ok: false, error: String(err).slice(0, 500) }
  } finally {
    await context.close()
  }
}

function summarize(result) {
  if (result.skipped) return `skipped (${result.reason})`
  if (!result.ok) return `FAILED: ${result.error}`
  const flags = result.flags?.length ? ` [${result.flags.join('; ')}]` : ''
  return `ok status=${result.status} elements=${result.elements}${flags}`
}

// ── Main ─────────────────────────────────────────────────────────────────
let passStub
let browser
const report = []
try {
  if (targets.includes('pass')) {
    passStub = await startPassStub()
    console.log(`r10-compare: pass-view fixture stub listening on :${PASS_STUB_PORT}`)
  }
  browser = await chromium.launch({ args: FONT_STABLE_ARGS })

  for (const key of targets) {
    const cfg = PAGES[key]
    console.log(`\n== ${key} (mock: ${cfg.mock ?? 'none'} | app: ${cfg.appRoute}) ==`)
    for (const viewport of VIEWPORTS) {
      const mockResult = await captureMock(browser, key, cfg, viewport)
      const appResult = await captureApp(browser, key, cfg, viewport)
      report.push({ page: key, viewport: viewport.width, mock: mockResult, app: appResult })
      console.log(`  ${viewport.width}px  mock: ${summarize(mockResult)}`)
      console.log(`  ${viewport.width}px  app:  ${summarize(appResult)}`)
    }
  }
} finally {
  await browser?.close()
  if (passStub) await new Promise((resolve) => passStub.close(resolve))
}

writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\nr10-compare: wrote captures + report.json to ${OUT}`)

const broken = report.filter((r) => !r.mock.ok && !r.mock.skipped || !r.app.ok || (r.app.flags && r.app.flags.length))
if (broken.length) {
  console.log(`r10-compare: ${broken.length} capture(s) need a look:`)
  for (const b of broken) {
    console.log(`  - ${b.page} @ ${b.viewport}px: mock=${summarize(b.mock)} app=${summarize(b.app)}`)
  }
}
