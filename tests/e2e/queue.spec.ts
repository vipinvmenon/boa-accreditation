import { expect, test, type Page, type Route } from '@playwright/test'
import { queueResponseSchema } from '../../lib/schemas/queue'
// The same fixture the visual gate renders (ACC-090), so these behaviours are
// proven on exactly the screen the pixel contract covers. Parsed through the
// screen's own schema at this boundary, as tests/unit/visual-fixtures does.
// @ts-expect-error -- plain .mjs shared with scripts/visual-check.mjs; allowJs is off
import * as deskFixtures from '../../scripts/visual-fixtures/desk.mjs'

const desk = {
  queue: queueResponseSchema.parse(deskFixtures.queue),
  dashboard: deskFixtures.dashboard as unknown,
  operators: deskFixtures.operators as unknown,
}

type DecideBody = { action: string; personId?: string; orgId?: string; approve?: boolean; typeCode?: string | null; reason?: string | null }

const PENDING = desk.queue.rows.filter((row) => row.status === 'submitted')

async function openQueue(page: Page, postStatuses: number[] = [200]): Promise<DecideBody[]> {
  const posts: DecideBody[] = []
  let n = 0
  await page.route(/\/api\/desk\/dashboard(\?|$)/, (route: Route) => route.fulfill({ json: desk.dashboard }))
  await page.route(/\/api\/desk\/operators(\?|$)/, (route: Route) => route.fulfill({ json: desk.operators }))
  await page.route(/\/api\/desk\/queue(\?|$)/, async (route: Route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: desk.queue })
      return
    }
    posts.push(route.request().postDataJSON() as DecideBody)
    const status = postStatuses[n] ?? postStatuses[postStatuses.length - 1] ?? 200
    n += 1
    await route.fulfill({ status, json: status < 300 ? { ok: true } : { error: 'internal' } })
  })
  await page.goto('/desk/queue')
  await expect(page.getByText(/of 2 selected/)).toBeVisible()
  return posts
}

test.describe('approval queue (ACC-115)', () => {
  test('loads with nothing selected; decided rows are status marks, not selectable', async ({ page }) => {
    await openQueue(page)
    await expect(page.getByText('0 of 2 selected')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Approve selected' })).toBeDisabled()
    const marks = page.getByRole('checkbox', { name: 'Approved', exact: true })
    await expect(marks).toHaveCount(4)
    for (const mark of await marks.all()) await expect(mark).toBeDisabled()
    await expect(page.getByRole('checkbox', { name: /^(Select|Deselect) Ranjith Kumar$/ })).toHaveCount(0)
  })

  test('the Approve selected button is readable when disabled (was a blank box)', async ({ page }) => {
    await openQueue(page)
    const button = page.getByRole('button', { name: 'Approve selected' })
    await expect(button).toBeDisabled()
    // Readable = the label's colour differs from the fill it sits on, and
    // that fill is not transparent (a transparent box was the blank-box bug).
    const { color, fill } = await button.evaluate((el) => ({ color: getComputedStyle(el).color, fill: getComputedStyle(el).backgroundColor }))
    expect(fill).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    expect(color).not.toBe(fill)
    expect(Number(await button.evaluate((el) => getComputedStyle(el).opacity))).toBeGreaterThanOrEqual(0.5)
  })

  test('a row type change affects only that row, and Approve selected sends each row its own type', async ({ page }) => {
    const posts = await openQueue(page)
    const [first, second] = PENDING
    await page.getByLabel(`Band type for ${first!.full_name}`).selectOption('stage')
    await page.getByRole('checkbox', { name: 'Select all pending people' }).click()
    await expect(page.getByText('2 of 2 selected')).toBeVisible()
    await page.getByRole('button', { name: 'Approve selected' }).click()
    await expect(page.getByText('Approved 2.')).toBeVisible()
    expect(posts.map((body) => [body.personId, body.approve, body.typeCode])).toEqual([
      [first!.id, true, 'stage'],
      [second!.id, true, 'crew'],
    ])
  })

  test('Set type applies to the selected rows only', async ({ page }) => {
    const posts = await openQueue(page)
    const [first, second] = PENDING
    await page.getByRole('checkbox', { name: `Select ${second!.full_name}` }).click()
    await page.getByLabel('Set type for the selected people').selectOption('stage')
    await page.getByRole('checkbox', { name: `Select ${first!.full_name}` }).click()
    await page.getByRole('button', { name: 'Approve selected' }).click()
    await expect(page.getByText('Approved 2.')).toBeVisible()
    const byId = new Map(posts.map((body) => [body.personId, body.typeCode]))
    expect(byId.get(first!.id)).toBe('crew')
    expect(byId.get(second!.id)).toBe('stage')
  })

  test('bulk Reject rejects every selected row with one reason', async ({ page }) => {
    const posts = await openQueue(page)
    await page.getByRole('checkbox', { name: 'Select all pending people' }).click()
    await page.getByRole('button', { name: 'Reject selected' }).click()
    await page.getByLabel('Reason for rejecting the selected people').fill('Not on the vendor list')
    await page.getByRole('button', { name: 'Reject 2' }).click()
    await expect(page.getByText('Rejected 2.')).toBeVisible()
    expect(posts.map((body) => [body.personId, body.approve, body.reason])).toEqual(
      PENDING.map((row) => [row.id, false, 'Not on the vendor list']),
    )
  })

  test('a partial failure is reported and the failed row stays selected', async ({ page }) => {
    await openQueue(page, [200, 500])
    await page.getByRole('checkbox', { name: 'Select all pending people' }).click()
    await page.getByRole('button', { name: 'Approve selected' }).click()
    await expect(page.getByText('Approved 1 of 2. 1 did not go through and are still selected.')).toBeVisible()
    await expect(page.getByText('1 of 2 selected')).toBeVisible()
  })

  test('Approve all uses the org call only when every pending row has the same type', async ({ page }) => {
    const posts = await openQueue(page)
    await page.getByRole('button', { name: 'Approve all' }).click()
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toMatchObject({ action: 'approve_org', typeCode: 'crew' })

    posts.length = 0
    await page.getByLabel(`Band type for ${PENDING[0]!.full_name}`).selectOption('stage')
    await page.getByRole('button', { name: 'Approve all' }).click()
    await expect(page.getByText('Approved 2.')).toBeVisible()
    expect(posts.map((body) => [body.action, body.typeCode])).toEqual([['decide', 'stage'], ['decide', 'crew']])
  })

  test('decided tabs have no bulk bar and no "Org N of M pending"', async ({ page }) => {
    await openQueue(page)
    await page.getByRole('button', { name: /^Approved\s*\d+$/ }).click()
    await expect(page.getByRole('button', { name: 'Approve selected' })).toHaveCount(0)
    await expect(page.getByText(/Org \d+ of \d+ pending/)).toHaveCount(0)
  })
})
