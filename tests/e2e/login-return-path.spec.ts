import { expect, test, type Page, type Route } from '@playwright/test'
import { TIERS } from '../../lib/design'
import { dashboardSchema } from '../../lib/schemas/dashboard'
import { masterResponseSchema } from '../../lib/schemas/master'

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = 'operator-1'

const dashboard = dashboardSchema.parse({
  submittedTotal: 1,
  submittedOrgs: 1,
  approvedTotal: 1,
  pendingTotal: 0,
  bandsIssued: 0,
  bandsNotCollected: 1,
  stickersActive: 0,
  stickersPending: 0,
  bmsAdded: 0,
  bmsPending: 1,
  aaaStamped: 0,
  aaaNominatedApproved: 0,
  types: TIERS.map((tier) => ({ code: tier.code, count: 0, note: null })),
  orgs: [],
})

const user = {
  id: USER_ID,
  email: 'operator@example.test',
}

async function installDeskFixtures(page: Page) {
  let masterRequests = 0
  const masterResults: Array<{ url: string; status: number }> = []

  await page.route('**/api/desk/dashboard', (route: Route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route: Route) => route.fulfill({
    json: {
      callerId: USER_ID,
      operators: [{
        user_id: USER_ID,
        role: 'admin',
        display_name: 'Desk Tester',
        active: true,
        created_at: '2026-09-25T08:00:00.000Z',
      }],
    },
  }))
  await page.route('**/api/desk/master**', (route: Route) => {
    masterRequests += 1
    if (masterRequests === 1) {
      masterResults.push({ url: route.request().url(), status: 401 })
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    }
    masterResults.push({ url: route.request().url(), status: 200 })
    return route.fulfill({
      json: masterResponseSchema.parse({
        rows: [{
          id: 'person-1',
          fullName: 'Filtered Person',
          orgId: ORG_ID,
          phone: '+919000000001',
          orgName: 'Sound',
          role: 'Rigger', tshirtSize: null, tshirtGivenAt: null,
          dayValidity: 'show',
          orgKind: 'vendor',
          typeCode: 'crew',
          status: 'approved',
          passRef: 'BOA26-0001',
          vehicleReg: null,
          bandSerial: null,
          stickerNo: null,
          inBms: false,
          collectedAt: null,
          gateLabel: null,
          decidedAt: null,
        }],
        total: 1,
      }),
    })
  })
  return masterResults
}

async function installAuthFixtures(page: Page) {
  let signedIn = false

  await page.route('**/auth/v1/user', (route: Route) => {
    if (!signedIn) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"error":"invalid_token"}' })
    }
    return route.fulfill({ json: user })
  })
  await page.route('**/auth/v1/token**', (route: Route) => {
    signedIn = true
    return route.fulfill({
      json: {
        access_token: 'e2e-access-token',
        refresh_token: 'e2e-refresh-token',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user,
      },
    })
  })
  await page.route('**/rest/v1/boa_acc_operator**', (route: Route) => route.fulfill({
    json: [{ role: 'admin' }],
  }))
}

test('a desk 401 returns to the exact filtered page after sign-in', async ({ page }) => {
  const masterResults = await installDeskFixtures(page)
  await installAuthFixtures(page)

  await page.goto(`/desk/master?org=${ORG_ID}`)
  await expect(page).toHaveURL(new RegExp(`/desk/login\\?next=${encodeURIComponent(`/desk/master?org=${ORG_ID}`)}`))

  await page.getByLabel('Email').fill('operator@example.test')
  await page.getByLabel('Password').fill('correct horse battery staple')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(`/desk/master?org=${ORG_ID}`)
  // The list reads the whole roster and filters in the browser (r8-master.html),
  // so the API is not asked for the org; the filter is carried by the page URL,
  // which is what this test is about.
  expect(masterResults[0]).toMatchObject({ status: 401 })
  expect(new URL(page.url()).searchParams.get('org')).toBe(ORG_ID)
})

test('gate sign-in explains and can reveal the password', async ({ page }) => {
  await installAuthFixtures(page)
  await page.goto('/desk/login?next=/gate')

  const password = page.getByLabel('Password')
  await expect(password).toBeVisible()
  // ACC-176: the sentence under the heading is what explains the gate sign-in;
  // the "minimum 8" hint belongs to setting a password, not signing in.
  await expect(page.getByText('Sign in while you have signal. The gate keeps working offline after that.')).toBeVisible()
  await expect(page.getByText('Minimum 8 characters.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Gate sign in' })).toBeVisible()

  // noValidate: an empty submit gets the page's own inline error, not a browser tooltip.
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.locator('form').getByRole('alert')).toHaveText('Enter your email and password.')

  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})
