// The design-fidelity lint gate. Replaces bar-control's check-classes.mjs,
// which policed class names — this project has almost none, because the design
// is inline styles and we transcribe them verbatim (docs/DESIGN-SYSTEM.md).
//
// What can silently drift here instead is COLOUR. Three checks:
//
//  1. Every [data-theme] token in app/globals.css still matches the design
//     source byte-for-byte. This is the contract; drift is a defect.
//  2. lib/design.ts's PROP layer still matches the design's renderVals()
//     literals. The two layers disagree on six values ON PURPOSE (C8), so a
//     well-meaning "fix" that reconciles them is exactly the failure mode.
//  3. No raw hex outside the files allowed to carry one. A hex in a component
//     is a value that no longer tracks the design.
//
// Plus the font-weight audit, which is its own script.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const designV1 = read('design/source/boa_design_body.html')
const designV2 = read('design/source/boa_design_v2.html')
let failed = false
const fail = (msg) => {
  console.error(`  ${msg}`)
  failed = true
}

// ── 1. Theme tokens ────────────────────────────────────────────────────────
const themeTokens = (src) => {
  const out = new Map()
  for (const m of src.matchAll(/\[data-theme="(dark|light)"\]\s*\{([^}]*)\}/g)) {
    for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out.set(`${m[1]}.${d[1]}`, d[2].trim())
    }
  }
  return out
}
const want = themeTokens(designV2)
const got = themeTokens(read('app/globals.css'))
if (want.size === 0) fail('could not parse any theme tokens out of the design source')
for (const [k, v] of want) {
  if (!got.has(k)) fail(`globals.css is missing ${k} (design says ${v})`)
  else if (got.get(k) !== v) fail(`globals.css ${k} = ${got.get(k)} but the design says ${v}`)
}

// ── 1b. r10 tokens (ADR-027) ───────────────────────────────────────────────
// app/r10/tokens.css (ACC-180) must carry the frozen r10 source's values for
// every token name the source defines. The app's blocks are `.r10` (dark and
// base) and `[data-theme="light"] .r10`; the source's are `:root` and
// `:root, [data-theme="dark"]` (dark and base) and `[data-theme="light"]`.
// New token names are allowed: collapsing the r9 to r10.5 layers turns
// literals into tokens. A deliberate change to a source value goes in
// R10_AMENDED with its reason, and nowhere else.
const R10_AMENDED = {
  'dark.--f-body':
    "ACC-178: Instrument Sans ships from @fontsource-variable, so the family is 'Instrument Sans Variable'; the proposal's --f-body-pick switcher is proposal tooling",
  // 'light.--ink-3': 'F-14: 4.5:1 on the light ground',
}
const r10Src = 'design/source/r10/r8/tokens.css'
const r10App = 'app/r10/tokens.css'
let r10Count = 0
if (existsSync(join(root, r10App))) {
  const blocks = (src, sel) => {
    const out = new Map()
    for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const theme = sel(m[1].trim())
      if (!theme) continue
      for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(`${theme}.${d[1]}`, d[2].trim().replace(/\s+/g, ' '))
    }
    return out
  }
  const srcSel = (s) => (/^:root(, \[data-theme="dark"\])?$/.test(s) ? 'dark' : s === '[data-theme="light"]' ? 'light' : null)
  const appSel = (s) => (s === '.r10' ? 'dark' : /^\[data-theme="light"\] \.r10$/.test(s) ? 'light' : null)
  const want10 = blocks(read(r10Src), srcSel)
  const got10 = blocks(read(r10App), appSel)
  if (want10.size === 0) fail(`could not parse any tokens out of ${r10Src}`)
  for (const [k, v] of want10) {
    r10Count++
    if (R10_AMENDED[k]) continue
    if (!got10.has(k)) fail(`${r10App} is missing ${k} (r10 says ${v})`)
    else if (got10.get(k) !== v) fail(`${r10App} ${k} = ${got10.get(k)} but r10 says ${v}`)
  }
}

// ── 2. The PROP layer ──────────────────────────────────────────────────────
const propFromDesign = (source) => {
  const out = { dark: {}, light: {} }
  // e.g.  const ink2 = dark ? '#A6C9B4' : 'rgba(20,20,26,0.76)';
  const re = /const (grn|gold|bad|ink|ink2|ink3|rule|grnbg|goldbg|badbg|on) = dark \? '([^']+)' : '([^']+)';/g
  for (const m of source.matchAll(re)) {
    out.dark[m[1]] = m[2]
    out.light[m[1]] = m[3]
  }
  return out
}
const wantProp = propFromDesign(designV1)
const designTs = read('lib/design.ts')
const propFromTs = (theme) => {
  const block = designTs.match(new RegExp(`${theme}: \\{([\\s\\S]*?)\\n  \\}`))
  if (!block) return {}
  const out = {}
  for (const m of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) out[m[1]] = m[2]
  return out
}
if (Object.keys(wantProp.dark).length < 10) fail('could not parse renderVals() colour literals from the design source')
for (const theme of ['dark', 'light']) {
  const gotProp = propFromTs(theme)
  for (const [k, v] of Object.entries(wantProp[theme])) {
    if (gotProp[k] !== v) fail(`lib/design.ts PROP.${theme}.${k} = ${gotProp[k]} but renderVals() says ${v}`)
  }
}

// ── 3. Stray hex ───────────────────────────────────────────────────────────
// Files permitted to carry a raw hex, and why.
const HEX_ALLOWED = new Set([
  'lib/design.ts', // the PROP layer itself
  'app/globals.css', // the transcribed helmet block
  'app/layout.tsx', // the <body> fallback + themeColor
  'app/v2.css', // v2's fixed light QR plate from the approved source
  'app/r10/tokens.css', // the r10 token layer (ADR-027); every other r10 file uses tokens
])
const walk = (dir, acc = []) => {
  // A fresh clone does not contain empty scaffold directories: git does not
  // track them. This crashed CI on the first run while passing locally, which
  // is the exact failure mode a gate must not have — it has to work on a clone,
  // not only on the machine that created the tree.
  if (!existsSync(join(root, dir))) return acc
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name)
    if (/^(node_modules|\.next|\.git|design|public|supabase|tests|scripts)$/.test(name)) continue
    const st = statSync(join(root, rel))
    if (st.isDirectory()) walk(rel, acc)
    else if (/\.(tsx?|css)$/.test(name)) acc.push(rel)
  }
  return acc
}
for (const file of walk('app').concat(walk('components'), walk('lib'), walk('gate'))) {
  if (HEX_ALLOWED.has(file.split('/').join('/'))) continue
  const src = read(file)
  for (const m of src.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const line = src.slice(0, m.index).split('\n').length
    // A transcribed inline fallback `var(--x, #RRGGBB)` IS the design's own
    // markup and must be kept verbatim. Only bare hex is a defect.
    const ctx = src.slice(Math.max(0, m.index - 40), m.index)
    if (/var\(--[a-z0-9]+,\s*$/.test(ctx)) continue
    fail(`${relative('.', file)}:${line} raw hex ${m[0]} — use lib/design.ts or a var(--token, fallback)`)
  }
}

if (failed) {
  console.error('\ndesign-token check FAILED.')
  console.error('If you believe the design source is wrong, that is a conversation with Vipin,')
  console.error('not an edit to globals.css. See docs/DESIGN-SYSTEM.md.')
  process.exit(1)
}
console.log(`design tokens OK — ${want.size} theme tokens, ${r10Count ? `${r10Count} r10 tokens` : 'r10 not built yet'}, ${Object.keys(wantProp.dark).length} prop colours, no stray hex`)
