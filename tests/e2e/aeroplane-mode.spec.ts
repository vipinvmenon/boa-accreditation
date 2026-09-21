import { expect, test, type Page, type Route } from '@playwright/test'
import QRCode from 'qrcode'
import { gateIssueResultSchema, gateIssueSchema, type GateIssue } from '../../lib/schemas/gate'

const DEVICE_TOKEN = 'local-e2e-device-token'
const PEOPLE = [
  { passToken: 'pass-alpha', personId: '11111111-1111-4111-8111-111111111111' },
  { passToken: 'pass-bravo', personId: '22222222-2222-4222-8222-222222222222' },
  { passToken: 'pass-charlie', personId: '33333333-3333-4333-8333-333333333333' },
  { passToken: 'pass-delta', personId: '44444444-4444-4444-8444-444444444444' },
] as const
const PULL = {
  deviceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  gateLabel: 'Main gate',
  volunteerName: 'Local fixture',
  scope: 'crew' as const,
  roster: PEOPLE.map(({ passToken, personId }, index) => ({
    passToken,
    personId,
    orgId: '99999999-9999-4999-8999-999999999999',
    status: 'approved' as const,
    vehicleReg: null,
    updatedAt: '2026-09-12T12:00:00.000Z',
    fullName: `E2E Person ${index + 1}`,
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
    deviceId: PULL.deviceId,
    gateLabel: PULL.gateLabel,
    volunteerName: PULL.volunteerName,
    occurredAt: action.occurredAt ?? '2026-09-12T12:01:00.000Z',
    postedAt: '2026-09-12T12:01:00.000Z',
    isReissue: action.isReissue,
    supervisorNote: action.supervisorNote ?? null,
    voidsCheckinId: action.voidsCheckinId ?? null,
  })
}

async function installFixture(page: Page, modes: IssueMode[]): Promise<{ page: Page; requests: string[] }> {
  const requests: string[] = []
  let requestNumber = 0

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

  await page.goto('/gate/setup')
  await page.getByLabel('Device token').fill(DEVICE_TOKEN)
  await page.getByRole('button', { name: 'Pull approved list' }).click()
  await expect(page).toHaveURL(/\/gate$/)
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    if (registration.active?.state !== 'activated') {
      throw new Error(`gate service worker is ${registration.active?.state ?? 'missing'}`)
    }
  })
  return { page, requests }
}

async function reloadColdOffline(page: Page) {
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByText(/Offline \|/)).toBeVisible()
}

async function scan(page: Page, value: string) {
  const input = page.getByLabel('Manual scanner input')
  await input.fill(value)
  await input.press('Enter')
}

async function queueWristband(page: Page, token: string) {
  await scan(page, `BOA26:${token}`)
  await expect(page.getByText('Approved', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Issue wristband' }).click()
}

async function expectVerdict(page: Page, value: string) {
  await expect(page.locator('.g-verdict').filter({ hasText: new RegExp(`^${value}$`) })).toBeVisible()
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

    const firstResponse = await page.request.get('/gate/setup')
    const firstCsp = firstResponse.headers()['content-security-policy']
    expect(firstCsp).toContain("script-src 'self' 'nonce-")
    expect(firstCsp).toContain("'strict-dynamic'")
    expect(firstCsp).toContain("'wasm-unsafe-eval'")
    expect(firstCsp).toContain("style-src 'self' 'unsafe-inline'")
    expect(firstCsp).toContain("font-src 'self'")

    const secondResponse = await page.request.get('/gate/setup')
    expect(secondResponse.headers()['content-security-policy']).not.toBe(firstCsp)

    const gate = (await installFixture(page, ['success'])).page
    await reloadColdOffline(gate)
    await gate.getByRole('button', { name: "Can't scan? Search by name" }).click()
    await expect(gate.getByText('Approved', { exact: true }).first()).toBeVisible({ timeout: 15_000 })
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
    await expect(gate.getByText(/Online \| 0 queued/)).toBeVisible()
    expect(requests).toHaveLength(2)
    expect(requests[0]).not.toBe(requests[1])
    await expect.poll(() => outboxStatuses(gate)).toEqual(['done', 'done'])
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
    expect(requests).toHaveLength(1)
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
    await gate.getByRole('button', { name: 'Issue wristband' }).click()
    await expect(gate.getByText(/Online \| 0 queued/)).toBeVisible()
    expect(requests).toHaveLength(5)
    expect(requests[0]).toBe(requests[1])
    expect(requests[2]).not.toBe(requests[0])
    await expect.poll(() => outboxStatuses(gate)).toEqual(['done', 'done', 'done', 'done'])
  })
})
