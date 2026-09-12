// Extracts the image assets the approved design references out of the design
// bundle, into public/assets/, at build time.
//
// Why this exists rather than committing the PNGs: `design/source/boa_design_bundle.html`
// IS the design contract, and it is the only artefact Vipin's design tool produced.
// Committing a second copy of the logo alongside it creates two sources of truth for
// the same pixels, and the copy is the one that silently goes stale. boa-stok-form
// learned this and does the same thing (`scripts/extract-assets.mjs`, `public/assets`
// gitignored) — this is that script, retargeted at this bundle's manifest format.
//
// The bundle carries a `<script type="__bundler/manifest">` JSON object mapping
// opaque asset ids to { mime, compressed, data(base64) }. The design markup
// references those ids directly as `src`/`url()` values, so the id IS the filename
// the transcribed components must reference.
//
// Fonts are deliberately NOT extracted: they are Google fonts loaded through
// next/font (Anton, Oswald, Archivo, JetBrains Mono). Pulling the bundle's woff2
// subsets would give us a second, differently-subsetted copy of the same faces.

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(root, 'design/source/boa_design_bundle.html')
const OUT = join(root, 'public/assets')
const GATE_OUT = join(root, 'public/gate')
const ZXING_WASM = join(root, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')

// The two ids the design markup actually references, and the names we give them.
// Named explicitly rather than "extract every image" so that an unreferenced asset
// appearing in a future bundle cannot silently bloat the deploy.
const WANTED = {
  '07e53085-c5b9-4695-acf2-acce2a7ec1b7': 'boa-logo.png', // nav lockup + pass card header
  'ed2b82dc-1838-41da-b849-4eda1919e1c0': 'boa-poster.png', // Control room hero
}

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg', 'image/webp': 'webp' }

function manifest(html) {
  const open = html.indexOf('<script type="__bundler/manifest">')
  if (open < 0) throw new Error('no __bundler/manifest in the design bundle')
  const start = html.indexOf('>', open) + 1
  const end = html.indexOf('</script>', start)
  if (end < 0) throw new Error('unterminated __bundler/manifest')
  return JSON.parse(html.slice(start, end).trim())
}

const html = readFileSync(BUNDLE, 'utf8')
const assets = manifest(html)

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

function optimiseLogo(bytes) {
  const source = PNG.sync.read(bytes)
  const optimised = PNG.sync.write(source, {
    deflateLevel: 9,
    deflateStrategy: 0,
    filterType: 0,
  })
  const roundTrip = PNG.sync.read(optimised)

  // Compression may change the file bytes, but never the rendered pixels.
  if (
    source.width !== roundTrip.width ||
    source.height !== roundTrip.height ||
    !source.data.equals(roundTrip.data)
  ) {
    throw new Error('lossless logo optimisation changed the rendered pixels')
  }

  return optimised
}

let written = 0
for (const [id, name] of Object.entries(WANTED)) {
  const entry = assets[id]
  // Fail loudly. A missing asset must not become a broken <img> discovered at a gate.
  if (!entry) throw new Error(`asset ${id} (${name}) is not in the bundle manifest`)

  let bytes = Buffer.from(entry.data, 'base64')
  if (entry.compressed) bytes = gunzipSync(bytes)

  const ext = EXT[entry.mime]
  if (!ext) throw new Error(`asset ${id} has unexpected mime ${entry.mime}`)
  if (!name.endsWith('.' + ext)) throw new Error(`asset ${id} is ${entry.mime} but named ${name}`)

  const originalSize = bytes.length
  if (name === 'boa-logo.png') bytes = optimiseLogo(bytes)

  writeFileSync(join(OUT, name), bytes)
  const saving = originalSize === bytes.length ? '' : ` (from ${(originalSize / 1024).toFixed(0)} KB)`
  console.log(`  ${name}  ${(bytes.length / 1024).toFixed(0)} KB${saving}  ${entry.mime}`)
  written++
}

console.log(`extract-assets: ${written} asset(s) -> public/assets/`)

// iOS Safari has no BarcodeDetector. Copy the reader binary into the gate
// service-worker scope so the fallback is available with the radio off.
if (!existsSync(ZXING_WASM)) {
  throw new Error(`missing zxing-wasm reader binary: ${ZXING_WASM}`)
}
mkdirSync(GATE_OUT, { recursive: true })
copyFileSync(ZXING_WASM, join(GATE_OUT, 'zxing_reader.wasm'))
console.log('extract-assets: zxing_reader.wasm -> public/gate/')
