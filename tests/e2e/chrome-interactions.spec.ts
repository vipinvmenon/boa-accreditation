import { expect, test, type Page, type Route } from '@playwright/test'

const DESK_DASHBOARD = {
  submittedTotal: 0,
  submittedOrgs: 0,
  approvedTotal: 1,
  pendingTotal: 0,
  bandsIssued: 0,
  bandsNotCollected: 0,
  stickersActive: 0,
  stickersPending: 0,
  bmsAdded: 0,
  bmsPending: 0,
  aaaStamped: 0,
  aaaNominatedApproved: 0,
  types: [{ code: 'crew', count: 1 }, { code: 'stage', count: 0 }, { code: 'aaa', count: 0 }],
  orgs: [],
}

async function installDeskFixtures(page: Page) {
  await page.route('**/api/desk/dashboard', async (route: Route) => {
    await route.fulfill({ json: DESK_DASHBOARD })
  })
  await page.route('**/api/desk/operators', async (route: Route) => {
    await route.fulfill({
      json: {
        callerId: 'operator-1',
        operators: [{
          user_id: 'operator-1',
          role: 'admin',
          display_name: 'Chrome Tester',
          active: true,
          created_at: '2026-09-20T08:00:00.000Z',
        }],
      },
    })
  })
}

async function installGateFixture(page: Page) {
  // ACC-150: a logged-in issuer, mocked like every other gate API here.
  await page.route('**/api/gate/session', async (route: Route) => {
    await route.fulfill({
      json: { operatorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', displayName: 'Chrome Tester', role: 'issuer' },
    })
  })
  await page.route('**/api/gate/pull', async (route: Route) => {
    await route.fulfill({
      json: {
        operatorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        operatorRole: 'issuer',
        gateLabel: 'Check-in',
        volunteerName: 'Chrome Tester',
        roster: [{
          passToken: 'chrome-pass',
          personId: '11111111-1111-4111-8111-111111111111',
          orgId: '99999999-9999-4999-8999-999999999999',
          status: 'approved',
          vehicleReg: null,
          updatedAt: '2026-09-20T08:00:00.000Z',
          fullName: 'Chrome Person',
          phone: '+919821000001',
          roleText: 'Working crew',
          orgName: 'Chrome Org',
          typeCode: 'crew',
          dayValidity: 'build_show',
        }],
        ledger: [],
        rosterAsOf: '2026-09-20T08:00:00.000Z',
        ledgerAsOf: '2026-09-20T08:00:00.000Z',
      },
    })
  })
}

test.describe('shared chrome interactions', () => {
  test('desk profile disclosure exposes controls and restores focus', async ({ page }) => {
    await installDeskFixtures(page)
    await page.goto('/desk')

    const profileButton = page.getByRole('button', { name: 'Operator menu' })
    const profileMenu = page.locator('#desk-profile-menu')
    await expect(profileButton).toHaveAttribute('aria-controls', 'desk-profile-menu')
    await expect(profileButton).toHaveAttribute('aria-expanded', 'false')
    await expect(profileMenu).toBeHidden()

    await profileButton.click()
    await expect(profileButton).toHaveAttribute('aria-expanded', 'true')
    await expect(profileMenu).toBeVisible()
    await expect(profileMenu.getByRole('button', { name: /theme/i })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(profileButton).toHaveAttribute('aria-expanded', 'false')
    await expect(profileMenu).toBeHidden()
    await expect(profileButton).toBeFocused()
  })

  test('desk overlays are mutually exclusive and drawer restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installDeskFixtures(page)
    await page.goto('/desk')

    const profileButton = page.getByRole('button', { name: 'Operator menu' })
    const burger = page.getByRole('button', { name: 'Menu', exact: true })
    const drawer = page.locator('#desk-menu')
    const profileMenu = page.locator('#desk-profile-menu')

    await expect(drawer).toHaveAttribute('hidden', '')
    await expect(drawer).toHaveAttribute('aria-hidden', 'true')
    await expect(drawer).toHaveAttribute('inert', '')

    await profileButton.click()
    await expect(profileButton).toHaveAttribute('aria-expanded', 'true')
    await expect(profileMenu).toBeVisible()

    await burger.click()
    await expect(profileButton).toHaveAttribute('aria-expanded', 'false')
    await expect(profileMenu).toHaveAttribute('hidden', '')
    await expect(drawer).toBeVisible()
    await expect(drawer).not.toHaveAttribute('inert')
    await page.keyboard.press('Escape')
    await expect(drawer).toHaveAttribute('hidden', '')
    await expect(drawer).toHaveAttribute('aria-hidden', 'true')
    await expect(burger).toBeFocused()
  })

  test('gate drawer is hidden and inert until opened, then restores focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installGateFixture(page)
    await page.goto('/gate')
    await expect(page.getByRole('button', { name: "Can't scan? Search by name" })).toBeVisible()

    // exact: true — the profile-menu button's accessible name is "Operator
    // Menu", so a substring match resolves to both buttons (strict-mode
    // violation).
    const burger = page.getByRole('button', { name: 'Menu', exact: true })
    const drawer = page.locator('#gate-menu')
    await expect(burger).toHaveAttribute('aria-controls', 'gate-menu')
    await expect(burger).toHaveAttribute('aria-expanded', 'false')
    await expect(drawer).toHaveAttribute('hidden', '')
    await expect(drawer).toHaveAttribute('aria-hidden', 'true')
    await expect(drawer).toHaveAttribute('inert', '')

    await burger.click()
    await expect(burger).toHaveAttribute('aria-expanded', 'true')
    await expect(drawer).toBeVisible()
    await expect(drawer).not.toHaveAttribute('inert')

    await page.keyboard.press('Escape')
    await expect(burger).toHaveAttribute('aria-expanded', 'false')
    await expect(drawer).toHaveAttribute('hidden', '')
    await expect(drawer).toHaveAttribute('aria-hidden', 'true')
    await expect(burger).toBeFocused()
  })
})
