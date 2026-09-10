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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF = join(root, 'design/reference')
const OUT = join(root, 'test-results/visual')

/** Fraction of differing pixels allowed. 0.8% absorbs font antialiasing
 *  between the bundle's own woff2 and @fontsource's, and nothing more. */
const THRESHOLD = 0.008

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

try {
  if (!(await waitForServer(base))) {
    console.error('visual-check: the server never came up. Did `corepack pnpm build` run?')
    process.exit(1)
  }

  const browser = await chromium.launch()

  for (const screen of SCREENS) {
    if (only && screen.slug !== only) continue

    // Does the route exist in this build?
    const probe = await fetch(base + screen.route, { redirect: 'manual' })
    const exists = probe.status !== 404

    if (!exists) {
      rows.push({ screen: screen.slug, status: 'NO ROUTE', detail: screen.route })
      continue
    }
    if (screen.auth) {
      rows.push({ screen: screen.slug, status: 'BLOCKED', detail: `needs ${screen.auth}` })
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

        const page = await browser.newPage({
          viewport: { width: view.width, height: view.height },
          deviceScaleFactor: 1,
        })
        await page.goto(base + screen.route, { waitUntil: 'networkidle' })
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

        const ok = ratio <= THRESHOLD
        if (!ok) failures++
        rows.push({
          screen: screen.slug,
          status: ok ? 'PASS' : 'FAIL',
          detail: `${theme}/${view.slug} ${pct}% (ref ${ref.width}x${ref.height}, got ${act.width}x${act.height})`,
        })
      }
    }
  }

  await browser.close()
} finally {
  server.kill('SIGTERM')
}

// ── Report ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
console.log('\n  SCREEN         STATUS    DETAIL')
for (const r of rows) console.log(`  ${pad(r.screen, 14)} ${pad(r.status, 9)} ${r.detail}`)

const built = new Set(rows.filter((r) => r.status === 'PASS' || r.status === 'FAIL').map((r) => r.screen))
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
