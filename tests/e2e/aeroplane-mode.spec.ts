import { expect, test, type Page, type Route } from '@playwright/test'
import QRCode from 'qrcode'
import { gateIssueResultSchema, gateIssueSchema, type GateIssue } from '../../lib/schemas/gate'

/**
 * ACC-150 (ADR-020): the gate is for logged-in issuers. There is no device
 * token to paste any more, so this suite mocks the session the same way it
 * has always mocked the gate APIs — `GET /api/gate/session` answers as a
 * signed-in issuer, and `/api/gate/pull` fills the cache on first load. No
 * real Supabase session, no auth user, nothing to seed.
 */
const SESSION = {
  operatorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  displayName: 'Local fixture',
  role: 'issuer' as const,
}
const PEOPLE = [
  { passToken: 'pass-alpha', personId: '11111111-1111-4111-8111-111111111111' },
  { passToken: 'pass-bravo', personId: '22222222-2222-4222-8222-222222222222' },
  { passToken: 'pass-charlie', personId: '33333333-3333-4333-8333-333333333333' },
  { passToken: 'pass-delta', personId: '44444444-4444-4444-8444-444444444444' },
] as const
const PULL = {
  operatorId: SESSION.operatorId,
  operatorRole: SESSION.role,
  gateLabel: 'Check-in',
  volunteerName: SESSION.displayName,
  roster: PEOPLE.map(({ passToken, personId }, index) => ({
    passToken,
    personId,
    orgId: '99999999-9999-4999-8999-999999999999',
    status: 'approved' as const,
    vehicleReg: null,
    updatedAt: '2026-09-12T12:00:00.000Z',
    fullName: `E2E Person ${index + 1}`,
    phone: `+91982100000${index + 1}`,
    roleText: 'Working crew',
    orgName: 'E2E Org',
    // PEOPLE[3] carries a pack tier the v1 enum did not have (ADR-018).
    typeCode: index === 3 ? ('promoters_lounge' as const) : ('crew' as const),
    dayValidity: 'build_show' as const,
  })),
  ledger: [],
  rosterAsOf: '2026-09-12T12:00:00.000Z',
  ledgerAsOf: '2026-09-12T12:00:00.000Z',
}

type IssueMode = 'success' | 'duplicate' | 'unauthorized' | 'server'

function issueResult(action: GateIssue) {
  return gateIssueResultSchema.parse({
    id: action.idempotencyKey,
    personId: PEOPLE.find((person) => person.passToken === action.passToken)?.personId,
    kind: action.kind,
    idempotencyKey: action.idempotencyKey,
    bandSerial: action.bandSerial ?? null,
    stickerNo: action.stickerNo ?? null,
    vehicleReg: action.vehicleReg ?? null,
    operatorId: PULL.operatorId,
    gateLabel: PULL.gateLabel,
    volunteerName: PULL.volunteerName,
    occurredAt: action.occurredAt ?? '2026-09-12T12:01:00.000Z',
    postedAt: '2026-09-12T12:01:00.000Z',
    isReissue: action.isReissue,
    supervisorNote: action.supervisorNote ?? null,
    voidsCheckinId: action.voidsCheckinId ?? null,
  })
}

type VehiclePost = { outcome: string; reason: string | null; checks: { sticker: boolean; wristband: boolean; plateVisual: boolean } }

async function installFixture(
  page: Page,
  modes: IssueMode[],
): Promise<{ page: Page; requests: string[]; vehiclePosts: VehiclePost[] }> {
  const requests: string[] = []
  const vehiclePosts: VehiclePost[] = []
  let requestNumber = 0

  await page.route('**/api/gate/session', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', json: SESSION })
  })
  await page.route('**/api/gate/pull', async (route: Route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', json: PULL })
  })
  await page.route('**/api/gate/issue', async (route: Route) => {
    const action = gateIssueSchema.parse(route.request().postDataJSON())
    requests.push(action.idempotencyKey)
    const mode = modes[requestNumber] ?? modes[modes.length - 1] ?? 'success'
    requestNumber += 1
    if (mode === 'unauthorized') {
      await route.fulfill({ status: 401, contentType: 'application/json', json: { error: 'invalid_device' } })
      return
    }
    if (mode === 'server') {
      await route.fulfill({ status: 500, contentType: 'application/json', json: { error: 'internal' } })
      return
    }
    if (mode === 'duplicate') {
      await route.fulfill({ status: 409, contentType: 'application/json', json: { error: 'duplicate' } })
      return
    }
    await route.fulfill({ status: 201, contentType: 'application/json', json: issueResult(action) })
  })

  await page.route('**/api/gate/vehicle', async (route: Route) => {
    const body = route.request().postDataJSON() as VehiclePost & { idempotencyKey: string; plate: string; personId: string | null; stickerCheckinId: string | null; occurredAt: string }
    vehiclePosts.push({ outcome: body.outcome, reason: body.reason, checks: body.checks })
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      json: {
        id: crypto.randomUUID(),
        idempotencyKey: body.idempotencyKey,
        plate: body.plate,
        personId: body.personId,
        stickerCheckinId: body.stickerCheckinId,
        outcome: body.outcome,
        reason: body.reason,
        checks: body.checks,
        operatorId: PULL.operatorId,
        gateLabel: PULL.gateLabel,
        officerName: PULL.volunteerName,
        occurredAt: body.occurredAt,
        postedAt: '2026-09-12T12:01:00.000Z',
      },
    })
  })

  // An empty cache pulls itself on first load now — no pairing screen.
  await page.goto('/gate')
  await expect(page.getByRole('button', { name: "Can't scan? Search by name" })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (registration.active?.state !== 'activated') {
      throw new Error(`gate service worker is ${registration.active?.state ?? 'missing'}`)
    }
  })
  return { page, requests, vehiclePosts }
}

async function reloadColdOffline(page: Page) {
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline \|/)).toBeVisible()
}

async function scan(page: Page, value: string) {
  const input = page.getByLabel('Pass-code input for hardware scanner')
  await input.fill(value)
  await input.press('Enter')
}

async function queueWristband(page: Page, token: string) {
  await scan(page, `BOA26:${token}`)
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Issue wristband' }).click()
}

async function expectVerdict(page: Page, value: string) {
  await expect(page.locator('.verdict').filter({ hasText: new RegExp(`^${value}$`) })).toBeVisible()
}

async function makePendingEntriesReady(page: Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open('boa-accreditation-gate')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('outbox', 'readwrite')
      const store = transaction.objectStore('outbox')
      const read = store.getAll()
      read.onsuccess = () => {
        for (const row of read.result) {
          if (row.status === 'pending') {
            row.nextAttemptAt = 0
            store.put(row)
          }
        }
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  })
}

async function outboxStatuses(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('boa-accreditation-gate')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<Array<{ status: string }>>((resolve, reject) => {
      const transaction = database.transaction('outbox', 'readonly')
      const read = transaction.objectStore('outbox').getAll()
      read.onsuccess = () => resolve(read.result as Array<{ status: string }>)
      read.onerror = () => reject(read.error)
    })
    database.close()
    return rows.map((row) => row.status)
  })
}

async function outboxIssues(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('boa-accreditation-gate')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    type Row = { status: string; payload: { passToken?: string; kind?: string; bandSerial?: string | null } }
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const read = database.transaction('outbox', 'readonly').objectStore('outbox').getAll()
      read.onsuccess = () => resolve(read.result as Row[])
      read.onerror = () => reject(read.error)
    })
    database.close()
    return rows.map((row) => ({ status: row.status, passToken: row.payload.passToken, kind: row.payload.kind, bandSerial: row.payload.bandSerial }))
  })
}

test.describe('gate aeroplane mode', () => {
  test('enforces the nonce CSP while the WASM scanner decodes a QR', async ({ page }) => {
    const qrDataUrl = await QRCode.toDataURL('BOA26:pass-alpha', { margin: 2, width: 300 })
    await page.addInitScript((dataUrl: string) => {
      Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined })
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 300
        canvas.height = 300
        const image = new Image()
        image.src = dataUrl
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve()
          image.onerror = () => reject(new Error('fixture QR image failed to load'))
        })
        canvas.getContext('2d')?.drawImage(image, 0, 0)
        return canvas.captureStream(10)
      }
    }, qrDataUrl)

    const firstResponse = await page.request.get('/gate')
    const firstCsp = firstResponse.headers()['content-security-policy']
    expect(firstCsp).toContain("script-src 'self' 'nonce-")
    expect(firstCsp).toContain("'strict-dynamic'")
    expect(firstCsp).toContain("'wasm-unsafe-eval'")
    expect(firstCsp).toContain("style-src 'self' 'unsafe-inline'")
    expect(firstCsp).toContain("font-src 'self'")

    const secondResponse = await page.request.get('/gate')
    expect(secondResponse.headers()['content-security-policy']).not.toBe(firstCsp)

    const gate = (await installFixture(page, ['success'])).page
    await reloadColdOffline(gate)
    await gate.getByRole('button', { name: "Can't scan? Search by name" }).click()
    // ACC-130 removed the gate result card's always-on Scanning/Approved/Collected/
    // Refuse tabs (dead buttons with no handler); the search panel's own input is
    // what proves the page rendered past a cold reload under the nonce CSP now.
    await expect(gate.getByRole('combobox', { name: 'Search approved list' })).toBeVisible({ timeout: 15_000 })
  })

  test('cold reload resolves green, amber, red and drains blank-serial work idempotently', async ({ page }) => {
    const fixture = await installFixture(page, ['success', 'duplicate'])
    const gate = fixture.page
    const { requests } = fixture
    await reloadColdOffline(gate)

    await queueWristband(gate, PEOPLE[0].passToken)
    await expect(gate.getByText(/Offline \| 1 queued/)).toBeVisible()
    await scan(gate, 'garbage')
    await expectVerdict(gate, 'Refuse')
    await scan(gate, `BOA26:${PEOPLE[0].passToken}`)
    await expectVerdict(gate, 'Collected')

    await expect.poll(() => outboxStatuses(gate)).toEqual(['pending'])
    await scan(gate, `BOA26:${PEOPLE[0].passToken}`)
    await expectVerdict(gate, 'Collected')

    await gate.context().setOffline(false)
    await gate.waitForFunction(() => navigator.onLine)
    await queueWristband(gate, PEOPLE[1].passToken)
    // Since ACC-109 the `online` event already drained the first issue, so
    // "0 queued" can be on screen before the second issue's drain runs. Wait
    // on the outbox itself, not the label.
    await expect.poll(() => outboxStatuses(gate)).toEqual(['done', 'done'])
    await expect(gate.getByText(/Online \| 0 queued/)).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[0]).not.toBe(requests[1])
  })

  test('renders a pack tier, its band and six-zone strip from the offline cache', async ({ page }) => {
    const gate = (await installFixture(page, [])).page
    await reloadColdOffline(gate)

    await scan(gate, `BOA26:${PEOPLE[3].passToken}`)
    await expectVerdict(gate, 'Approved')
    const band = gate.locator('.gband')
    await expect(band.locator('b')).toHaveText('Promoters Lounge')
    await expect(band.locator('small')).toHaveText('Hand over a royal blue band')
    await expect(gate.locator('.zones span')).toHaveText([
      'Festival Area',
      "—— Eddie's Lounge",
      'Promoters Lounge · + ID',
      '—— Photo Pit',
      'Backstage · + ID · after 22:00',
      '—— Main Stage',
    ])
    await expect(gate.locator('.zones span.off')).toHaveCount(3)
  })

  test('preserves the whole queue after a 401 and drains it after recovery', async ({ page }) => {
    const fixture = await installFixture(page, ['unauthorized', 'success'])
    const gate = fixture.page
    const { requests } = fixture
    await reloadColdOffline(gate)
    await queueWristband(gate, PEOPLE[0].passToken)
    await queueWristband(gate, PEOPLE[1].passToken)

    await gate.context().setOffline(false)
    await gate.waitForFunction(() => navigator.onLine)
    await queueWristband(gate, PEOPLE[2].passToken)
    await expect(gate.getByText(/Online \| 3 queued/)).toBeVisible()
    // Since ACC-109 the `online` event drains as well as an issue, so the
    // head entry may be retried. What must hold: only the head is ever sent
    // (a 401 stops the drain) and nothing is dropped.
    expect(requests.length).toBeGreaterThanOrEqual(1)
    expect(new Set(requests).size).toBe(1)
    await expect.poll(() => outboxStatuses(gate)).toEqual(['pending', 'pending', 'pending'])
  })

  test('does not let a later action overtake a 500 response', async ({ page }) => {
    const fixture = await installFixture(page, ['server', 'success'])
    const gate = fixture.page
    const { requests } = fixture
    await reloadColdOffline(gate)
    await queueWristband(gate, PEOPLE[0].passToken)
    await queueWristband(gate, PEOPLE[1].passToken)

    await gate.context().setOffline(false)
    await gate.waitForFunction(() => navigator.onLine)
    await queueWristband(gate, PEOPLE[2].passToken)
    await expect(gate.getByText(/Online \| 3 queued/)).toBeVisible()
    expect(requests).toHaveLength(1)

    await makePendingEntriesReady(gate)
    // Until ACC-109 this test drained by tapping "Issue wristband" a second
    // time on the same person — which queued a duplicate issue (that was the
    // bug). Reconnecting triggers the drain now.
    await gate.context().setOffline(true)
    await gate.context().setOffline(false)
    await expect(gate.getByText(/Online \| 0 queued/)).toBeVisible()
    expect(requests).toHaveLength(4)
    expect(requests[0]).toBe(requests[1])
    expect(requests[2]).not.toBe(requests[0])
    await expect.poll(() => outboxStatuses(gate)).toEqual(['done', 'done', 'done'])
  })

  test('an idle gate says Ready, not Refuse, and Next person returns to it', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await reloadColdOffline(gate)
    await expectVerdict(gate, 'Ready')
    await expect(gate.getByText('Do not issue a wristband', { exact: false })).toHaveCount(0)
    await scan(gate, 'garbage')
    await expectVerdict(gate, 'Refuse')
    await gate.getByRole('button', { name: 'Next person' }).click()
    await expectVerdict(gate, 'Ready')
  })

  // ACC-147 / ACC-131. Gate APIs are mocked with page.route in installFixture,
  // like every other case here; after the reload the context is offline, so
  // the search can only have read the Dexie cache.
  test('search by name with the radio off feeds the scanner path: green, typed serial, outbox', async ({ page }) => {
    const { page: gate, requests } = await installFixture(page, ['success'])
    await reloadColdOffline(gate)

    await gate.getByRole('button', { name: "Can't scan? Search by name" }).click()
    const box = gate.getByRole('combobox', { name: 'Search approved list' })
    await expect(box).toBeFocused()
    await box.fill('  PERSON 3 ')
    await expect(gate.getByRole('option')).toHaveCount(1)
    await expect(gate.getByRole('option', { name: /E2E Person 3/ })).toBeVisible()
    await box.press('Enter')

    await expectVerdict(gate, 'Approved')
    await expect(gate.locator('.person .nm')).toHaveText('E2E Person 3')
    await expect(box).toHaveCount(0)
    await gate.getByLabel('Wristband serial, optional').fill('0417')
    await gate.getByRole('button', { name: 'Issue wristband' }).click()
    await expect(gate.getByText(/Offline \| 1 queued/)).toBeVisible()
    await expect.poll(() => outboxIssues(gate)).toEqual([
      { status: 'pending', passToken: PEOPLE[2].passToken, kind: 'wristband', bandSerial: '0417' },
    ])
    expect(requests).toEqual([])

    // The same person found again, by tap this time, is already collected.
    await gate.getByRole('button', { name: 'Next person' }).click()
    await gate.getByRole('button', { name: "Can't scan? Search by name" }).click()
    await gate.getByRole('combobox', { name: 'Search approved list' }).fill('e2e pers')
    await expect(gate.getByRole('option')).toHaveCount(4)
    await gate.getByRole('option', { name: /E2E Person 3/ }).click()
    await expectVerdict(gate, 'Collected')

    await gate.getByRole('button', { name: "Can't scan? Search by name" }).click()
    await gate.getByRole('combobox', { name: 'Search approved list' }).fill('nobody here')
    await expect(gate.getByText('No approved person matches that search.')).toBeVisible()
    await expect(gate.getByRole('option')).toHaveCount(0)
  })

  test('searches by the last four phone digits from the offline cache', async ({ page }) => {
    const { page: gate, requests } = await installFixture(page, [])
    await reloadColdOffline(gate)

    await gate.getByRole('button', { name: "Can't scan? Search by name" }).click()
    const box = gate.getByRole('combobox', { name: 'Search approved list' })
    await box.fill('0003')
    const option = gate.getByRole('option', { name: /E2E Person 3/ })
    await expect(option).toContainText('••• 0003')
    await option.click()

    await expectVerdict(gate, 'Approved')
    await expect(gate.locator('.person .nm')).toHaveText('E2E Person 3')
    expect(requests).toEqual([])
  })

  test('a double tap on Issue wristband queues exactly one issue', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await reloadColdOffline(gate)
    await queueWristband(gate, PEOPLE[0].passToken)
    const issued = gate.getByRole('button', { name: 'Wristband issued' })
    await expect(issued).toBeDisabled()
    await issued.click({ force: true })
    await expect.poll(() => outboxStatuses(gate)).toEqual(['pending'])
  })

  test('a phone with nobody signed in is sent to the login page, and comes back to /gate', async ({ page }) => {
    await page.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', json: { error: 'not_authenticated' } })
    })
    await page.goto('/gate')
    await expect(page).toHaveURL(/\/desk\/login\?next=%2Fgate$/)
  })

  test('an empty pull leaves no scanner on screen, and says why', async ({ page }) => {
    await page.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: SESSION })
    })
    await page.route('**/api/gate/pull', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: { ...PULL, roster: [] } })
    })
    await page.goto('/gate')
    await expect(page.getByText('No one approved yet')).toBeVisible()
    await expect(page.getByText('No one has been approved yet', { exact: false })).toBeVisible()
    await expect(page.getByLabel('Pass-code input for hardware scanner')).toHaveCount(0)
    // The bug this replaced: a signed-in issuer was told to "Sign in and load
    // the list". Boot redirects a signed-out issuer before this screen ever
    // renders, so the only people who see it are already signed in, and
    // signing in again cannot conjure a roster that does not exist.
    await expect(page.getByRole('link', { name: 'Sign in and load the list' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  })

  test('a lead or admin keeps the desk navigation on the gate; an issuer does not', async ({ page }) => {
    // ACC-132 drew a volunteer's chrome for anyone standing on /gate, so an
    // admin who tapped Vehicle from the desk was stranded there. The chrome
    // follows the person now, not the path.
    await page.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { ...SESSION, displayName: 'Vipin Menon', role: 'admin' },
      })
    })
    await page.route('**/api/gate/pull', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: PULL })
    })
    await page.goto('/gate')

    const nav = page.getByRole('navigation', { name: 'Gate navigation' })
    await expect(nav.getByRole('link', { name: 'Control room' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Master list' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Organisations' })).toBeVisible()

    // And the identity is the person signed in, not the hardcoded "VI/Vipin/
    // Administrator" every issuer's phone used to show.
    await page.getByRole('button', { name: 'Operator menu' }).click()
    await expect(page.locator('#gate-profile-menu').getByText('Vipin Menon')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Manage users' })).toBeVisible()
  })

  test('an issuer gets the two-tab gate chrome and no desk links at all', async ({ page }) => {
    await page.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: { ...SESSION, displayName: 'Meera Joseph', role: 'issuer' },
      })
    })
    await page.route('**/api/gate/pull', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: PULL })
    })
    await page.goto('/gate')

    const nav = page.getByRole('navigation', { name: 'Gate navigation' })
    await expect(nav.getByRole('link', { name: 'Gate' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Vehicle' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Control room' })).toHaveCount(0)
    await expect(nav.getByRole('link', { name: 'Master list' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Operator menu' }).click()
    await expect(page.locator('#gate-profile-menu').getByText('Meera Joseph')).toBeVisible()
    // A desk link a volunteer taps and gets refused is a trap, not security.
    await expect(page.getByRole('link', { name: 'Manage users' })).toHaveCount(0)
  })

  test('a pull that fails on signal offers Try again, not Sign in, and recovers', async ({ page }) => {
    await page.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', json: SESSION })
    })
    // Not a first-attempt-only failure: the sync scheduler (ACC-149) re-pulls
    // on a timer while online and would quietly recover the screen before the
    // assertions run, which is correct behaviour but races the test. The pull
    // stays broken until the test itself heals it.
    let pullWorks = false
    await page.route('**/api/gate/pull', async (route: Route) => {
      if (!pullWorks) {
        await route.fulfill({ status: 500, contentType: 'application/json', json: { error: 'server_error' } })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', json: PULL })
    })
    await page.goto('/gate')

    // Signal failed, so the fix is to retry — never to sign in, which would
    // need the signal the issuer has just been told they are missing.
    await expect(page.getByText('Check signal and try again', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Sign in and load the list' })).toHaveCount(0)

    // Heal the pull, then press the button. The scheduler's own retry could
    // now also succeed, so this asserts the screen recovers — not that the
    // button was the only thing that could have recovered it.
    pullWorks = true
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByLabel('Pass-code input for hardware scanner')).toBeVisible()
  })
})

async function seedVehicle(page: Page, plate: string, withSticker: boolean, withWristband = true) {
  await page.evaluate(async ({ plate, withSticker, withWristband, personId }) => {
    const request = indexedDB.open('boa-accreditation-gate')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['sticker', 'ledger'], 'readwrite')
      if (withSticker) {
        transaction.objectStore('sticker').put({ plate, stickerNo: '#V-0001', personId, issuedAt: '2026-09-12T12:00:00.000Z' })
        transaction.objectStore('ledger').put({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', personId, kind: 'vehicle_sticker', occurredAt: '2026-09-12T12:00:00.000Z', stickerNo: '#V-0001', gateLabel: 'Main gate', volunteerName: 'Local fixture', isReissue: false })
        if (withWristband) transaction.objectStore('ledger').put({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2', personId, kind: 'wristband', occurredAt: '2026-09-12T12:00:00.000Z', bandSerial: '#0001', gateLabel: 'Main gate', volunteerName: 'Local fixture', isReissue: false })
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()
  }, { plate, withSticker, withWristband, personId: PEOPLE[0].personId })
}

async function vehicleOutbox(page: Page) {
  return page.evaluate(async () => {
    const request = indexedDB.open('boa-accreditation-gate')
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const rows = await new Promise<Array<{ kind: string; payload: { outcome: string; reason: string | null } }>>((resolve, reject) => {
      const read = database.transaction('outbox', 'readonly').objectStore('outbox').getAll()
      read.onsuccess = () => resolve(read.result as Array<{ kind: string; payload: { outcome: string; reason: string | null } }>)
      read.onerror = () => reject(read.error)
    })
    database.close()
    return rows.filter((row) => row.kind === 'vehicle_event').map((row) => [row.payload.outcome, row.payload.reason])
  })
}

test.describe('vehicle gate (ACC-109)', () => {
  test('Log entry with a valid sticker and wristband logs exactly one CLEARED event, in one press', async ({ page }) => {
    const { page: gate, vehiclePosts } = await installFixture(page, ['success'])
    await seedVehicle(gate, 'KA05MJ8871', true)
    // Offline BEFORE the navigation: since ACC-149 the gate re-pulls on mount
    // when online, and this fixture's pull answers with an empty ledger, which
    // would replace the rows seeded straight into Dexie above.
    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 05 MJ 8871')
    await gate.getByRole('button', { name: 'Log entry and open gate' }).click()
    await expectVerdict(gate, 'Cleared')
    await expect.poll(() => vehicleOutbox(gate)).toEqual([['cleared', null]])
    await gate.context().setOffline(false)
    await expect.poll(() => vehiclePosts.map((post) => post.outcome)).toEqual(['cleared'])
    expect(vehiclePosts[0]?.checks).toEqual({ sticker: true, wristband: true, plateVisual: true })
  })

  test('Log entry without a sticker logs nothing; Turn away with a reason logs TURNED AWAY', async ({ page }) => {
    const { page: gate, vehiclePosts } = await installFixture(page, ['success'])
    await gate.goto('/gate/vehicle')
    await gate.context().setOffline(true)
    await gate.getByLabel('Vehicle registration').fill('KA 01 AB 1234')
    await gate.getByRole('button', { name: 'Log entry and open gate' }).click()
    await expectVerdict(gate, 'Not cleared')
    expect(await vehicleOutbox(gate)).toEqual([])

    await gate.getByLabel('Turn-away reason').fill('No sticker')
    await gate.getByRole('button', { name: 'Turn away and log reason' }).click()
    await expectVerdict(gate, 'Turned away')
    await expect.poll(() => vehicleOutbox(gate)).toEqual([['turned_away', 'No sticker']])
    await gate.context().setOffline(false)
    await expect.poll(() => vehiclePosts.map((post) => post.outcome)).toEqual(['turned_away'])
  })

  test('Turn away on a valid vehicle logs TURNED AWAY, never cleared (the stale-state bug)', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await seedVehicle(gate, 'KA05MJ8871', true)
    // Offline BEFORE the navigation: since ACC-149 the gate re-pulls on mount
    // when online, and this fixture's pull answers with an empty ledger, which
    // would replace the rows seeded straight into Dexie above.
    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 05 MJ 8871')
    await gate.getByRole('button', { name: 'Turn away and log reason' }).click()
    await expect(gate.getByLabel('Turn-away reason')).toBeFocused()
    expect(await vehicleOutbox(gate)).toEqual([])
    await gate.getByLabel('Turn-away reason').fill('Plate does not match sticker')
    await gate.getByRole('button', { name: 'Turn away and log reason' }).click()
    await expectVerdict(gate, 'Turned away')
    await expect.poll(() => vehicleOutbox(gate)).toEqual([['turned_away', 'Plate does not match sticker']])
  })
})

/**
 * ACC-159 / ADR-022 — the officer is told before deciding.
 *
 * Before this, `/gate/vehicle` looked the plate up INSIDE `recordEvent`, so the
 * only way to discover whether a vehicle would be let in was to press the
 * permissive green "Log entry and open gate" and be refused. These tests pin
 * the two halves of the fix: the three checks are on screen before any press,
 * and resolving is a pure read that logs nothing until a button is pressed.
 */
test.describe('vehicle gate: resolve on input (ACC-159)', () => {
  test('the holder, the sticker number and both checks are on screen BEFORE any press', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await seedVehicle(gate, 'KA05MJ8871', true)
    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 05 MJ 8871')

    // No press anywhere in this test.
    await expectVerdict(gate, 'Ready to clear')
    await expect(gate.locator('#vres')).toContainText('E2E Person 1')
    await expect(gate.locator('#vres')).toContainText('#V-0001')
    await expect(gate.locator('#vres')).toContainText('#V-0001, bound to KA05MJ8871')
    await expect(gate.locator('#vres')).toContainText('Crew, purple, band #0001')
    for (const label of ['Vehicle sticker', 'Crew wristband', 'Plate matches sticker']) {
      await expect(gate.locator('#vres .nm').filter({ hasText: new RegExp(`^${label}$`) })).toBeVisible()
    }
    // Resolving is a read. Nothing is logged until the officer decides.
    expect(await vehicleOutbox(gate)).toEqual([])
  })

  test('a sticker with no wristband says so before the press — the rule the screen exists for', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await seedVehicle(gate, 'KA05MJ8871', true, false)
    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 05 MJ 8871')

    await expectVerdict(gate, 'Will not clear')
    await expect(gate.locator('#vres')).toContainText('The sticker holder has no active wristband')
    expect(await vehicleOutbox(gate)).toEqual([])
  })

  test('an unknown plate says nothing is issued to it, before the press', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await gate.goto('/gate/vehicle')
    await gate.context().setOffline(true)
    await gate.getByLabel('Vehicle registration').fill('KA 01 AB 1234')

    await expectVerdict(gate, 'Will not clear')
    await expect(gate.locator('#vres')).toContainText('No sticker is issued to this registration')
    expect(await vehicleOutbox(gate)).toEqual([])
  })

  test('after being told, one press still logs exactly one CLEARED event', async ({ page }) => {
    const { page: gate, vehiclePosts } = await installFixture(page, ['success'])
    await seedVehicle(gate, 'KA05MJ8871', true)
    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 05 MJ 8871')
    await expectVerdict(gate, 'Ready to clear')

    await gate.getByRole('button', { name: 'Log entry and open gate' }).click()
    await expectVerdict(gate, 'Cleared')
    // Exactly one — the pre-decision resolve must not have queued a shadow event.
    await expect.poll(() => vehicleOutbox(gate)).toEqual([['cleared', null]])
    await gate.context().setOffline(false)
    await expect.poll(() => vehiclePosts.map((post) => post.outcome)).toEqual(['cleared'])
  })

  test('the disabled buttons explain themselves in visible text, not only a hover title', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await gate.goto('/gate/vehicle')
    await gate.context().setOffline(true)

    // Empty: a phone at a barrier has no hover, so this must be readable text.
    await expect(gate.getByText('Type the registration. The sticker and the wristband show here before you decide.')).toBeVisible()
    await expect(gate.getByRole('button', { name: 'Log entry and open gate' })).toBeDisabled()

    // Invalid: the existing format line, still visible.
    await gate.getByLabel('Vehicle registration').fill('not-a-plate')
    await expect(gate.getByText('Not a valid registration format.')).toBeVisible()
    await expect(gate.getByRole('button', { name: 'Log entry and open gate' })).toBeDisabled()
  })

  test('editing the plate never leaves the previous vehicle facts on screen', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await seedVehicle(gate, 'KA05MJ8871', true)
    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 05 MJ 8871')
    await expectVerdict(gate, 'Ready to clear')

    // A different valid plate with nothing against it must not inherit #V-0001.
    await gate.getByLabel('Vehicle registration').fill('KA 01 AB 1234')
    await expectVerdict(gate, 'Will not clear')
    await expect(gate.locator('#vres')).not.toContainText('#V-0001')
  })
})

/**
 * ACC-153 — the plate index is built by the pull, not by hand.
 *
 * The suite above seeds `sticker` straight into IndexedDB and goes offline so
 * the pull cannot replace it. That proved the screen works given a cache, and
 * hid the fact that nothing in shipped code ever wrote one: on a real phone
 * `gateDb.sticker` stayed empty and every vehicle was refused with "No
 * sticker is issued to this plate". These tests hand the gate nothing but a
 * pull — the binding it really has — and require the barrier to work.
 */
const STICKER_HOLDER = PEOPLE[0]
const PULL_WITH_VEHICLE = {
  ...PULL,
  roster: PULL.roster.map((row) => (
    row.personId === STICKER_HOLDER.personId ? { ...row, vehicleReg: 'KA 05 MJ 8871' } : row
  )),
  ledger: [
    { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1', personId: STICKER_HOLDER.personId, kind: 'vehicle_sticker' as const, occurredAt: '2026-09-12T11:00:00.000Z', bandSerial: null, stickerNo: '#V-0231', gateLabel: PULL.gateLabel, volunteerName: PULL.volunteerName, isReissue: false },
    { id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2', personId: STICKER_HOLDER.personId, kind: 'wristband' as const, occurredAt: '2026-09-12T11:05:00.000Z', bandSerial: '#0412', stickerNo: null, gateLabel: PULL.gateLabel, volunteerName: PULL.volunteerName, isReissue: false },
  ],
}

test.describe('the plate index is built by the pull (ACC-153)', () => {
  test('a vehicle whose sticker arrived only in the pull clears at the barrier', async ({ page }) => {
    const { page: gate, vehiclePosts } = await installFixture(page, ['success'])
    await gate.route('**/api/gate/pull', (route: Route) => route.fulfill({ json: PULL_WITH_VEHICLE }))

    // Shift start: the crew gate pulls. Nothing is written to Dexie by hand.
    await gate.goto('/gate')
    await expect(gate.getByLabel('Pass-code input for hardware scanner')).toBeAttached()

    await gate.goto('/gate/vehicle')
    // Typed the way an officer types it, not the way the roster stores it.
    await gate.getByLabel('Vehicle registration').fill('ka05mj8871')
    await gate.getByRole('button', { name: 'Log entry and open gate' }).click()

    await expectVerdict(gate, 'Cleared')
    await expect(gate.getByText('#V-0231', { exact: false }).first()).toBeVisible()
    await expect.poll(() => vehiclePosts.map((post) => post.outcome)).toEqual(['cleared'])
    expect(vehiclePosts[0]?.checks).toEqual({ sticker: true, wristband: true, plateVisual: true })
  })

  test('a plate nobody registered is still refused, and still logs nothing', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await gate.route('**/api/gate/pull', (route: Route) => route.fulfill({ json: PULL_WITH_VEHICLE }))
    await gate.goto('/gate')
    await expect(gate.getByLabel('Pass-code input for hardware scanner')).toBeAttached()

    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA 01 ZZ 9999')
    await gate.getByRole('button', { name: 'Log entry and open gate' }).click()
    await expectVerdict(gate, 'Not cleared')
    expect(await vehicleOutbox(gate)).toEqual([])
  })

  test('the index survives the radio going off — it is in the cache, not the network', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await gate.route('**/api/gate/pull', (route: Route) => route.fulfill({ json: PULL_WITH_VEHICLE }))
    await gate.goto('/gate')
    await expect(gate.getByLabel('Pass-code input for hardware scanner')).toBeAttached()

    await gate.context().setOffline(true)
    await gate.goto('/gate/vehicle')
    await gate.getByLabel('Vehicle registration').fill('KA05MJ8871')
    await gate.getByRole('button', { name: 'Log entry and open gate' }).click()
    await expectVerdict(gate, 'Cleared')
    await expect.poll(() => vehicleOutbox(gate)).toEqual([['cleared', null]])
  })
})

test.describe('vehicle gate sign-in guard (ACC-165)', () => {
  test('a phone with nobody signed in is sent to the login page, and comes back to /gate/vehicle', async ({ page }) => {
    await page.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', json: { error: 'not_authenticated' } })
    })
    await page.goto('/gate/vehicle')
    await expect(page).toHaveURL(/\/desk\/login\?next=%2Fgate%2Fvehicle$/)
  })

  test('signed in, the vehicle screen renders normally', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await gate.goto('/gate/vehicle')
    await expect(gate.getByLabel('Vehicle registration')).toBeVisible()
    await expect(gate).toHaveURL('/gate/vehicle')
  })

  test('offline, a phone that already pulled keeps working with the radio off — no redirect', async ({ page }) => {
    const { page: gate } = await installFixture(page, ['success'])
    await gate.goto('/gate')
    await expect(gate.getByLabel('Pass-code input for hardware scanner')).toBeAttached()

    await gate.context().setOffline(true)
    // A session check that answered "signed out" would be exactly the
    // wrong signal offline — this route must never even be reached.
    await gate.route('**/api/gate/session', async (route: Route) => {
      await route.fulfill({ status: 401, contentType: 'application/json', json: { error: 'not_authenticated' } })
    })
    await gate.goto('/gate/vehicle')
    await expect(gate.getByLabel('Vehicle registration')).toBeVisible()
    await expect(gate).toHaveURL('/gate/vehicle')
  })
})
