import { expect, test } from '@playwright/test'
import { dashboardSchema } from '../../lib/schemas/dashboard'
import { masterResponseSchema } from '../../lib/schemas/master'

/**
 * Vipin, 6 Oct: "the highlight moves but the page stays". Every /desk/* page is
 * force-dynamic, so a nav click waits on the server. app/desk/loading.tsx must
 * fill the page area at once while it does, and the next screen must land after.
 *
 * Only the real navigation request is held. Link prefetches carry
 * `next-router-prefetch` and are let through, which is what lets the loading
 * boundary show instantly in production.
 */

const dashboard = dashboardSchema.parse({
  submittedTotal: 0, submittedOrgs: 0, approvedTotal: 0, pendingTotal: 0,
  bandsIssued: 0, bandsNotCollected: 0, stickersActive: 0, stickersPending: 0,
  bmsAdded: 0, bmsPending: 0, aaaStamped: 0, aaaNominatedApproved: 0,
  types: [], orgs: [],
})
const master = masterResponseSchema.parse({ rows: [], total: 0 })
const operators = {
  callerId: 'operator-1',
  operators: [{ user_id: 'operator-1', role: 'approver', display_name: 'Nav Tester', active: true, created_at: '2026-09-20T08:00:00.000Z' }],
}

test('a desk nav click shows the loading state while the next screen is held, then lands', async ({ page }) => {
  await page.route('**/api/desk/dashboard', (route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route) => route.fulfill({ json: operators }))
  await page.route('**/api/desk/master*', (route) => route.fulfill({ json: master }))

  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/desk/master**', async (route) => {
    const headers = route.request().headers()
    if (headers['rsc'] && !headers['next-router-prefetch']) await held
    await route.continue()
  })

  await page.goto('/desk')
  await expect(page.getByRole('heading', { name: 'Control room' })).toBeAttached()

  await page.getByRole('navigation', { name: 'Desk navigation' }).getByRole('link', { name: 'Master list' }).click()

  // Held: the skeleton is up, the nav is still there, and the old screen is not
  // left standing as if nothing happened.
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toBeVisible({ timeout: 2_000 })
  await expect(page.getByRole('navigation', { name: 'Desk navigation' })).toBeVisible()

  release()
  await expect(page).toHaveURL(/\/desk\/master$/)
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toHaveCount(0)
})
