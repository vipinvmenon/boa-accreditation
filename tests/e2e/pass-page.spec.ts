import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'

/**
 * ACC-144 · /p/[passToken], from mocked data.
 *
 * Why this spec cannot mock the way every other file in this directory does:
 * queue.spec.ts and desk-tiers.spec.ts use `page.route()` to intercept
 * `/api/desk/*` requests the BROWSER makes after the shell has loaded — those
 * pages are client components. /p/[passToken] is deliberately the opposite
 * (docs/ARCHITECTURE.md: `force-dynamic`, a real Server Component, so a stale
 * prerendered pass can never be served — see ACC-120's nonce history in
 * docs/CURRENT-STATE.md). Its data comes from resolvePassView()
 * (app/api/p/[passToken]/route.ts) calling boa_acc_pass_view IN THE NODE
 * PROCESS via the service-role client, before any HTML reaches the browser.
 * `page.route()` only sees requests the browser issues, so it cannot touch
 * this call no matter how it is phrased.
 *
 * What actually happens here instead: `@supabase/supabase-js`'s `.rpc()` is,
 * underneath, one POST to `${SUPABASE_URL}/rest/v1/rpc/<fn>` (confirmed by
 * reading node_modules/@supabase/postgrest-js's PostgrestClient.rpc — no
 * document asserted this, it was read). `beforeAll` below binds a tiny
 * PostgREST-shaped HTTP stub on a fixed local port and playwright.config.ts
 * points `SUPABASE_URL` at it for the whole webServer process. Because
 * `supabaseAdmin()` builds its client lazily per request (nothing touches the
 * network at import time), the Next server can boot with that address long
 * before anything is listening there — it only matters once a test actually
 * navigates to a `/p/*` route, which happens after this file's stub is up.
 * This exercises the real production code path end to end (Server Component
 * → route handler → service-role RPC call → Zod → QR render → HTML), not a
 * re-implementation of it, from data this file owns rather than a live
 * database — nothing here asserts anything about a real database.
 */

const MOCK_PORT = 4312
const VALID_TOKEN = 'AbCdEfGhIjKlMnOpQrSt-_' // 22 chars — shape passTokenParamSchema accepts
const UNAPPROVED_SHAPED_TOKEN = 'ZzZzZzZzZzZzZzZzZzZzZz' // same shape, never "approved" by the stub

const FIXTURE_PASS = {
  fullName: 'Asha Rao',
  role: 'Stage tech, build and show',
  vehicleReg: 'KA05MJ8871',
  orgName: 'Chakra Sound & Light',
  passRef: 'BOA26-0412',
  typeCode: 'stage',
  dayValidity: 'build_show',
}

let server: Server

test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rest/v1/rpc/boa_acc_pass_view') {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        let token: unknown
        try {
          token = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')['p_token']
        } catch {
          token = undefined
        }
        res.setHeader('Content-Type', 'application/json')
        if (token === VALID_TOKEN) {
          res.writeHead(200)
          res.end(JSON.stringify(FIXTURE_PASS))
          return
        }
        // Same shape for an unknown token, a voided one and a merely-submitted
        // one — boa_acc_pass_view (202609221400) raises one 'not found' for
        // all three; this stub only needs to reproduce that one outcome.
        res.writeHead(400)
        res.end(JSON.stringify({ message: 'not found', code: 'P0002' }))
      })
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((resolve) => server.listen(MOCK_PORT, '127.0.0.1', () => resolve()))
})

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  )
})

test.describe('/p/[passToken] (ACC-144)', () => {
  test('renders an approved person\'s pass: name, org, tier, validity dates, zones, QR, vehicle', async ({ page }) => {
    const response = await page.goto(`/p/${VALID_TOKEN}`)
    expect(response?.status()).toBe(200)

    await expect(page.getByText('Asha Rao')).toBeVisible()
    await expect(page.getByText('Chakra Sound & Light')).toBeVisible()
    await expect(page.getByText('BOA26-0412')).toBeVisible()
    await expect(page.getByText('KA05MJ8871')).toBeVisible()
    await expect(page.locator('.bandbox b')).toHaveText('Stage')
    // ADR-025: the tier's woven band leads the card, and the file really loads.
    const band = page.getByRole('img', { name: 'Stage wristband' })
    await expect(band).toBeVisible()
    await expect(band).toHaveAttribute('src', '/assets/bands/stage.webp')
    expect(await band.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
    // Plain-words validity with real dates (lib/pass-copy.ts), not just the
    // short desk label.
    await expect(page.getByText(/Build \+ show/)).toBeVisible()
    await expect(page.getByText(/5.9 Oct and 10 Oct 2026/)).toBeVisible()
    // A scannable QR actually rendered, not a placeholder.
    const qr = page.locator('.qr svg')
    await expect(qr).toBeVisible()
    expect(await qr.locator('rect, path').count()).toBeGreaterThan(0)

    // ADR-009: no desk chrome on a public pass-token screen.
    await expect(page.locator('.nav-wrap')).toHaveCount(0)
    await expect(page.getByText(/accred desk/i)).toHaveCount(0)

    // Never the phone (non-negotiable #9) — nowhere on this screen, ever.
    await expect(page.getByText(/\+91/)).toHaveCount(0)

    // ACC-127: a neutral title, never the holder's name — a shared device's
    // tab strip or history must not read out who this pass belongs to.
    await expect(page).toHaveTitle('Your pass · BOA Accreditation')
  })

  test('an unknown or not-yet-approved token: "This pass is not valid", 404, no distinguishable reason', async ({ page }) => {
    const response = await page.goto(`/p/${UNAPPROVED_SHAPED_TOKEN}`)
    expect(response?.status()).toBe(404)
    await expect(page.getByText('This pass is not valid')).toBeVisible()
  })

  test('a malformed token (wrong shape entirely) gets the same not-valid page, no database round trip needed', async ({ page }) => {
    const response = await page.goto('/p/not-a-real-token')
    expect(response?.status()).toBe(404)
    await expect(page.getByText('This pass is not valid')).toBeVisible()
  })
})
