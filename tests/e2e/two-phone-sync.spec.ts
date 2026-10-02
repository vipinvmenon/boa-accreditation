import { expect, test, type Browser, type Page } from '@playwright/test'
import { gateIssueResultSchema, gateIssueSchema, type GateIssueResult } from '../../lib/schemas/gate'

/**
 * ACC-149 acceptance: two phones, one server. Phone A issues a wristband;
 * phone B, which had already pulled and scanned the same person GREEN, shows
 * AMBER after its own *scheduled* roster pull — no reload, no reconnect.
 *
 * Like tests/e2e/aeroplane-mode.spec.ts, the gate API is mocked with fixture
 * responses (page.route), not a seeded Supabase. Here the two browser
 * contexts share one in-memory fixture "server": every issue A posts is
 * returned in the ledger of B's next pull. This proves the browser-side sync
 * scheduling, not the real RPCs, not real phones, and not real radio.
 *
 * Phone B's clock is Playwright's fake clock so the ~45 s pull interval is
 * jumped rather than waited out; the pull that turns B amber is the timer's.
 *
 * ACC-150: each phone is a logged-in issuer, mocked at /api/gate/session the
 * same way the rest of the gate API is mocked here. The two issuers have
 * different names, which is the point of ADR-020's double-issue warning.
 */

const PULL_INTERVAL_MS = 45_000
const PEOPLE = [
  { passToken: 'pass-alpha', personId: '11111111-1111-4111-8111-111111111111' },
  { passToken: 'pass-bravo', personId: '22222222-2222-4222-8222-222222222222' },
] as const

type FixtureServer = { issued: GateIssueResult[] }

function operatorId(volunteerName: string) {
  return volunteerName === 'Phone A'
    ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
}

function pullBody(server: FixtureServer, volunteerName: string) {
  return {
    operatorId: operatorId(volunteerName),
    operatorRole: 'issuer' as const,
    gateLabel: 'Check-in',
    volunteerName,
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
      typeCode: 'crew' as const,
      dayValidity: 'build_show' as const,
    })),
    ledger: server.issued
      .filter((row) => row.kind !== 'void')
      .map((row) => ({
        id: row.id,
        personId: row.personId,
        kind: row.kind,
        occurredAt: row.occurredAt,
        bandSerial: row.bandSerial,
        stickerNo: row.stickerNo,
        gateLabel: row.gateLabel,
        volunteerName: row.volunteerName,
        isReissue: row.isReissue,
      })),
    rosterAsOf: '2026-09-12T12:00:00.000Z',
    ledgerAsOf: '2026-09-12T12:00:00.000Z',
  }
}

async function phone(browser: Browser, server: FixtureServer, volunteerName: string, fakeClock: boolean) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const pulls = { count: 0 }
  if (fakeClock) await page.clock.install()

  await page.route('**/api/gate/session', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      json: { operatorId: operatorId(volunteerName), displayName: volunteerName, role: 'issuer' },
    })
  })
  await page.route('**/api/gate/pull', async (route) => {
    pulls.count += 1
    await route.fulfill({ status: 200, contentType: 'application/json', json: pullBody(server, volunteerName) })
  })
  await page.route('**/api/gate/issue', async (route) => {
    const action = gateIssueSchema.parse(route.request().postDataJSON())
    let result = server.issued.find((row) => row.idempotencyKey === action.idempotencyKey)
    if (!result) {
      result = gateIssueResultSchema.parse({
        id: action.idempotencyKey,
        personId: PEOPLE.find((person) => person.passToken === action.passToken)?.personId,
        kind: action.kind,
        idempotencyKey: action.idempotencyKey,
        bandSerial: action.bandSerial ?? null,
        stickerNo: action.stickerNo ?? null,
        vehicleReg: action.vehicleReg ?? null,
        operatorId: operatorId(volunteerName),
        gateLabel: 'Check-in',
        volunteerName,
        occurredAt: action.occurredAt ?? '2026-09-12T12:01:00.000Z',
        postedAt: '2026-09-12T12:01:00.000Z',
        isReissue: action.isReissue,
        supervisorNote: action.supervisorNote ?? null,
        voidsCheckinId: action.voidsCheckinId ?? null,
      })
      server.issued.push(result)
    }
    await route.fulfill({ status: 201, contentType: 'application/json', json: result })
  })

  await page.goto('/gate')
  await expect(page.locator('[data-sync-status]')).toHaveText(/^Synced (just now|\d+ min ago)$/)
  return { context, page, pulls }
}

async function scan(page: Page, value: string) {
  const input = page.getByLabel('Pass-code input for hardware scanner')
  await input.fill(value)
  await input.press('Enter')
}

async function expectVerdict(page: Page, value: string) {
  await expect(page.locator('.verdict').filter({ hasText: new RegExp(`^${value}$`) })).toBeVisible()
}

test.describe('two phones converge when there is signal (ACC-149)', () => {
  test('phone A issues; phone B shows amber after its scheduled pull', async ({ browser }) => {
    const server: FixtureServer = { issued: [] }
    const a = await phone(browser, server, 'Phone A', false)
    const b = await phone(browser, server, 'Phone B', true)

    // B has the person as not yet collected.
    await scan(b.page, `BOA26:${PEOPLE[0].passToken}`)
    await expectVerdict(b.page, 'Approved')
    await b.page.getByRole('button', { name: 'Cancel' }).click()

    // A issues while online: the outbox drains straight away.
    await scan(a.page, `BOA26:${PEOPLE[0].passToken}`)
    await expectVerdict(a.page, 'Approved')
    await a.page.getByLabel('Wristband serial, optional').fill('0412')
    await a.page.getByRole('button', { name: 'Issue wristband' }).click()
    await expect.poll(() => server.issued.length).toBe(1)
    await expect(a.page.locator('[data-sync-status]')).toHaveText(/^Synced (just now|\d+ min ago)$/)

    // B has not pulled since; it still says green.
    const pullsBefore = b.pulls.count
    await scan(b.page, `BOA26:${PEOPLE[0].passToken}`)
    await expectVerdict(b.page, 'Approved')
    await b.page.getByRole('button', { name: 'Cancel' }).click()
    expect(b.pulls.count).toBe(pullsBefore)

    // B's pull timer comes due. Nothing else happens on B: no reload, no
    // online event, no scan until the pull has landed.
    await b.page.clock.fastForward(PULL_INTERVAL_MS + 5_000)
    await expect.poll(() => b.pulls.count).toBeGreaterThan(pullsBefore)

    await expect(async () => {
      await scan(b.page, `BOA26:${PEOPLE[0].passToken}`)
      await expectVerdict(b.page, 'Collected')
    }).toPass({ timeout: 10_000 })
    // Collected says when, where and which band, not three ways of "already".
    await expect(b.page.locator('#gres')).toContainText('serial #0412')

    // The other person is still green on B: the pull did not over-reach.
    await b.page.getByRole('button', { name: 'Next person' }).click()
    await scan(b.page, `BOA26:${PEOPLE[1].passToken}`)
    await expectVerdict(b.page, 'Approved')

    await a.context.close()
    await b.context.close()
  })
})
