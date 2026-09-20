// Proves that every font weight the approved design declares is actually
// imported in app/layout.tsx.
//
// Why this is a gate and not a code review note: an unimported weight does not
// fail. The browser synthesises it, and the screen renders at a subtly wrong
// weight that survives review, survives a screenshot diff at low threshold, and
// is discovered on paper. bar-control's DESIGN-SYSTEM.md records the same trap
// ("an unloaded weight does not fall back gracefully").
//
// Run by scripts/check-design-tokens.mjs, which `pnpm lint` runs.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const design = readFileSync(join(root, 'design/source/boa_design_v2.html'), 'utf8')
const layout = readFileSync(join(root, 'app/layout.tsx'), 'utf8')

/** Weights the design declares, scoped per style attribute so a font-weight
 *  from a neighbouring rule cannot be misattributed. */
export function declaredWeights(html) {
  const use = new Map()
  const add = (fam, w) => {
    if (!use.has(fam)) use.set(fam, new Set())
    use.get(fam).add(w)
  }
  const aliases = { display: 'Anton', label: 'Oswald', body: 'Archivo', mono: 'JetBrains Mono' }
  for (const block of html.matchAll(/[^{}]+\{([^{}]*)\}/g)) {
    const decl = block[1]
    const fams = [...decl.matchAll(/font-family:\s*var\(--([a-z]+)\)/g)]
      .map((x) => aliases[x[1]])
      .filter(Boolean)
    const wts = [...decl.matchAll(/font-weight:\s*(\d{3})/g)].map((x) => x[1])
    for (const f of fams) {
      if (wts.length === 0) add(f, '400')
      else for (const w of wts) add(f, w)
    }
  }
  // <strong>/<b> and <h1>-<h6> carry no font-weight in the design and inherit
  // the UA stylesheet's bold. Attribute them to the family in scope.
  if (/<(?:strong|b)\b/.test(html)) add('Archivo', '700')
  return use
}

const importedWeights = (src) => {
  const use = new Map()
  for (const m of src.matchAll(/@fontsource\/([a-z-]+)\/(\d{3})\.css/g)) {
    const fam = m[1]
      .split('-')
      .map((p) => (p === 'jetbrains' ? 'JetBrains' : p[0].toUpperCase() + p.slice(1)))
      .join(' ')
    if (!use.has(fam)) use.set(fam, new Set())
    use.get(fam).add(m[2])
  }
  return use
}

const declared = declaredWeights(design)
const imported = importedWeights(layout)

// Anton ships 400 only. A design asking for bold Anton gets synthesis; that is
// the artefact's own behaviour and is settled by the visual gate, not here.
const SHIPS_ONLY_400 = new Set(['Anton'])

let failed = false
for (const [fam, weights] of declared) {
  const have = imported.get(fam) ?? new Set()
  const missing = [...weights].filter((w) => !have.has(w) && !(SHIPS_ONLY_400.has(fam) && w !== '400'))
  if (missing.length) {
    console.error(`  MISSING  ${fam}: design declares ${missing.join(', ')} — not imported in app/layout.tsx`)
    failed = true
  }
}

if (failed) {
  console.error('\nfont-weight audit FAILED. Import the missing weights in app/layout.tsx.')
  process.exit(1)
}
console.log(
  `font weights OK — v2 CSS ${[...declared].map(([f, w]) => `${f}(${[...w].sort().join('/')})`).join('  ')}`,
)
