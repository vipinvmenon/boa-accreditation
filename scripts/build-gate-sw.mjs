// Generates public/gate/sw.js from the REAL build output, after next build.
//
// The gate is the one surface that has to work with the radio off. Its route
// responses are cached during service-worker installation, while everything
// dynamic they need comes from IndexedDB. The routes render dynamically so
// Next can thread the per-request CSP nonce into its bootstrap scripts; the
// service worker captures each response, including its matching CSP header.
//
// This script reads the asset URLs Next actually emitted rather than guessing
// them, because a hashed asset name that changes between build and precache
// leaves the gate half-cached: it renders, and then fails on an import at 3am
// on a Saturday. bar-control's build-sw equivalent learned the same lesson.
//
// Deliberately NOT a PWA: no manifest, no install prompt, no update toast.
// This is a responsive web app with one offline surface.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const NEXT = join(root, '.next')
const OUT = join(root, 'public/gate/sw.js')

if (!existsSync(NEXT)) {
  console.error('build-gate-sw: no .next/ — run `next build` first')
  process.exit(1)
}

/** Every static asset Next emitted, as a URL path. */
function staticAssets() {
  const base = join(NEXT, 'static')
  if (!existsSync(base)) return []
  const out = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name)
      if (statSync(abs).isDirectory()) walk(abs)
      else out.push('/_next/static/' + relative(base, abs).split('\\').join('/'))
    }
  }
  walk(base)
  return out
}

const assets = staticAssets()
// woff2 only (every browser that can run this app supports it), and only the
// latin / latin-ext subsets. @fontsource also ships cyrillic, greek and
// vietnamese; unicode-range means the browser never downloads them for Indian
// names in Latin script, and precaching all 53 files would push ~570 KB onto a
// gate phone to no purpose. Names with diacritics are why latin-ext stays.
const fonts = assets.filter((p) => /\.woff2$/.test(p) && /-latin(-ext)?-/.test(p))
const css = assets.filter((p) => /\.css$/.test(p))
// Next 16's Turbopack build no longer emits app-build-manifest.json. Its
// client-reference manifest names route chunks indirectly, and omitting one
// transitive chunk makes the offline page render and then fail on import.
// The static output is content-hashed and immutable, so precache every emitted
// JavaScript asset. This is slightly broader than the gate's dependency graph,
// but it is deterministic and keeps the offline contract complete.
const scripts = assets.filter((p) => /\.js$/.test(p))

// zxing-wasm is the iOS scanning path — Safari has no BarcodeDetector. If this
// .wasm is not precached, every iPhone at the gate silently loses the camera.
const wasm = assets.filter((p) => /\.wasm$/.test(p))
const localWasm = existsSync(join(root, 'public/gate/zxing_reader.wasm'))
  ? ['/gate/zxing_reader.wasm']
  : []

/**
 * Only precache routes Next ACTUALLY emitted.
 *
 * caches.addAll() is all-or-nothing: one 404 and the whole install rejects, the
 * service worker never activates, and the gate silently loses offline support.
 * Listing a route that does not exist yet — as this did while /gate was still
 * unbuilt — is therefore not a harmless placeholder, it is a switch that turns
 * the offline gate off. Verified against production on 11 Sep: /gate,
 * /gate/vehicle and /gate/setup were all in the precache list and all 404ing.
 *
 * As of 14 Sep 2026 the gate routes render dynamically (`force-dynamic`), not
 * statically — required so middleware.ts's per-request CSP nonce can thread
 * into Next's App Router script propagation. They no longer appear in
 * prerender-manifest.json (that file only lists statically-generated routes),
 * so a build-time check against it would silently stop checking anything and
 * this exact class of bug could ship again unnoticed — the online-install
 * safety net in the generated service worker below is real, but it only
 * catches a missing route live, in a real browser, possibly at the gate
 * itself; the whole point of this file's original check was to catch it in
 * CI before a deploy ever happens. app-path-routes-manifest.json is Next's
 * ground truth for every App Router page it actually built, static or
 * dynamic — ask it instead of assuming these three still exist.
 */
function emittedAppRoutes() {
  const manifestPath = join(NEXT, 'app-path-routes-manifest.json')
  if (!existsSync(manifestPath)) return []
  return Object.values(JSON.parse(readFileSync(manifestPath, 'utf8')))
}

const emitted = emittedAppRoutes()
// ACC-150 retired /gate/setup (device-token pairing). The login page is
// deliberately NOT precached: it is outside the worker's /gate scope and it
// needs the network anyway.
const routes = ['/gate', '/gate/vehicle']
const missing = routes.filter((r) => !emitted.includes(r))
if (missing.length) {
  console.error(
    `build-gate-sw: ${missing.join(', ')} not found in app-path-routes-manifest.json — refusing to precache a route Next did not actually build.`,
  )
  process.exit(1)
}

const PRECACHE = [
  ...routes,
  '/assets/boa-logo.png',
  // The self-hosted Phosphor Light icon font. Lives under public/, which
  // Next copies through verbatim and staticAssets() above never scans (it
  // only walks .next/static) — the `fonts` filter's `-latin(-ext)?-` regex
  // was built for @fontsource's naming and would never have matched this
  // file even if it did. Missing entries here silently turn offline icons
  // off; explicit, like the logo above.
  '/fonts/phosphor-light.woff2',
  ...new Set([...scripts, ...css, ...fonts, ...wasm]),
  ...localWasm,
]

const sw = `// GENERATED by scripts/build-gate-sw.mjs — do not edit.
// Built ${new Date().toISOString()} from the .next/static asset output.
/* eslint-disable */
'use strict';

const CACHE = 'boa-gate-${Date.now().toString(36)}';
const PRECACHE = ${JSON.stringify(PRECACHE, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll is all-or-nothing, which is what we want: a half-populated cache
      // is worse than none, because it renders and then fails on an import.
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // NETWORK ONLY, always. The outbox is the queue. A service worker that
  // served a cached response for a write — or replayed one — would tell a
  // volunteer a wristband was recorded when it was not.
  if (url.pathname.startsWith('/api/')) return;

  // Hashed immutable assets: cache first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Gate navigations: cache first, so a cold start with the radio off renders.
  if (req.mode === 'navigate' && url.pathname.startsWith('/gate')) {
    event.respondWith(
      caches.match(url.pathname).then((hit) => hit || caches.match('/gate').then((g) => g || fetch(req)))
    );
    return;
  }

  if (PRECACHE.indexOf(url.pathname) !== -1) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, sw)
console.log(
  `build-gate-sw: ${PRECACHE.length} precached (${routes.length} routes, ${scripts.length} scripts, ${css.length} css, ${fonts.length} fonts, ${wasm.length + localWasm.length} wasm) -> public/gate/sw.js`,
)
if (wasm.length + localWasm.length === 0) {
  console.warn('build-gate-sw: NOTE no .wasm precached yet — the zxing fallback lands in Phase 4 (iOS has no BarcodeDetector).')
}
