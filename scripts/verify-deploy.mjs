// Verifies what is ACTUALLY live, not what we believe we deployed.
//
// This exists because every config in vercel.json is the kind that fails
// silently: a wrong `source` pattern does not error, it simply never matches,
// and the header you thought you shipped is absent. The only way to know is to
// ask the running site.
//
// It has already earned its place: the first run of these checks by hand found
// the service worker precaching three routes that 404, which would have made
// caches.addAll() reject and silently disabled offline support at the gate.
//
// Usage:
//   corepack pnpm verify:deploy                       # accred.bangaloreopenair.com
//   corepack pnpm verify:deploy -- https://foo.vercel.app

const DEFAULT_HOST = 'https://accred.bangaloreopenair.com'
const cliArgs = process.argv.slice(2).filter((arg) => arg !== '--')
const base = (cliArgs[0] ?? DEFAULT_HOST).replace(/\/$/, '')

let failed = 0
const results = []
const check = (name, ok, detail) => {
  results.push({ name, ok, detail })
  if (!ok) failed++
}
// For a claim this script cannot reliably prove either way from wherever it
// happens to run — never a pass/fail signal, always printed.
const info = (name, detail) => {
  results.push({ name, ok: true, detail, info: true })
}

const get = async (path, init) => {
  try {
    return await fetch(base + path, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      ...init,
    })
  } catch (e) {
    return { status: 0, headers: new Headers(), error: e.message, text: async () => '' }
  }
}

console.log(`verify-deploy: ${base}\n`)

// ── 1. The site is up and is ours ─────────────────────────────────────────
// ADR-013 (13 Sep 2026): root is `redirect('/desk/login')`, not a rendered
// 200 page — "Sign in should be the page," per Vipin's own words in
// docs/CURRENT-STATE.md. So root itself is checked only for that redirect;
// the actual page content (title, noindex meta, serving region) is checked
// on /desk/login, the page a visitor is actually shown.
const root = await get('/')
check(
  'root redirects to /desk/login',
  root.status === 307 && root.headers.get('location') === '/desk/login',
  `HTTP ${root.status} -> ${root.headers.get('location') ?? '(no location)'}${root.error ? ' ' + root.error : ''}`,
)
const login = await get('/desk/login')
const html = login.status === 200 ? await login.text() : ''
check('serves this app', /BOA Accreditation/.test(html), html ? 'found <title>' : 'no body')
// Informational, not pass/fail — found 14 Sep 2026 failing on every CI run.
// The serving POP is whichever edge is nearest the REQUESTER; vercel.json's
// `regions: ["bom1"]` pins serverless FUNCTION execution only. A GitHub
// Actions runner far from Mumbai legitimately shows a different POP, so this
// must never fail the script.
info('serving edge POP (informational, region-cache is requester-local, not "regions":["bom1"])', login.headers.get('x-vercel-id') ?? '(no x-vercel-id)')

// ACC-100 (19 Sep 2026): /desk/login was prerendered, so the CDN served
// <script> tags with no nonce while middleware.ts sent a fresh nonce CSP —
// the browser blocked every script and production login was a blank page
// for days, while every check above still passed. Assert the page is
// rendered per request AND that every script carries this response's nonce.
const csp = login.headers.get('content-security-policy') ?? ''
const nonce = /'nonce-([^']+)'/.exec(csp)?.[1] ?? ''
check('/desk/login CSP carries a nonce', nonce !== '', csp || '(no CSP header)')
check(
  '/desk/login is rendered per request, not prerendered',
  login.headers.get('x-nextjs-prerender') === null,
  `x-nextjs-prerender: ${login.headers.get('x-nextjs-prerender') ?? '(absent)'}`,
)
const scripts = html.match(/<script\b[^>]*>/g) ?? []
const unstamped = scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`))
check(
  "every /desk/login <script> carries the response's nonce",
  nonce !== '' && scripts.length > 0 && unstamped.length === 0,
  `${scripts.length - unstamped.length}/${scripts.length} stamped`,
)

// ── 2. Security headers. Each is one silently-wrong `source` away from absent ──
const wantHeaders = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-frame-options': 'DENY',
  'strict-transport-security': /max-age=\d+/,
  'permissions-policy': /camera=\(self\)/,
}
for (const [h, want] of Object.entries(wantHeaders)) {
  const got = root.headers.get(h)
  const ok = typeof want === 'string' ? got === want : want.test(got ?? '')
  check(`header ${h}`, ok, got ?? '(absent)')
}
check('x-powered-by suppressed', root.headers.get('x-powered-by') === null, root.headers.get('x-powered-by') ?? 'absent')

// ── 3. Nothing indexable. A crawled /p/<pass_token> publishes a credential ──
// (/s/probe used to be checked alongside /p/probe here; the vendor
// submission route it probed was retired by ADR-019, 22 Sep.)
check('/desk/login <meta robots> noindex', /name="robots"[^>]*noindex/.test(html), 'in <head>')
for (const p of ['/p/probe']) {
  const r = await get(p)
  check(`${p} X-Robots-Tag noindex`, /noindex/.test(r.headers.get('x-robots-tag') ?? ''), r.headers.get('x-robots-tag') ?? '(absent)')
  // 404 and not 403: a 403 on a real token and a 404 on a fake one lets anyone
  // probe which tokens exist.
  check(`${p} is 404 not 403`, r.status !== 403, `HTTP ${r.status}`)
}

// ── 4. The gate service worker ────────────────────────────────────────────
const sw = await get('/gate/sw.js')
check('/gate/sw.js served', sw.status === 200, `HTTP ${sw.status}`)
if (sw.status === 200) {
  check(
    'Service-Worker-Allowed: /gate',
    sw.headers.get('service-worker-allowed') === '/gate',
    sw.headers.get('service-worker-allowed') ?? '(absent)',
  )
  check('sw.js is no-cache', /no-cache/.test(sw.headers.get('cache-control') ?? ''), sw.headers.get('cache-control') ?? '(absent)')

  // THE IMPORTANT ONE. caches.addAll() is all-or-nothing: a single 404 in the
  // precache list rejects the whole install and the gate loses offline support
  // with no error anyone will see.
  const body = await sw.text()
  const m = body.match(/const PRECACHE = (\[[\s\S]*?\]);/)
  if (!m) {
    check('sw precache list parseable', false, 'PRECACHE not found')
  } else {
    const urls = JSON.parse(m[1])
    const bad = []
    await Promise.all(
      urls.map(async (u) => {
        const r = await get(u)
        if (r.status !== 200) bad.push(`${u} -> ${r.status}`)
      }),
    )
    check(
      `all ${urls.length} precached URLs resolve`,
      bad.length === 0,
      bad.length ? bad.slice(0, 5).join(', ') : 'caches.addAll() would succeed',
    )
  }
}

// ── Report ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n)
for (const r of results) console.log(`  [${r.info ? 'in' : r.ok ? 'ok' : 'XX'}] ${pad(r.name, 40)} ${r.detail}`)

const scored = results.filter((r) => !r.info)
if (failed) {
  console.error(`\nverify-deploy FAILED: ${failed} of ${scored.length} checks.`)
  process.exit(1)
}
console.log(`\nverify-deploy OK — ${scored.length} checks against the live site.`)
