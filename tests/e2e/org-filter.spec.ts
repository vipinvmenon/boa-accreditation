import { expect, test, type Page, type Route } from '@playwright/test'
import { TIERS } from '../../lib/design'
import { dashboardSchema } from '../../lib/schemas/dashboard'
import { masterResponseSchema } from '../../lib/schemas/master'

/**
 * ACC-152 / ADR-021 — people are listed in exactly one place.
 *
 * Organisations does not list people; its rows open Master list filtered to
 * that company (`?org=<id>`). These cover the three things that would make
 * that a worse design than the duplication it replaced: the link not applying
 * the filter, the filter being invisible once applied (an operator counting
 * three people and concluding the roster lost twenty-two), and the filter
 * being a name match rather than an id.
 */

const ORG_A = '11111111-1111-4111-8111-111111111111'
const ORG_B = '33333333-3333-4333-8333-333333333333'

const operators = {
  callerId: 'operator-1',
  operators: [{ user_id: 'operator-1', role: 'admin', display_name: 'Org Tester', active: true, created_at: '2026-09-25T08:00:00.000Z' }],
}

const dashboard = dashboardSchema.parse({
  submittedTotal: 3, submittedOrgs: 2, approvedTotal: 3, pendingTotal: 0,
  bandsIssued: 0, bandsNotCollected: 3, stickersActive: 0, stickersPending: 0,
  bmsAdded: 0, bmsPending: 3, aaaStamped: 0, aaaNominatedApproved: 0,
  types: TIERS.map((t, i) => ({ code: t.code, count: i, note: null })),
  orgs: [],
})

const orgs = {
  orgs: [
    {
      id: ORG_A, name: 'Sound', kind: 'vendor', quota: 500, default_type: 'crew',
      contact_name: 'Ramesh K', contact_phone: '+919000000001', status: 'open', notes: null,
      created_at: '2026-09-25T08:00:00.000Z', updated_at: '2026-09-25T08:00:00.000Z',
      submittedCount: 2, approvedCount: 2,
    },
    {
      id: ORG_B, name: 'Soundcheck Ltd', kind: 'vendor', quota: 500, default_type: 'crew',
      contact_name: 'Priya S', contact_phone: '+919000000002', status: 'open', notes: null,
      created_at: '2026-09-25T08:00:00.000Z', updated_at: '2026-09-25T08:00:00.000Z',
      submittedCount: 1, approvedCount: 0,
    },
  ],
}

function person(id: string, fullName: string, orgName: string) {
  return {
    id, fullName, phone: '+919000000009', orgName, orgKind: 'vendor' as const,
    typeCode: 'crew' as const, status: 'approved' as const, passRef: 'BOA26-0001',
    vehicleReg: null, bandSerial: null, stickerNo: null, inBms: false,
    collectedAt: null, gateLabel: null, decidedAt: null,
  }
}

/** Honours `?org=` exactly, the way the real route does. */
async function installDesk(page: Page, seen: string[]) {
  await page.route('**/api/desk/dashboard', (route: Route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route: Route) => route.fulfill({ json: operators }))
  await page.route('**/api/desk/orgs', (route: Route) => route.fulfill({ json: orgs }))
  await page.route('**/api/desk/master**', (route: Route) => {
    const org = new URL(route.request().url()).searchParams.get('org') ?? ''
    seen.push(org)
    const all = [
      person('p1', 'Sound Person One', 'Sound'),
      person('p2', 'Sound Person Two', 'Sound'),
      person('p3', 'Soundcheck Person', 'Soundcheck Ltd'),
    ]
    const rows = org === ORG_A ? all.slice(0, 2) : org === ORG_B ? all.slice(2) : org ? [] : all
    return route.fulfill({ json: masterResponseSchema.parse({ rows }) })
  })
}

test.describe('organisations link to a filtered master list (ACC-152)', () => {
  test('a company row opens Master list filtered to that company, and says so', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto('/desk/orgs')

    // The list does NOT show people — that is the whole point of ADR-021.
    await expect(page.getByText('Sound Person One')).toHaveCount(0)

    await page.getByRole('link', { name: /^Sound — show their people/ }).click()
    await expect(page).toHaveURL(new RegExp(`/desk/master\\?org=${ORG_A}$`))

    // The filter reached the API as an exact id...
    await expect.poll(() => seen).toContain(ORG_A)
    // ...and only that company's people are on screen.
    await expect(page.getByText('Sound Person One')).toBeVisible()
    await expect(page.getByText('Soundcheck Person')).toHaveCount(0)

    // A filter the operator cannot see is a bug, so it is stated and escapable.
    await expect(page.getByRole('status').filter({ hasText: 'Showing Sound only' })).toBeVisible()
    await page.getByRole('link', { name: 'Show everyone' }).click()
    await expect(page).toHaveURL(/\/desk\/master$/)
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
  })

  test('the filter is an exact id, so "Sound" does not drag in "Soundcheck Ltd"', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto(`/desk/master?org=${ORG_B}`)
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
    await expect(page.getByText('Sound Person One')).toHaveCount(0)
    expect(seen).toContain(ORG_B)
  })

  test('an org with nobody on the roster says so rather than looking broken', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto('/desk/master?org=99999999-9999-4999-8999-999999999999')
    await expect(page.getByRole('status').filter({ hasText: 'No one from this organisation yet' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Show everyone' })).toBeVisible()
  })

  test('the Control room counts companies and links out; it no longer lists them', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto('/desk')

    await expect(page.getByRole('heading', { name: '2 companies on site' })).toBeVisible()
    // The list, its fake 25/500 quota meter and its dead "Needs you first"
    // sort all went with ADR-021 rather than being repaired.
    await expect(page.getByText('Needs you first')).toHaveCount(0)
    await expect(page.locator('[aria-label="Organisations on site"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: /Organisations/ }).first()).toBeVisible()
  })
})
