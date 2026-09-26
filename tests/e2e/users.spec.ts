import { expect, test, type Route } from '@playwright/test'
import { TIERS } from '../../lib/design'
import { dashboardSchema } from '../../lib/schemas/dashboard'

const dashboard = dashboardSchema.parse({
  submittedTotal: 0,
  submittedOrgs: 0,
  approvedTotal: 0,
  pendingTotal: 0,
  bandsIssued: 0,
  bandsNotCollected: 0,
  stickersActive: 0,
  stickersPending: 0,
  bmsAdded: 0,
  bmsPending: 0,
  aaaStamped: 0,
  aaaNominatedApproved: 0,
  types: TIERS.map((tier) => ({ code: tier.code, count: 0, note: null })),
  orgs: [],
})

test('invite form defaults to issuer and explains every role', async ({ page }) => {
  await page.route('**/api/desk/dashboard', (route: Route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route: Route) => route.fulfill({
    json: {
      callerId: 'operator-1',
      operators: [{
        user_id: 'operator-1',
        role: 'admin',
        display_name: 'Desk Tester',
        active: true,
        created_at: '2026-09-25T08:00:00.000Z',
      }],
    },
  }))

  await page.goto('/desk/users')

  const role = page.getByLabel('Role')
  await expect(role).toHaveValue('issuer')
  await expect(page.getByText('Check people in, issue wristbands, and log vehicle events; gate only.')).toBeVisible()

  for (const option of ['Lead', 'Approver', 'Admin', 'Issuer']) {
    await expect(role.locator('option', { hasText: option })).toHaveCount(1)
  }
  await role.selectOption('approver')
  await expect(page.getByText('Review and approve people in the desk; cannot use the gate.')).toBeVisible()
})
