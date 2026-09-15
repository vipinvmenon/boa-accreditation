// Gates against two things v2's readiness review found nothing preventing
// (docs/DECISIONS.md, ADR-013): finance vocabulary creeping into an app that
// must never collect or display money (non-negotiable #8, CLAUDE.md), and
// stray `console.log` debug output reaching a built bundle.
//
// A third check — the design's WEB/MOB toggle (`vpTabs`) — was dropped here.
// ACC-034 originally set out to strip it as a "design-review affordance,
// not shipped." docs/DESIGN-SYSTEM.md's Responsive section has since been
// corrected: the toggle **ships**, as a real indicator of the active layout
// (driven by the same MOBILE_BREAKPOINT_PX media query as every other
// `mob ? A : B`), because in the design source the toggle's highlight and
// the state that drives the whole layout are the same variable — treating
// it as inert furniture was the wrong read of the source. See
// app/gate/gate-chrome.tsx (`g-vp-web`/`g-vp-mob`) and app/responsive.css.
//
// Runs against source (app/, lib/, components/), the same surface
// check-design-tokens.mjs walks — not the compiled .next output, which
// bundles vendor code (@supabase/supabase-js ships its own console.log
// calls) that this project does not control and cannot fix.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

let failed = false
const fail = (file, line, msg) => {
  console.error(`  ${relative('.', file)}:${line} ${msg}`)
  failed = true
}

const walk = (dir, acc = []) => {
  // A fresh clone does not contain empty scaffold directories: git does not
  // track them, so this must not assume `dir` exists.
  if (!existsSync(join(root, dir))) return acc
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name)
    if (/^(node_modules|\.next|\.git)$/.test(name)) continue
    const st = statSync(join(root, rel))
    if (st.isDirectory()) walk(rel, acc)
    else if (/\.(tsx?|css)$/.test(name)) acc.push(rel)
  }
  return acc
}

const files = walk('app').concat(walk('lib'), walk('components'))

// ── 1. Finance vocabulary ──────────────────────────────────────────────────
// CLAUDE.md non-negotiable #8: "Integer money, if money ever appears. It
// should not." This app never handles or displays money; a finance term
// showing up is the first sign that boundary is being crossed.
const FINANCE_TERMS = [
  'invoice', 'payment', 'price', 'pricing', 'billing', 'refund', 'checkout',
  'subtotal', 'discount', 'currency', 'rupee', 'wallet',
]
const FINANCE_RE = new RegExp(`\\b(${FINANCE_TERMS.join('|')})\\b`, 'i')
for (const file of files) {
  const src = read(file)
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return // comments may discuss why money is absent
    const m = line.match(FINANCE_RE)
    if (m) fail(file, i + 1, `finance term "${m[1]}" — this app must never handle money`)
    if (line.includes('₹')) fail(file, i + 1, 'rupee sign (₹) — this app must never display money')
  })
}

// ── 2. Debug console.log ────────────────────────────────────────────────────
// console.warn/error are legitimate; console.log is always debug output that
// should not reach a build.
for (const file of files) {
  const src = read(file)
  src.split('\n').forEach((line, i) => {
    if (/console\.log\s*\(/.test(line)) fail(file, i + 1, 'console.log must not reach the build — remove it')
  })
}

// ── 3. Visual fixture names ─────────────────────────────────────────────────
// test:visual feeds the design's own names through /api/desk/* (see
// scripts/visual-fixtures/desk.mjs). The cheapest way to pass a screenshot
// comparison is to hardcode the screenshot's values (CLAUDE.md, "How the
// sibling project got here"); a fixture name in shipped source is exactly that.
const { FIXTURE_SENTINELS } = await import('./visual-fixtures/desk.mjs')
for (const file of files) {
  const src = read(file)
  src.split('\n').forEach((line, i) => {
    const hit = FIXTURE_SENTINELS.find((name) => line.includes(name))
    if (hit) fail(file, i + 1, `visual fixture value "${hit}" in shipped source — screens must render it from data, not hardcode it`)
  })
}

if (failed) {
  console.error('\ncheck-bundle-content FAILED.')
  process.exit(1)
}
console.log(`check-bundle-content OK — ${files.length} files, no finance terms, no console.log`)
