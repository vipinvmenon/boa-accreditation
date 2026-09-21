// The design-fidelity gate. Compares each built screen against the approved
// design's own rendering in design/reference/.
//
// Rules this script exists to enforce, learned from boa-bar-control:
//
// 1. IT STARTS ITS OWN SERVER. bar-control's visual gate probed whatever was on
//    :5173, and a stale dev server once fabricated a false verdict. "A gate must
//    control the thing it measures." This serves the build on a free port, and
//    tears it down.
//
// 2. IT REFUSES A STALE BUILD. `next start` serves whatever .next holds. On 12
//    Sep a CSS fix was "measured" against the previous day's build and logged
//    as a pass. If any source file is newer than .next/BUILD_ID, this exits.
//
// 3. IT REPORTS COVERAGE, NOT JUST DIFFS. A screen with no route cannot fail a
//    pixel comparison, so a gate that only compares what exists reports success
//    while six of seven screens are missing. Coverage is printed every run.
//
// 4. DATA ARRIVES THROUGH THE DATA LAYER. The design is a static artboard. Its
//    numbers reach the real screens through /api/desk/* (desk screens, via
//    scripts/visual-fixtures/desk.mjs), IndexedDB (gate), or real RPCs
//    (submission) — never through defaults in shipped code. A screen that
//    hardcodes a fixture value fails check-bundle-content.mjs.
//
// 5. EXCEPTIONS ARE NAMED REGIONS, NOT PERCENTAGES. Where the design cannot be
//    matched by any real data (a fake QR pattern, a mock that contradicts
//    itself), that exact element is masked in both images, with a reason.
//    Everything else is held to THRESHOLD.
//
// Usage:
//   corepack pnpm build && corepack pnpm test:visual
//   corepack pnpm test:visual -- --screen master
//
// Writes test-results/visual/index.html (reference | actual | diff for every
// shot). Exit non-zero if any compared screen exceeds its limit.

import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { loadEnvLocal, runSql } from './lib/db.mjs'
import { FONT_STABLE_ARGS } from './lib/browser.mjs'
import * as desk from './visual-fixtures/desk.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF = join(root, 'design/reference')
const OUT = join(root, 'test-results/visual')

/** Fraction of differing pixels allowed. 0.8% absorbs font antialiasing
 *  between the bundle's own woff2 and @fontsource's, and nothing more. */
const THRESHOLD = 0.008

/**
 * Named regions excluded from comparison, per screen. Each locator's bounding
 * box (measured on the real page) is painted the same flat colour in BOTH the
 * reference and the actual image before diffing. A locator that matches
 * nothing masks nothing — it can never widen into a blanket exemption.
 * Every entry must also be listed in docs/DESIGN-SYSTEM.md.
 */
const OPERATOR_MENU = {
  locator: 'button[aria-label="Operator menu"]',
  reason: 'ADR-015 — the profile menu replaces the design’s lone theme button in the same slot',
}
const MASKS = {
  'control-room': [
    OPERATOR_MENU,
    {
      locator: 'h2:has-text("on site")',
      reason: 'the design lists 7 organisations under a "38 companies" heading; real data cannot be both',
    },
  ],
  queue: [OPERATOR_MENU],
  master: [OPERATOR_MENU],
  passes: [
    OPERATOR_MENU,
    { locator: '.qr-wrap svg', reason: 'the design draws a fake 13×13 pattern; a real pass carries a real QR code' },
  ],
  submission: [
    { locator: '.s-seat-count', reason: 'the design mock says 14 used but the real roster contains four fixture people' },
    { locator: '.s-seat-bar', reason: 'the design mock says 14/22 but the real roster count is data-driven' },
  ],
}

/**
 * Design screen -> the route that must reproduce it.
 *
 * `data` says how the design's numbers reach the screen:
 *   'desk'         — /api/desk/* fulfilled from scripts/visual-fixtures/desk.mjs
 *   'invite-token' — a real invite minted and filled through real RPCs
 *   'dexie'        — the gate's IndexedDB stores seeded
 */
const SCREENS = [
  { slug: 'control-room', route: '/desk', data: 'desk' },
  { slug: 'queue', route: '/desk/queue', data: 'desk' },
  { slug: 'master', route: '/desk/master', data: 'desk' },
  { slug: 'submission', route: '/s/__VISUAL_TOKEN__', data: 'invite-token' },
  { slug: 'passes', route: '/desk/passes', data: 'desk' },
  { slug: 'gate', route: '/gate', data: 'dexie' },
  { slug: 'vehicle', route: '/gate/vehicle', data: 'dexie' },
]

const VIEWPORTS = [
  { slug: 'web', width: 1360, height: 900 },
  { slug: 'mob', width: 390, height: 844 },
]
const THEMES = ['dark', 'light']
// The approved Control Room references were captured on the day before the
// links-out boundary. Keep that historical state in the harness only; the
// production screen must continue to use the real clock.
const CAPTURE_NOW = '2026-09-19T00:00:00'
// Must stay in step with scripts/capture-design-reference.mjs. The count-up runs
// 1100ms; wait past it so the settled value is what gets compared. See the note
// there on why the previous per-theme dark:320 wait failed the dark variants.
const CONTROL_ROOM_COUNT_MS = { dark: 1200, light: 1200 }
const HERO_DRIFT_PHASE_MS = 1000

const args = process.argv.slice(2)
const only = args.includes('--screen') ? args[args.indexOf('--screen') + 1] : null

// ── Stale-build guard ──────────────────────────────────────────────────────
const BUILD_ID = join(root, '.next/BUILD_ID')
const SOURCE_ROOTS = ['app', 'lib', 'components', 'gate', 'middleware.ts', 'next.config.ts', 'next.config.mjs']
function newestSource() {
  let newest = { path: null, mtime: 0 }
  const visit = (rel) => {
    const abs = join(root, rel)
    if (!existsSync(abs)) return
    const st = statSync(abs)
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) {
        if (name === 'node_modules' || name === '.next') continue
        visit(join(rel, name))
      }
    } else if (!/\.test\.tsx?$/.test(rel) && st.mtimeMs > newest.mtime) {
      newest = { path: rel, mtime: st.mtimeMs }
    }
  }
  SOURCE_ROOTS.forEach(visit)
  return newest
}
if (!existsSync(BUILD_ID)) {
  console.error('visual-check: no build. Run `corepack pnpm build` first.')
  process.exit(1)
}
{
  const built = statSync(BUILD_ID).mtimeMs
  const newest = newestSource()
  if (newest.mtime > built) {
    console.error(`visual-check: STALE BUILD — ${newest.path} changed after the last \`corepack pnpm build\`.`)
    console.error('Measuring it would compare the old code. Run `corepack pnpm build` first.')
    process.exit(1)
  }
}

// Same name and quota the design's own mock uses (renderVals(), the org header
// literals) so the header and quota bar match the approved reference.
const VISUAL_ORG = 'Chakra Sound & Light'

/**
 * Mint the same way the pgTAP fixtures do (org + invite inserted directly, as
 * quota.test.sql does) and fill four people through the real boa_acc_submit RPC.
 * The design's seat summary says 14/22 while its visible roster contains four
 * rows; the summary is a named mask, while these four rows remain real data.
 * Wiped in the `finally` below either way — this must never leave rows in a
 * real database.
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
      select public.boa_acc_submit(
               (select token from tok), p.full_name, p.phone, p.role_text
             ) as person_id
        from (values
          ('Ranjith Kumar', '+919886104422', 'Stage tech'),
          ('Vinay Shetty', '+919008421771', 'Rigger'),
          ('Suhas Bhat', '+919740055381', 'Truck driver'),
          ('Imran Sheikh', '+919632090014', 'Backline')
        ) as p(full_name, phone, role_text)
       where (select id from inv) is not null
    )
    select tok.token from tok, inv
     where (select count(*) from fill) = 4;
  `
  const rows = await runSql(sql, root)
  const token = rows[0]?.token ?? null
  if (!token) return null
  await runSql(`
    update public.boa_acc_person person
       set status = case person.full_name
         when 'Ranjith Kumar' then 'approved'::public.boa_acc_person_status
         when 'Vinay Shetty' then 'approved'::public.boa_acc_person_status
         when 'Imran Sheikh' then 'rejected'::public.boa_acc_person_status
         else person.status
       end,
       type_code = case person.full_name
         when 'Ranjith Kumar' then 'stage'::public.boa_acc_type_code
         when 'Vinay Shetty' then 'stage'::public.boa_acc_type_code
         else person.type_code
       end,
       day_validity = case person.full_name
         when 'Ranjith Kumar' then 'build_show'::public.boa_acc_day_validity
         when 'Vinay Shetty' then 'build_show'::public.boa_acc_day_validity
         else person.day_validity
       end,
       pass_ref = case person.full_name
         when 'Ranjith Kumar' then 'BOA26-0412'
         when 'Vinay Shetty' then 'BOA26-0418'
         else person.pass_ref
       end,
       pass_token = case person.full_name
         when 'Ranjith Kumar' then 'visual-ranjith-pass'
         when 'Vinay Shetty' then 'visual-vinay-pass'
         else person.pass_token
       end,
       approved_at = case person.full_name
         when 'Ranjith Kumar' then now()
         when 'Vinay Shetty' then now()
         else person.approved_at
       end,
       created_at = case person.full_name
         when 'Ranjith Kumar' then '2026-09-01T10:00:00+05:30'::timestamptz
         when 'Vinay Shetty' then '2026-09-01T10:01:00+05:30'::timestamptz
         when 'Suhas Bhat' then '2026-09-01T10:02:00+05:30'::timestamptz
         when 'Imran Sheikh' then '2026-09-01T10:03:00+05:30'::timestamptz
         else person.created_at
       end,
       decision_reason = case person.full_name
         when 'Imran Sheikh' then 'Visual fixture rejection'
         else person.decision_reason
       end
     where person.org_id = (select id from public.boa_acc_org where name = '${VISUAL_ORG}')
  `, root)
  return token
}

async function wipeVisualInvite() {
  await runSql(`select private.boa_acc_wipe_org('${VISUAL_ORG}')`, root)
}

/**
 * Fulfil every desk read with the design's data. Only GETs are answered: a
 * write the screen attempts during capture falls through to the real server,
 * which refuses it without a session — a capture must never mutate anything.
 */
async function installDeskFixtures(page, viewport) {
  const passes = await desk.passesFor(viewport)
  const json = (body) => (route) =>
    route.request().method() === 'GET' ? route.fulfill({ json: body }) : route.fallback()
  await page.route(/\/api\/desk\/dashboard(\?|$)/, json(desk.dashboard))
  await page.route(/\/api\/desk\/operators(\?|$)/, json(desk.operators))
  await page.route(/\/api\/desk\/queue(\?|$)/, json(desk.queue))
  await page.route(/\/api\/desk\/master(\?|$)/, json(desk.master))
  await page.route(/\/api\/desk\/passes(\?|$)/, json(passes))
}

const GATE_PERSON = {
  passToken: 'visual-ranjith-pass',
  personId: '11111111-1111-4111-8111-111111111111',
  orgId: '22222222-2222-4222-8222-222222222222',
  fullName: 'Ranjith Kumar',
  roleText: 'Stage tech',
  orgName: 'Chakra Sound & Light',
  typeCode: 'stage',
  dayValidity: 'build_show',
}
const GATE_PLATE = 'KA 05 MJ 8871'
const GATE_TIME = '2026-10-09T08:14:00.000+05:30'
// The approved v2 references capture Gate before its scan, while Vehicle is
// settled on the source's approved result. Keep the Dexie fixture populated so
// the rendered counters and cache contract remain real, but do not manufacture
// a Gate result state the reference does not contain. This is a capture
// contract, not a mask.
const GATE_CAPTURE_STATE = {
  gate: 'idle',
  vehicle: 'approved',
}
// The three most-recently-issued entries shown in the design reference
// (design/source/boa_design_body.html, lines 813-815).
const RECENT_ISSUES = [
  { suffix: '0182', personId: '55555555-5555-4555-8555-000000000182', fullName: 'Ganesh Rao', roleText: 'Working crew', typeCode: 'crew', bandSerial: '#0416', time: '2026-10-09T13:51:00.000+05:30' },
  { suffix: '0183', personId: '55555555-5555-4555-8555-000000000183', fullName: 'Vinay Shetty', roleText: 'Stage', typeCode: 'stage', bandSerial: '#0417', time: '2026-10-09T13:58:00.000+05:30' },
  { suffix: '0184', personId: '55555555-5555-4555-8555-000000000184', fullName: 'Meera Joseph', roleText: 'Working crew', typeCode: 'crew', bandSerial: '#0418', time: '2026-10-09T14:02:00.000+05:30' },
]

/**
 * Seed only the browser-local Dexie stores used by the gate references.
 *
 * The approved bundle is a static artboard, so its 612/184/3 values have to
 * be represented by the data layer before the real screen is captured. This
 * deliberately uses IndexedDB's public API rather than importing application
 * code or adding fixture defaults to a production route.
 */
async function seedGateDexie(page, { vehicle = false } = {}) {
  await page.evaluate(({ vehicle, person, plate, time, recentIssues }) => new Promise((resolve, reject) => {
    const request = indexedDB.open('boa-accreditation-gate')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      // A configured gate device holds its token (gate/device-token.ts).
      // Without one the status line adds "not syncing — run setup", which
      // is right for a real unconfigured phone but not the approved state.
      localStorage.setItem('boa-gate-device-token', 'visual-fixture-token')
      const transaction = database.transaction(['roster', 'ledger', 'outbox', 'sticker', 'meta'], 'readwrite')
      for (const store of ['roster', 'ledger', 'outbox', 'sticker', 'meta']) transaction.objectStore(store).clear()

      // The last three slots double as the three "last issued" people below,
      // so the roster stays exactly 612 rather than 612 + 3.
      const roster = transaction.objectStore('roster')
      for (let i = 0; i < 612; i++) {
        const recent = recentIssues[i - (612 - recentIssues.length)]
        const id = i === 0 ? person.personId : recent ? recent.personId : `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`
        roster.put({
          passToken: i === 0 ? person.passToken : recent ? `visual-pass-recent-${recent.suffix}` : `visual-pass-${i}`,
          personId: id,
          orgId: person.orgId,
          status: 'approved',
          fullName: i === 0 ? person.fullName : recent ? recent.fullName : `Visual crew ${i}`,
          roleText: i === 0 ? person.roleText : recent ? recent.roleText : 'Working crew',
          orgName: i === 0 ? person.orgName : 'Visual Org',
          typeCode: i === 0 ? person.typeCode : recent ? recent.typeCode : 'crew',
          dayValidity: i === 0 ? person.dayValidity : 'build_show',
          ...(i === 0 ? { vehicleReg: plate } : {}),
          updatedAt: time,
        })
      }

      const ledger = transaction.objectStore('ledger')
      for (let i = 0; i < 181; i++) {
        const id = `44444444-4444-4444-8444-${String(i + 1).padStart(12, '0')}`
        ledger.put({
          id,
          personId: `55555555-5555-4555-8555-${String(i + 1).padStart(12, '0')}`,
          kind: 'wristband',
          occurredAt: time,
          gateLabel: 'Gate 1',
          volunteerName: 'Ravi',
          isReissue: false,
        })
      }
      for (const issue of recentIssues) {
        ledger.put({
          id: `44444444-4444-4444-8444-${issue.suffix.padStart(12, '0')}`,
          personId: issue.personId,
          kind: 'wristband',
          occurredAt: issue.time,
          bandSerial: issue.bandSerial,
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
  }), { vehicle, person: GATE_PERSON, plate: GATE_PLATE, time: GATE_TIME, recentIssues: RECENT_ISSUES })
}

/** Optional: exercises a real operator session when credentials exist. The
 *  desk fixtures do not depend on it. */
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

/** Bounding boxes (document coordinates; the page is scrolled to 0) of every
 *  element matched by this screen's masks. */
async function maskRects(page, slug) {
  const rects = []
  for (const mask of MASKS[slug] ?? []) {
    for (const el of await page.locator(mask.locator).all()) {
      const box = await el.boundingBox()
      if (box) rects.push({ ...box, reason: mask.reason })
    }
  }
  return rects
}

async function installCaptureClock(page) {
  await page.addInitScript((now) => {
    const NativeDate = Date
    const fixed = NativeDate.parse(now)
    class CaptureDate extends NativeDate {
      constructor(...args) {
        super(...(args.length ? args : [fixed]))
      }

      static now() {
        return fixed
      }
    }
    globalThis.Date = CaptureDate
    globalThis.__visualCaptureMotion = { countStartedAt: null }
    new MutationObserver(() => {
      const state = globalThis.__visualCaptureMotion
      if (!state || state.countStartedAt !== null) return
      const nodes = [...document.querySelectorAll('.screen.on [data-count], main .num')]
      if (nodes.some((node) => !/^\s*0(?:\D|$)/.test(node.textContent ?? ''))) {
        state.countStartedAt = performance.now()
      }
    }).observe(document, { subtree: true, childList: true, characterData: true })
  }, CAPTURE_NOW)
}

/**
 * Freeze only the scanner's deliberately infinite animation, then wait for
 * every finite reveal/count motion to settle. This is capture-only: the
 * source and app must present the same deterministic scanner phase without
 * changing either production stylesheet.
 */
async function settleCaptureMotion(page, screen, theme) {
  await page.evaluate((heroPhase) => {
    for (const element of document.querySelectorAll('.screen.on .sweep i, main .sweep i, .screen.on .hero-art, main .hero-art')) {
      const animation = element.getAnimations()[0]
      if (!animation) continue
      animation.pause()
      animation.currentTime = element.matches('.hero-art') ? heroPhase : 1300
    }
  }, HERO_DRIFT_PHASE_MS)

  if (screen === 'control-room') {
    await page.waitForFunction(({ duration }) => {
      const state = window.__visualCaptureMotion
      const nodes = [...document.querySelectorAll('.screen.on [data-count], main .num')]
      if (!state || !nodes.length) return false
      if (state.countStartedAt === null) {
        const started = nodes.some((node) => !/^\s*0(?:\D|$)/.test(node.textContent ?? ''))
        if (started) state.countStartedAt = performance.now()
      }
      return state.countStartedAt !== null && performance.now() - state.countStartedAt >= duration
    }, { duration: CONTROL_ROOM_COUNT_MS[theme] }, { timeout: 5000 })
    // Deliberately NO early return. Returning here skipped the two generic waits
    // below, so control-room was captured while its count-ups and its .meter
    // scaleX transitions (1.2s + .3s delay) were still running — the numbers and
    // meter fills differed between the two browser launches. The count wait above
    // is a precondition for those waits, not a replacement for them.
  }

  await page.waitForFunction(() => {
    const root = document.querySelector('.screen.on, main')
    if (!root) return false
    const animations = [...root.querySelectorAll('*'), root]
      .flatMap((element) => element.getAnimations())
      .filter((animation) => !animation.effect?.getTiming().iterations || animation.effect.getTiming().iterations !== Infinity)
    return animations.every((animation) => animation.playState === 'finished' || animation.currentTime >= (Number(animation.effect?.getTiming().delay) || 0) + (Number(animation.effect?.getTiming().duration) || 0))
  }, undefined, { timeout: 5000 })

  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('.screen.on [data-count], main .num')]
    const signature = nodes.map((node) => node.textContent).join('|')
    const state = window.__visualCaptureMotion ?? { signature: '', stableFrames: 0 }
    state.stableFrames = state.signature === signature ? state.stableFrames + 1 : 0
    state.signature = signature
    window.__visualCaptureMotion = state
    return state.stableFrames >= 3
  }, undefined, { timeout: 5000 })
}

/**
 * Wait for the real desk route to have mounted its fixture-backed content and
 * for the source-aligned reveal work visible in the capture viewport to finish.
 * This is intentionally capture-only: the approved references remain frozen,
 * and no production component is taught about screenshots.
 */
async function waitForV2CaptureReady(page, screen, theme) {
  await page.evaluate(() => document.fonts.ready)

  if (screen === 'master') {
    await page.waitForFunction(() => {
      const root = document.querySelector('main[data-v2-ready="true"]')
      if (!root) return false
      if (root.querySelector('[role="alert"]')) return false
      if ([...root.querySelectorAll('.mrow')].some((element) => element.textContent?.includes('Loading'))) return false
      return root.querySelector('.bz .mrow') !== null
    }, undefined, { timeout: 30000 })
  }

  if (screen === 'passes') {
    await page.waitForFunction(() => {
      const root = document.querySelector('main.passes-screen')
      if (!root || root.querySelector('.passes-state-error')) return false
      if ([...root.querySelectorAll('.passes-state')].some((element) => element.textContent?.includes('Loading'))) return false
      return root.querySelector('.pass') !== null
    }, undefined, { timeout: 30000 })
  }

  if (screen === 'gate' || screen === 'vehicle') {
    const resultId = screen === 'gate' ? '#gres' : '#vres'
    const expectedState = GATE_CAPTURE_STATE[screen]
    await page.waitForFunction(({ selector, expectedState }) => {
      const result = document.querySelector(selector)
      return result !== null && (expectedState === 'idle' ? !result.hasAttribute('data-o') : result.getAttribute('data-o') === 'ok')
    }, { selector: resultId, expectedState }, { timeout: 5000 })
  }

  if (screen === 'control-room') {
    await page.waitForSelector('main .num', { timeout: 30000 })
    await settleCaptureMotion(page, screen, theme)
    return
  }

  // The source uses IntersectionObserver rather than forcing every .rv to
  // .in. Only elements actually visible at the capture viewport are relevant;
  // getAnimations() makes the transition completion bound explicit.
  await page.waitForFunction(() => {
    const root = document.querySelector('main')
    if (!root) return false
    const visible = [...root.querySelectorAll('.rv')].filter((element) => {
      const rect = element.getBoundingClientRect()
      return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0 && rect.height > 0
    })
    return visible.length > 0 && visible.every((element) => element.classList.contains('in') && element.getAnimations().length === 0)
  }, undefined, { timeout: 5000 })

  await settleCaptureMotion(page, screen, theme)
}

function paintRects(png, rects) {
  for (const r of rects) {
    const x0 = Math.max(0, Math.floor(r.x))
    const y0 = Math.max(0, Math.floor(r.y))
    const x1 = Math.min(png.width, Math.ceil(r.x + r.width))
    const y1 = Math.min(png.height, Math.ceil(r.y + r.height))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (png.width * y + x) << 2
        png.data[i] = 255
        png.data[i + 1] = 0
        png.data[i + 2] = 255
        png.data[i + 3] = 255
      }
    }
  }
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
const shots = []
let mintedInvite = false
let browser
let operatorContext
const env = { ...loadEnvLocal(root), ...process.env }

try {
  if (!(await waitForServer(base))) {
    console.error('visual-check: the server never came up. Did `corepack pnpm build` run?')
    process.exit(1)
  }

  browser = await chromium.launch({ args: FONT_STABLE_ARGS })
  if (env.VISUAL_OPERATOR_EMAIL && env.VISUAL_OPERATOR_PASSWORD) {
    operatorContext = await browser.newContext()
    await signInVisualOperator(operatorContext, env.VISUAL_OPERATOR_EMAIL, env.VISUAL_OPERATOR_PASSWORD, base)
  }

  for (const screen of SCREENS) {
    if (only && screen.slug !== only) continue

    let route = screen.route

    if (screen.data === 'invite-token') {
      try {
        const token = await mintVisualInvite()
        mintedInvite = true
        if (!token) throw new Error('mint returned no token')
        route = route.replace('__VISUAL_TOKEN__', token)
      } catch (err) {
        rows.push({ screen: screen.slug, status: 'BLOCKED', detail: `could not mint invite-token: ${err.message}` })
        continue
      }
    }

    // Does the route exist in this build?
    const probe = await fetch(base + route, { redirect: 'manual' })
    if (probe.status === 404) {
      rows.push({ screen: screen.slug, status: 'NO ROUTE', detail: route })
      continue
    }

    for (const view of VIEWPORTS) {
      for (const theme of THEMES) {
        const name = `${screen.slug}-${theme}-${view.slug}`
        const refFile = join(REF, `${name}.png`)
        if (!existsSync(refFile)) {
          rows.push({ screen: screen.slug, status: 'NO REF', detail: `${theme}/${view.slug}` })
          failures++
          continue
        }

        const page = await (operatorContext ?? browser).newPage({
          viewport: { width: view.width, height: view.height },
          deviceScaleFactor: 1,
        })
        await installCaptureClock(page)
        if (screen.data === 'desk') await installDeskFixtures(page, view.slug)
        await page.goto(base + route, { waitUntil: 'networkidle' })
        if (screen.slug === 'queue') {
          // The artboard shows an operator mid-review with the pending rows
          // selected. Since ACC-115 nothing is pre-selected on load (the old
          // pre-selection ticked already-approved rows), so select them the
          // way an operator does rather than faking the state.
          await page.getByRole('button', { name: 'Select all pending people' }).click()
        }
        if (screen.slug === 'submission') {
          // The approved artboard leaves the name, phone, and role at their
          // placeholder state. It captures the illustrative vehicle example
          // switched on, so exercise only that real interaction here. Use DOM
          // actions instead of locator actions: the source capture never
          // scrolls to the off-screen form on mobile, and scrolling it would
          // trigger the app's viewport reveal observer.
          await page.evaluate(() => {
            const reveal = document.querySelector('.reveal')
            if (!reveal) throw new Error('submission vehicle reveal is missing')
            window.__visualRevealSettled = new Promise((resolve) => {
              reveal.addEventListener('transitionend', (event) => {
                if (event.propertyName === 'grid-template-rows') resolve()
              }, { once: true })
            })
            const toggle = document.querySelector('[role="switch"]')
            if (!toggle) throw new Error('submission vehicle toggle is missing')
            toggle.click()
          })
          await page.evaluate(() => window.__visualRevealSettled)
          await page.evaluate(() => {
            const input = document.querySelector('#submission-vehicle')
            if (!input) throw new Error('submission vehicle field is missing')
            input.value = 'KA 05 MJ 8871'
            input.dispatchEvent(new Event('input', { bubbles: true }))
          })
        }
        if (screen.slug === 'gate' || screen.slug === 'vehicle') {
          await seedGateDexie(page, { vehicle: screen.slug === 'vehicle' })
          // goto, not reload: an unseeded /gate redirects to /gate/setup, so the
          // first load may have left the page there.
          await page.goto(base + route, { waitUntil: 'networkidle' })
          await page.context().setOffline(true)
          const captureState = GATE_CAPTURE_STATE[screen.slug]
          console.log(`  ${screen.slug}: fixture state ${captureState} (reference-aligned capture contract)`)
          if (screen.slug === 'gate' && captureState !== 'idle') {
            const input = page.getByLabel('Manual scanner input')
            await input.fill(`BOA26:${GATE_PERSON.passToken}`)
            await input.press('Enter')
            await page.getByText('Approved', { exact: true }).first().waitFor()
          } else if (screen.slug === 'vehicle' && captureState !== 'idle') {
            await page.getByLabel('Vehicle registration').fill(GATE_PLATE)
            // One press clears. It used to take two, because the button set the
            // plate check in state and read the stale value in the same click;
            // that bug is fixed, and the screen now keeps the plate on show.
            await page.getByRole('button', { name: 'Log entry and open gate' }).click()
            await page.locator('#vres h2.g-verdict').filter({ hasText: 'Cleared' }).waitFor()
          }
        }
        await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
        await waitForV2CaptureReady(page, screen.slug, theme)
        // Filling inputs and clicking buttons (the gate/vehicle flows above)
        // can leave the page scrolled away from the top. A `fullPage`
        // screenshot resizes the viewport to the full document height without
        // reflowing scroll position first, so a `position: sticky` header
        // gets captured frozen at its old scrolled offset — rendering twice:
        // once as a blank gap where it scrolled from, once frozen mid-page.
        // Resetting scroll before the shot is the fix, not a settle delay.
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.waitForTimeout(250)

        const landedOn = new URL(page.url()).pathname
        const rects = await maskRects(page, screen.slug)
        const shotPath = join(OUT, `${name}.actual.png`)
        await page.screenshot({ path: shotPath, fullPage: true })
        await page.close()

        const ref = PNG.sync.read(readFileSync(refFile))
        const act = PNG.sync.read(readFileSync(shotPath))
        paintRects(ref, rects)
        paintRects(act, rects)

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

        writeFileSync(join(OUT, `${name}.diff.png`), PNG.sync.write(diff))
        writeFileSync(join(OUT, `${name}.ref.png`), PNG.sync.write(ref))

        const ok = ratio <= THRESHOLD
        if (!ok) failures++
        const status = ok ? 'PASS' : 'FAIL'
        const redirected = landedOn !== new URL(base + route).pathname ? ` — REDIRECTED to ${landedOn}` : ''
        rows.push({
          screen: screen.slug,
          status,
          detail:
            `${theme}/${view.slug} ${pct}% (ref ${ref.width}x${ref.height}, got ${act.width}x${act.height})` +
            (rects.length ? ` · ${rects.length} masked` : '') +
            redirected,
        })
        shots.push({ name, status, pct, masks: rects.map((r) => r.reason), redirected })
      }
    }
  }
} finally {
  await operatorContext?.close()
  await browser?.close()
  server.kill('SIGTERM')
  if (mintedInvite) await wipeVisualInvite()
}

// ── Review page ───────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
writeFileSync(
  join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>visual-check</title>
<style>body{font:14px system-ui;margin:24px;background:#111;color:#eee}section{margin:0 0 48px}
h2{font-size:16px;margin:0 0 4px}.PASS{color:#00f5a5}.FAIL{color:#ff6b5a}.KNOWN{color:#e3bb72}
.row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;align-items:start}
figure{margin:0}figcaption{font-size:12px;opacity:.7;margin:0 0 4px}img{width:100%;border:1px solid #333}</style>
<p>Magenta = named mask (same region painted in reference and actual). Generated ${new Date().toISOString()}.</p>
${shots
  .map(
    (s) => `<section><h2>${esc(s.name)} <span class="${s.status.split(' ')[0]}">${s.status} ${s.pct}%</span>${esc(s.redirected)}</h2>
${s.masks.length ? `<p>Masks: ${[...new Set(s.masks)].map(esc).join(' · ')}</p>` : ''}
<div class="row"><figure><figcaption>reference</figcaption><img src="${s.name}.ref.png"></figure>
<figure><figcaption>actual</figcaption><img src="${s.name}.actual.png"></figure>
<figure><figcaption>diff</figcaption><img src="${s.name}.diff.png"></figure></div></section>`,
  )
  .join('\n')}`,
)

// ── Report ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log('\n  SCREEN         STATUS    DETAIL')
for (const r of rows) console.log(`  ${pad(r.screen, 14)} ${pad(r.status, 9)} ${r.detail}`)

const compared = new Set(
  rows.filter((r) => r.status === 'PASS' || r.status === 'FAIL').map((r) => r.screen),
)
const blocked = new Set(rows.filter((r) => r.status === 'BLOCKED').map((r) => r.screen))
const missing = new Set(rows.filter((r) => r.status === 'NO ROUTE').map((r) => r.screen))
const expected = only ? 1 : SCREENS.length

console.log(
  `\n  COVERAGE: ${compared.size}/${expected} screens compared · ${blocked.size} blocked · ${missing.size} not built · 0 known gaps`,
)
if (missing.size) console.log(`  not built: ${[...missing].join(', ')}`)
if (blocked.size) console.log(`  blocked:   ${[...blocked].join(', ')} — these are NOT verified`)
console.log(`  review:    test-results/visual/index.html`)

if (failures) {
  console.error(`\nvisual-check FAILED: ${failures} comparison(s) over their limit.`)
  console.error('The design is the contract. Open test-results/visual/index.html before changing the reference.')
  process.exit(1)
}

// A green tick that verified nothing is worse than a red one, because it gets
// quoted in a status update. Say plainly what was and was not checked.
if (compared.size === 0) {
  console.log('\nvisual-check: NOTHING COMPARED.')
  console.log('This is not a pass. It is the absence of a test.')
} else if (compared.size < expected) {
  console.log(`\nvisual-check OK for ${compared.size} of ${expected} screens at ${(THRESHOLD * 100).toFixed(1)}%.`)
  console.log('The rest are unverified, not passing.')
} else {
  console.log(`\nvisual-check OK — ${compared.size} screen(s) match the approved design.`)
}
