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
      submittedCount: 2, approvedCount: 2, collectedCount: 1,
    },
    {
      id: ORG_B, name: 'Soundcheck Ltd', kind: 'vendor', quota: 500, default_type: 'crew',
      contact_name: 'Priya S', contact_phone: '+919000000002', status: 'open', notes: null,
      created_at: '2026-09-25T08:00:00.000Z', updated_at: '2026-09-25T08:00:00.000Z',
      submittedCount: 1, approvedCount: 0, collectedCount: 0,
    },
  ],
}

function person(id: string, fullName: string, orgName: string, orgId: string) {
  return {
    id, fullName, orgId, phone: '+919000000009', orgName, role: 'Rigger', dayValidity: 'show' as const, orgKind: 'vendor' as const,
    typeCode: 'crew' as const, status: 'approved' as const, passRef: 'BOA26-0001',
    vehicleReg: null, bandSerial: null, stickerNo: null, inBms: false,
    collectedAt: null, gateLabel: null, decidedAt: null,
  }
}

/**
 * The real route now returns the whole roster and the screen filters it in the
 * browser (r8-master.html), so this mock ignores the filter params on purpose:
 * `seen` records what was asked for, which for the screen itself is nothing.
 */
async function installDesk(page: Page, seen: string[]) {
  await page.route('**/api/desk/dashboard', (route: Route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route: Route) => route.fulfill({ json: operators }))
  await page.route('**/api/desk/orgs', (route: Route) => route.fulfill({ json: orgs }))
  await page.route('**/api/desk/master**', (route: Route) => {
    seen.push(new URL(route.request().url()).search)
    const all = [
      // ACC-154: p1 is the one person already in BMS, so `?in_bms=` splits
      // this fixture the way it splits the real roster.
      { ...person('p1', 'Sound Person One', 'Sound', ORG_A), inBms: true },
      person('p2', 'Sound Person Two', 'Sound', ORG_A),
      person('p3', 'Soundcheck Person', 'Soundcheck Ltd', ORG_B),
    ]
    // ACC-162: `all` IS the unfiltered population here.
    return route.fulfill({ json: masterResponseSchema.parse({ rows: all, total: all.length }) })
  })
}

test.describe('organisations link to a filtered master list (ACC-152)', () => {
  test('a company row opens Master list filtered to that company, and says so', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto('/desk/orgs')

    await expect(page.getByText('Every company sending people. Open one to see them in the Master list.')).toBeVisible()
    await expect(page.getByRole('link', { name: /^Sound —/ }).locator('.nm')).toBeVisible()
    // r10 (r8-orgs.html) replaced the Status column with Collected.
    await expect(page.getByRole('link', { name: /^Sound —/ }).locator('.orgs-collected .body-sm')).toHaveText('1')
    // The list does NOT show people — that is the whole point of ADR-021.
    await expect(page.getByText('Sound Person One')).toHaveCount(0)

    await page.getByRole('link', { name: /^Sound — show their people/ }).click()
    await expect(page).toHaveURL(new RegExp(`/desk/master\\?org=${ORG_A}$`))

    // Only that company's people are on screen...
    await expect(page.getByText('Sound Person One')).toBeVisible()
    await expect(page.getByText('Soundcheck Person')).toHaveCount(0)

    // ...a filter the operator cannot see is a bug, so it is a removable chip.
    await expect(page.locator('.chips .chip').filter({ hasText: 'Organisation: Sound' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove Organisation filter' }).click()
    await expect(page).toHaveURL(/\/desk\/master$/)
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
  })

  test('the filter is an exact id, so "Sound" does not drag in "Soundcheck Ltd"', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto(`/desk/master?org=${ORG_B}`)
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
    await expect(page.getByText('Sound Person One')).toHaveCount(0)
  })

  test('an org with nobody on the roster says so rather than looking broken', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto('/desk/master?org=99999999-9999-4999-8999-999999999999')
    await expect(page.getByRole('heading', { name: 'No one matches' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await expect(page).toHaveURL(/\/desk\/master$/)
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
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

/**
 * ACC-154 — the same principle, applied to the filter that had neither half
 * of it. `?in_bms=` is reached from the "N not in BMS" badge in the chrome of
 * every desk screen; before this it showed 14 of 612 with nothing saying why
 * and no way back.
 */
test.describe('the BMS filter names itself and can be escaped (ACC-154)', () => {
  test('the Control room "Not in BookMyShow" tile leads to a list that says what it is showing', async ({ page }) => {
    const seen: string[] = []
    await installDesk(page, seen)
    await page.goto('/desk')

    await page.locator('a[href="/desk/master?in_bms=false"]').first().click()
    await expect(page).toHaveURL(/\/desk\/master\?in_bms=false$/)

    // Only the outstanding people are on screen...
    await expect(page.getByText('Sound Person Two')).toBeVisible()
    await expect(page.getByText('Sound Person One')).toHaveCount(0)
    // ...and the screen says so, and offers the way out.
    await expect(page.locator('.chips .chip').filter({ hasText: 'BMS: Not in BMS' })).toBeVisible()

    await page.getByRole('button', { name: 'Remove BMS filter' }).click()
    await expect(page).toHaveURL(/\/desk\/master$/)
    await expect(page.getByText('Sound Person One')).toBeVisible()
  })

  test('the other direction names itself too', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master?in_bms=true')
    await expect(page.getByText('Sound Person One')).toBeVisible()
    await expect(page.getByText('Sound Person Two')).toHaveCount(0)
    await expect(page.locator('.chips .chip').filter({ hasText: 'BMS: Entered in BMS' })).toBeVisible()
  })

  test('two filters at once, and Clear all clears both', async ({ page }) => {
    await installDesk(page, [])
    await page.goto(`/desk/master?org=${ORG_A}&in_bms=false`)

    await expect(page.getByText('Sound Person Two')).toBeVisible()
    await expect(page.getByText('Soundcheck Person')).toHaveCount(0)
    await expect(page.locator('.chips .chip')).toHaveCount(2)

    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page).toHaveURL(/\/desk\/master$/)
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
  })

  test('a filter that matches nobody says so and offers the way out', async ({ page }) => {
    await installDesk(page, [])
    await page.goto(`/desk/master?org=${ORG_B}&in_bms=true`)
    await expect(page.getByRole('heading', { name: 'No one matches' })).toBeVisible()
    await expect(page.getByText('Remove a filter to see more people.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear filters' })).toBeVisible()
  })
})

/**
 * r8-master.html's Add filter menu, its presets, and the links the Control
 * room sends (?status=, ?tier=, ?vehicle=).
 */
test.describe('the Add filter menu, presets and Control room links', () => {
  test('Add filter lists the kinds with counts, and choosing a value adds a chip', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master')
    await page.getByRole('button', { name: 'Add filter' }).click()
    for (const kind of ['Organisation', 'Tier', 'Status', 'BMS', 'Vehicle', 'Days valid', 'Role']) {
      await expect(page.getByRole('menuitem', { name: new RegExp(`^${kind}`) })).toBeVisible()
    }
    await page.getByRole('menuitem', { name: /^Organisation/ }).click()
    await page.locator('.menu label', { hasText: 'Soundcheck Ltd' }).locator('input').check()
    await expect(page).toHaveURL(new RegExp(`org=${ORG_B}`))
    await expect(page.getByText('Soundcheck Person')).toBeVisible()
    await expect(page.getByText('Sound Person One')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.locator('.add-wrap .menu')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add filter' })).toBeFocused()
  })

  test('the presets really filter, and carry counts', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master')
    await expect(page.locator('.chip-preset', { hasText: 'Not in BMS' }).locator('.count-dot')).toHaveText('2')
    await expect(page.locator('.chip-preset', { hasText: 'Has a vehicle' }).locator('.count-dot')).toHaveText('0')
    await expect(page.locator('.chip-preset', { hasText: 'Voided' }).locator('.count-dot')).toHaveText('0')
    await page.locator('.chip-preset', { hasText: 'Not collected' }).click()
    await expect(page).toHaveURL(/status=not_collected/)
    await expect(page.getByText('Sound Person One')).toBeVisible()
    await expect(page.locator('.chips .chip').filter({ hasText: 'Status: Not collected' })).toBeVisible()
  })

  test('?status=, ?tier= and ?vehicle= are read from the URL', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master?status=collected')
    await expect(page.getByRole('heading', { name: 'No one matches' })).toBeVisible()
    await page.goto('/desk/master?tier=crew&status=not_collected')
    await expect(page.getByText('Sound Person One')).toBeVisible()
    await page.goto('/desk/master?vehicle=pending')
    await expect(page.getByRole('heading', { name: 'No one matches' })).toBeVisible()
  })

  test('the export link carries the filters on screen', async ({ page }) => {
    await installDesk(page, [])
    await page.goto(`/desk/master?org=${ORG_A}`)
    await expect(page.getByRole('link', { name: /Export CSV/ })).toHaveAttribute('href', new RegExp(`format=csv.*org=${ORG_A}`))
  })
})

/**
 * ACC-162 / ADR-023 — the Master list exposes real row and column semantics.
 *
 * It was eight columns of `div`s with no header row, so a screen-reader user got
 * a flat list with no way to navigate by column, and nothing said how many of
 * the roster was on screen. The frozen contract draws no header row and master
 * is the one v2 screen passing `test:visual`, so the headers are exposed through
 * ARIA and kept out of flow (`.sr-only` is `position:absolute`) — the pixels are
 * byte-identical, verified at 0.54/0.56/0.03/0.04% before and after.
 */
test.describe('master list semantics and count (ACC-162)', () => {
  const COLUMNS = ['Person', 'Tier', 'Days', 'Band', 'Vehicle', 'BMS', 'Collected']

  test('the rows are a table with named columns, and every row has one cell per column', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master')
    const table = page.getByRole('table')
    await expect(table).toHaveCount(1)

    for (const column of COLUMNS) {
      await expect(page.getByRole('columnheader', { name: column, exact: true })).toHaveCount(1)
    }
    await expect(page.getByRole('columnheader')).toHaveCount(COLUMNS.length)

    // 3 fixture people + the header row.
    await expect(page.getByRole('row')).toHaveCount(4)
    for (const row of await page.getByRole('row').filter({ has: page.locator('.nm') }).all()) {
      expect(await row.getByRole('cell').count()).toBe(COLUMNS.length)
    }
  })

  test('the column names are visible in the sticky header', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master')
    // ACC-184: the r10 master list makes the columns legible to a volunteer.
    await expect(page.getByRole('columnheader', { name: 'Band', exact: true })).toHaveCount(1)
    await expect(page.locator('[role="row"].thead')).toBeVisible()
    await expect(page.locator('[role="row"].thead')).toHaveCSS('position', 'sticky')
  })

  test('the table says how much of the roster is on screen, unfiltered and filtered', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master')
    // Unfiltered: "all", not "3 of 3", which would read as a filter.
    await expect(page.getByRole('table')).toHaveAccessibleName('Master list. All 3 people.')

    await page.goto(`/desk/master?org=${ORG_A}`)
    await expect(page.getByRole('table')).toHaveAccessibleName('Master list. Showing 2 of 3 people.')
    // And visibly, beside the chips.
    await expect(page.locator('.count')).toHaveText('2 of 3')
  })

  test('a filter that matches nobody still says what it was drawn from', async ({ page }) => {
    await installDesk(page, [])
    await page.goto('/desk/master?org=99999999-9999-4999-8999-999999999999')
    // No table when there are no rows — an empty ARIA table is worse than none.
    await expect(page.getByRole('table')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'No one matches' })).toBeVisible()
  })
})
