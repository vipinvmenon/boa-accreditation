// Captures the approved design's own rendering as the visual reference.
//
// The key decision: this does NOT re-implement renderVals() in Node. It opens
// design/source/boa_design_bundle.html in a real browser, lets it unpack and
// render itself, drives its own nav / theme / viewport controls, and
// screenshots the result.
//
// Why that matters. Any port of the design's logic is a second implementation,
// and a fidelity gate whose reference is a second implementation proves only
// that two of my own guesses agree. bar-control's design QA failed exactly this
// way: the reference and the app drifted together, and "the cheapest way to
// pass a screenshot comparison is to hardcode the screenshot's values".
// Rendering the artefact itself removes that whole class of error.
//
// Output: design/reference/<screen>-<theme>-<vp>.png  (7 x 2 x 2 = 28)
//         design/reference/manifest.json — metrics the gate and docs rely on.
//
// Run:  corepack pnpm design:reference

import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FONT_STABLE_ARGS } from './lib/browser.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'design/reference')
const BUNDLE = pathToFileURL(resolve(root, 'design/source/boa_design_v2.html')).href

/** The design's own nav labels -> the slug we file the screenshot under. */
const SCREENS = [
  { label: 'Control room', slug: 'control-room' },
  { label: 'Queue', slug: 'queue' },
  { label: 'Master list', slug: 'master' },
  { label: 'Submission', slug: 'submission' },
  { label: 'Passes', slug: 'passes' },
  { label: 'Gate', slug: 'gate' },
  { label: 'Vehicle', slug: 'vehicle' },
]

/** Viewports. The v2 layout responds to the real viewport through containers. */
const VIEWPORTS = [
  { slug: 'web', width: 1360, height: 900 },
  { slug: 'mob', width: 390, height: 844 },
]

const THEMES = ['dark', 'light']

/**
 * Screens whose real route is a PUBLIC surface (docs/ARCHITECTURE.md: invite
 * token or pass token, no login) rather than the desk. The bundle renders every
 * screen inside one persistent shell — logo, "Accred desk" nav to /desk/*, the
 * live BMS status strip — which is itself review furniture like the WEB/MOB/
 * LIGHT toggle DESIGN-SYSTEM.md already excludes: a vendor holding an invite
 * link is not an operator and must not see desk navigation or live ops numbers
 * that do not exist for them (boa_acc_desk_dashboard() is desk-only). Decided
 * 12 Sep 2026; see docs/CURRENT-STATE.md, ACC-025. The reference for these
 * screens is captured with that shell hidden so it matches what actually ships.
 */
const PUBLIC_SCREENS = new Set(['submission'])

/** Click a button by its exact trimmed text. The design has no test ids. */
async function clickByText(page, text) {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t)
    if (!b) return false
    b.click()
    return true
  }, text)
  if (!ok) throw new Error(`no button labelled "${text}" — the design's nav has changed`)
  await page.waitForTimeout(120)
}

/** The theme button is a toggle showing the theme it will switch TO. */
async function setTheme(page, want) {
  const current = await page.evaluate(
    () => document.querySelector('[data-theme]')?.getAttribute('data-theme') ?? null,
  )
  if (current === want) return
  await clickByText(page, want === 'light' ? 'Light' : 'Dark')
  const now = await page.evaluate(
    () => document.querySelector('[data-theme]')?.getAttribute('data-theme') ?? null,
  )
  if (now !== want) throw new Error(`theme toggle did not reach ${want} (got ${now})`)
}

const browser = await chromium.launch({ args: FONT_STABLE_ARGS })
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const manifest = { capturedAt: new Date().toISOString(), shots: [], fontProbe: null }
let n = 0

for (const view of VIEWPORTS) {
  const page = await browser.newPage({
    viewport: { width: view.width, height: view.height },
    deviceScaleFactor: 1,
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BUNDLE, { waitUntil: 'networkidle' })

  // Wait for the design's own readiness hook and an active screen, not a
  // timeout: a screenshot of an incomplete render is a green gate that proves
  // nothing. The v2 frame responds to the viewport; do not click its preview
  // "Mob" control because that adds a device mock to the capture.
  await page.waitForSelector('.screen.on[data-s]', { timeout: 30000 })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForSelector('[data-v2-ready="true"]', { state: 'attached', timeout: 30000 })
  await page.waitForTimeout(400)
  await page.evaluate(() => document.body.classList.remove('mob'))

  // Settle the Anton bold question once, with evidence, on the first pass.
  if (!manifest.fontProbe) {
    manifest.fontProbe = await page.evaluate(() => {
      const h1 = document.querySelector('h1')
      if (!h1) return null
      const cs = getComputedStyle(h1)
      return {
        fontFamily: cs.fontFamily,
        fontWeight: cs.fontWeight,
        fontSynthesis: cs.fontSynthesisWeight ?? cs.fontSynthesis ?? '(unsupported)',
        antonFacesLoaded: [...document.fonts]
          .filter((f) => f.family === 'Anton')
          .map((f) => `${f.weight}/${f.status}`),
      }
    })
  }

  for (const screen of SCREENS) {
    await clickByText(page, screen.label)
    const label = await page.evaluate(
      () => document.querySelector('.screen.on[data-s]')?.getAttribute('data-s') ?? null,
    )

    for (const theme of THEMES) {
      await setTheme(page, theme)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(150)

      // Hide review furniture for every capture and hide desk chrome for
      // public screens (see PUBLIC_SCREENS above). Restore both between SPA
      // iterations so a previous screen cannot leak its presentation state.
      await page.evaluate((hide) => {
        const nav = document.querySelector('.nav-wrap')
        const tools = document.querySelector('.tools')
        if (nav) nav.style.display = hide ? 'none' : ''
        if (tools) tools.style.display = 'none'
      }, PUBLIC_SCREENS.has(screen.slug))

      const file = `${screen.slug}-${theme}-${view.slug}.png`
      await page.screenshot({ path: join(OUT, file), fullPage: true })
      const h = await page.evaluate(() => document.documentElement.scrollHeight)
      manifest.shots.push({
        file,
        screen: screen.slug,
        designLabel: label,
        theme,
        vp: view.slug,
        width: view.width,
        fullPageHeight: h,
      })
      n++
      process.stdout.write(`  ${file}  ${view.width}x${h}\n`)
    }
  }

  if (errors.length) throw new Error(`design bundle raised page errors: ${errors.join('; ')}`)
  await page.close()
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
await browser.close()

console.log(`\ncapture-design-reference: ${n} references -> design/reference/`)
console.log('font probe (the Anton bold question):', JSON.stringify(manifest.fontProbe))
