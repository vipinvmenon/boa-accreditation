import { expect, test, type Page, type Route } from '@playwright/test'
import { queueActionSchema } from '../../lib/schemas/queue'

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const PEOPLE = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Pending Person',
    status: 'submitted' as const,
    type: null,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Approved Person',
    status: 'approved' as const,
    type: 'crew' as const,
  },
]

function queueResponse(filter: string) {
  const rows = PEOPLE.filter((person) => {
    if (filter === 'pending') return person.status === 'submitted'
    return person.status === filter
  })

  return {
    rows: rows.map((person) => ({
      id: person.id,
      org_id: ORG_ID,
      org_name: 'Queue Test Org',
      org_kind: 'vendor',
      full_name: person.name,
      phone: '+91 90000 00000',
      role_text: 'Test role',
      vehicle_reg: null,
      status: person.status,
      type_code: person.type,
      day_validity: person.type ? 'build_show' : null,
      decision_reason: null,
      created_at: '2026-09-20T08:00:00.000Z',
      submitted_at: '2026-09-20T08:00:00.000Z',
    })),
    selectedLabel: `0 of ${rows.length} selected`,
    approvedCount: 1,
    orgs: [{
      id: ORG_ID,
      name: 'Queue Test Org',
      kind: 'vendor',
      contactName: 'Queue Contact',
      contactPhone: '+91 90000 00000',
      used: 1,
      quota: 10,
      defaultType: 'crew',
      status: 'submitted',
    }],
    nextOrg: null,
    counts: { pending: 1, approved: 1, rejected: 0, aaa: 0 },
  }
}

async function installDeskFixtures(page: Page) {
  await page.route('**/api/desk/dashboard', async (route: Route) => {
    await route.fulfill({
      json: {
        submittedTotal: 2,
        submittedOrgs: 1,
        approvedTotal: 1,
        pendingTotal: 1,
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
      },
    })
  })
  await page.route('**/api/desk/operators', async (route: Route) => {
    await route.fulfill({
      json: {
        callerId: 'operator-1',
        operators: [{
          user_id: 'operator-1',
          role: 'approver',
          display_name: 'Queue Tester',
          active: true,
          created_at: '2026-09-20T08:00:00.000Z',
        }],
      },
    })
  })
}

async function openQueue(page: Page, onQueueRequest?: (route: Route) => Promise<void>) {
  await installDeskFixtures(page)
  await page.route('**/api/desk/queue**', async (route: Route) => {
    if (onQueueRequest) {
      await onQueueRequest(route)
      return
    }
    if (route.request().method() === 'POST') {
      await route.fulfill({ json: { ok: true } })
      return
    }
    const filter = new URL(route.request().url()).searchParams.get('filter') ?? 'pending'
    await route.fulfill({ json: queueResponse(filter) })
  })
  await page.goto('/desk/queue')
  await expect(page.getByText(/0 of 1 selected/)).toBeVisible()
}

test.describe('Queue interactions', () => {
  test('starts with no rows selected after load', async ({ page }) => {
    await openQueue(page)

    await expect(page.getByRole('checkbox', { name: 'Select all people in this view' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText('0 of 1 selected')).toBeVisible()
  })

  test('selects every row with select-all', async ({ page }) => {
    await openQueue(page)

    await page.getByRole('checkbox', { name: 'Select all people in this view' }).click()

    await expect(page.getByRole('checkbox', { name: 'Select all people in this view' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('1 of 1 selected')).toBeVisible()
  })

  test('clears selection when a filter reloads the queue', async ({ page }) => {
    await openQueue(page)
    await page.getByRole('checkbox', { name: 'Select all people in this view' }).click()

    await page.getByRole('button', { name: /Approved/ }).click()

    await expect(page.getByText('0 of 1 selected')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Select all people in this view' })).toHaveAttribute('aria-checked', 'false')
  })

  test('clears selection after a mutation reloads the queue', async ({ page }) => {
    const postedActions: Array<ReturnType<typeof queueActionSchema.parse>> = []
    await openQueue(page, async (route) => {
      if (route.request().method() === 'POST') {
        const action = queueActionSchema.parse(route.request().postDataJSON())
        expect(action).toMatchObject({
          action: 'decide',
          approve: true,
          typeCode: 'crew',
          dayValidity: 'build_show',
        })
        postedActions.push(action)
        await route.fulfill({ json: { ok: true } })
        return
      }
      const filter = new URL(route.request().url()).searchParams.get('filter') ?? 'pending'
      await route.fulfill({ json: queueResponse(filter) })
    })
    await page.getByRole('checkbox', { name: 'Select all people in this view' }).click()

    await page.locator('.selbar').getByRole('button', { name: 'Approve', exact: true }).click()

    await expect.poll(() => postedActions.length).toBe(1)
    expect(postedActions.map((action) => action.action === 'decide' ? action.personId : null)).toEqual(
      PEOPLE.filter((person) => person.status === 'submitted').map((person) => person.id),
    )
    await expect(page.getByText('0 of 1 selected')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Select all people in this view' })).toHaveAttribute('aria-checked', 'false')
  })
})
