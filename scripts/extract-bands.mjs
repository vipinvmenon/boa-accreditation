// ACC-174 — cut the eight wristband strips out of the printed pack's
// "Festival Area" zone sheet, which shows every tier at full saturation in
// one column. PLACEHOLDERS: this sheet is a 2000px JPEG of the print, so each
// strip comes out ~1590px wide and a little soft. When the 3900×236 masters
// arrive (ACC-171), commit them as design/assets-source/bands/<tier>.png and
// they are used instead — no code change.
//
// Runs in `build`, like extract-assets.mjs: public/assets/ is derived and
// gitignored; the committed sources are the record.
//
//   node scripts/extract-bands.mjs
//
// Rows are found, not hardcoded: the strips are the only non-white runs down
// a column through the artwork, top to bottom in the sheet's order.

import { copyFileSync, existsSync, mkdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// sharp ships with Next (pnpm keeps it beside next's real path, not the
// symlink), so resolve it from there rather than adding a dependency.
const require = createRequire(realpathSync(join(root, 'node_modules/next/package.json')))
const sharp = require('sharp')

const SOURCE = join(root, 'design/assets-source/zone-festival-area.jpg')
const MASTERS = join(root, 'design/assets-source/bands')
const OUT = join(root, 'public/assets/bands')

// Top-to-bottom order of the "ALLOWED IN" list on the Festival Area sheet.
const ORDER = ['general_admission', 'eddies_lounge', 'promoters_lounge', 'aaa', 'crew', 'artist', 'stage', 'photo']

const { data, info } = await sharp(SOURCE).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const px = (x, y) => {
  const i = (y * info.width + x) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}
const isWhite = ([r, g, b]) => r > 240 && g > 240 && b > 240

// A row belongs to a strip if most of it, across the art, is not paper-white.
// Counting the whole row rides over white lettering; the gaps between strips
// are pure paper.
const rowIsBand = (y) => {
  let ink = 0
  for (let x = 80; x < 1600; x += 4) if (!isWhite(px(x, y))) ink++
  return ink > 190
}

const runs = []
let start = null
for (let y = 250; y < info.height - 250; y++) {
  if (rowIsBand(y) && start === null) start = y
  if (!rowIsBand(y) && start !== null) {
    if (y - start > 60) runs.push([start, y - 1])
    start = null
  }
}
if (runs.length !== ORDER.length) {
  throw new Error(`expected ${ORDER.length} strips, found ${runs.length}: ${JSON.stringify(runs)}`)
}

// Left and right edges: columns where most of the first strip's height is
// not paper. White lettering never fills a column; the black tier label
// beside the strip is a quarter of its height, so it falls outside.
const [t0, b0] = runs[0]
const colIsBand = (x) => {
  let ink = 0
  for (let y = t0; y <= b0; y++) if (!isWhite(px(x, y))) ink++
  return ink > (b0 - t0) * 0.6
}
let left = 0
while (!colIsBand(left)) left++
let right = info.width - 1
while (!colIsBand(right)) right--

mkdirSync(OUT, { recursive: true })
for (const [i, [top, bottom]] of runs.entries()) {
  // Inset 2px on every side so no paper-white fringe survives the JPEG edge.
  const region = { left: left + 2, top: top + 2, width: right - left - 4, height: bottom - top - 4 }
  const file = join(OUT, `${ORDER[i]}.webp`)
  const master = join(MASTERS, `${ORDER[i]}.png`)
  if (existsSync(master)) {
    await sharp(master).resize({ width: 2400, withoutEnlargement: true }).webp({ quality: 82 }).toFile(file)
    console.log(`${ORDER[i].padEnd(18)} master`)
  } else {
    await sharp(SOURCE).extract(region).webp({ quality: 82 }).toFile(file)
    console.log(`${ORDER[i].padEnd(18)} placeholder ${region.width}×${region.height}`)
  }
}

// The pass page's backdrop (ACC-174). boa-poster.png is 2.4 MB — fine for the
// desk, too heavy for a link opened from WhatsApp on festival 4G. A 900px WebP
// covers a phone at 2x behind a dimmed layer. extract-assets.mjs writes the
// PNG first (it runs before this script in `build`).
const POSTER = join(root, 'public/assets/boa-poster.png')
if (existsSync(POSTER)) {
  const out = join(root, 'public/assets/pass-poster.webp')
  await sharp(POSTER).resize({ width: 900 }).webp({ quality: 68 }).toFile(out)
  console.log('pass-poster        900w webp')
  // The sign-in page's poster panel (ACC-176) is ~900px wide on a laptop at 2x.
  await sharp(POSTER).resize({ width: 1600 }).webp({ quality: 72 }).toFile(join(root, 'public/assets/login-poster.webp'))
  console.log('login-poster       1600w webp')
} else {
  throw new Error('public/assets/boa-poster.png missing — run scripts/extract-assets.mjs first')
}

// The r10 ambient layer behind every surface (app/r10/base.css): the mockup's
// own 32×40 poster thumbnail, soft once scaled up. Copied verbatim.
copyFileSync(join(root, 'design/source/r10/r8/img/ambient-40.png'), join(root, 'public/assets/ambient-40.png'))
console.log('ambient-40         copied')

// The Control room hero (control-room-screen.module.css): a 2400px q84 WebP
// of the 8640px festival artwork (Vipin, 29 Sep). The 29 MB original stays
// out of git; this approved cut is the committed source. Copied verbatim.
copyFileSync(join(root, 'design/assets-source/control-room-art.webp'), join(root, 'public/assets/control-room-art.webp'))
console.log('control-room-art   copied')
