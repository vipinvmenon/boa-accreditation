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

  await page.getByRole('button', { name: 'Invite operator' }).click()
  const role = page.getByLabel('Role')
  await expect(role).toHaveValue('issuer')
  await expect(page.getByText('Check people in, issue wristbands, and log vehicle events; gate only.')).toBeVisible()

  for (const option of ['Lead', 'Approver', 'Admin', 'Issuer']) {
    await expect(role.locator('option', { hasText: option })).toHaveCount(1)
  }
  await role.selectOption('approver')
  await expect(page.getByText('Review and approve people in the desk; cannot use the gate.')).toBeVisible()
})

test('operator sheet changes a role and requires confirmation before deactivation', async ({ page }) => {
  const operator = {
    user_id: 'operator-2',
    role: 'lead' as const,
    display_name: 'Gate Lead',
    active: true,
    created_at: '2026-09-25T08:00:00.000Z',
  }
  await page.route('**/api/desk/dashboard', (route: Route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route: Route) => route.fulfill({
    json: { callerId: 'operator-1', operators: [{ ...operator, role: 'lead' }, { ...operator, user_id: 'operator-1', display_name: 'Desk Tester', role: 'admin' }] },
  }))
  await page.route('**/api/desk/operators/operator-2', async (route) => {
    const body = route.request().postDataJSON() as { role?: string; active?: boolean }
    await route.fulfill({ json: { operator: { ...operator, role: body.role ?? operator.role, active: body.active ?? operator.active } } })
  })

  await page.goto('/desk/users')
  await page.getByRole('row', { name: /Gate Lead/ }).press('Enter')
  await expect(page.getByRole('dialog', { name: /Gate Lead/ })).toBeVisible()
  await page.getByLabel('Role').last().selectOption('approver')
  await page.getByRole('button', { name: 'Save role' }).click()
  await expect(page.getByText('Gate Lead updated.')).toBeVisible()
  await page.getByRole('button', { name: 'Deactivate' }).click()
  await expect(page.getByRole('alertdialog', { name: /Confirm deactivation/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Keep active' })).toBeVisible()
})
