import { expect, test, type Page, type Route } from '@playwright/test'
import { TIERS } from '../../lib/design'
import { dashboardSchema } from '../../lib/schemas/dashboard'
import { masterResponseSchema } from '../../lib/schemas/master'
import { passesResponseSchema } from '../../lib/schemas/pass'

/**
 * ACC-115 · the desk renders the pack's eight tiers and six zones (ADR-018)
 * from the API payload, not from constants. Every payload below is parsed with
 * the screen's own schema first, so a fixture cannot drift from the contract.
 */

const ORG_ID = '11111111-1111-4111-8111-111111111111'
const PERSON_ID = '22222222-2222-4222-8222-222222222222'

const dashboard = dashboardSchema.parse({
  submittedTotal: 8,
  submittedOrgs: 1,
  approvedTotal: 8,
  pendingTotal: 0,
  bandsIssued: 0,
  bandsNotCollected: 8,
  stickersActive: 0,
  stickersPending: 0,
  bmsAdded: 0,
  bmsPending: 8,
  aaaStamped: 1,
  aaaNominatedApproved: 1,
  // The RPC's own order: boa_acc_type.sort_order.
  types: TIERS.map((t, i) => ({ code: t.code, count: i + 1, note: `${t.label} note from the database` })),
  orgs: [{ id: ORG_ID, name: 'Tier Test Org', kind: 'media', defaultType: 'photo', contactName: 'Contact', contactPhone: '+91 90000 00000', quota: 5, used: 1, status: 'submitted' }],
})

const operators = {
  callerId: 'operator-1',
  operators: [{ user_id: 'operator-1', role: 'approver', display_name: 'Tier Tester', active: true, created_at: '2026-09-20T08:00:00.000Z' }],
}

async function installChrome(page: Page) {
  await page.route('**/api/desk/dashboard', (route: Route) => route.fulfill({ json: dashboard }))
  await page.route('**/api/desk/operators', (route: Route) => route.fulfill({ json: operators }))
}

test.describe('desk tiers (ACC-115)', () => {
  test('control room renders every tier the dashboard returns, in its order', async ({ page }) => {
    await installChrome(page)
    await page.goto('/desk')
    await expect(page.getByRole('heading', { name: 'Eight bands. No ninth.' })).toBeVisible()
    const cards = page.locator('.bandcard')
    await expect(cards).toHaveCount(8)
    await expect(cards.locator('h3')).toHaveText(TIERS.map((t) => t.label))
    const promoters = cards.filter({ hasText: 'Promoters Lounge note from the database' })
    await expect(promoters.locator('.col')).toHaveText('Royal blue band')
    await expect(promoters.locator('.zones span')).toHaveText([
      'Festival Area', "Eddie's Lounge", 'Promoters Lounge + ID', 'Photo Pit', 'Backstage + ID after 22:00', 'Main Stage',
    ])
    await expect(promoters.locator('.zones span.off')).toHaveCount(3)
    await expect(page.locator('.li .band')).toHaveText('Photo')
  })

  test('master list names the tier from the row', async ({ page }) => {
    await installChrome(page)
    const master = masterResponseSchema.parse({
      rows: [{
        id: PERSON_ID, fullName: 'Lounge Person', phone: '+91 90000 00000', orgName: 'Tier Test Org', orgKind: 'media',
        typeCode: 'eddies_lounge', status: 'approved', passRef: 'BOA26-0001', vehicleReg: null, bandSerial: null,
        stickerNo: null, inBms: false, collectedAt: null, gateLabel: null, decidedAt: null,
      }],
    })
    await page.route('**/api/desk/master**', (route: Route) => route.fulfill({ json: master }))
    await page.goto('/desk/master')
    await expect(page.locator('.mrow .band')).toHaveText("Eddie's Lounge")
  })

  test('printed pass: tier, band colour name, and the six-zone strip with its qualifiers', async ({ page }) => {
    await installChrome(page)
    const passes = passesResponseSchema.parse({
      passes: [{
        id: PERSON_ID, fullName: 'Promoter Person', role: 'Promoter', vehicleReg: null, orgName: 'Tier Test Org',
        passRef: 'BOA26-0002', passToken: 'AAAAAAAAAAAAAAAAAAAAAA', typeCode: 'promoters_lounge', dayValidity: 'show',
        qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>',
      }],
    })
    await page.route('**/api/desk/passes', (route: Route) => route.fulfill({ json: passes }))
    await page.goto('/desk/passes')
    const pass = page.locator('article.pass')
    await expect(pass.locator('.bandbox b')).toHaveText('Promoters Lounge')
    await expect(pass.locator('.bandbox small')).toHaveText('Royal blue band')
    await expect(pass.locator('.zones span')).toHaveText([
      'Festival Area', "Eddie's Lounge", 'Promoters Lounge + ID', 'Photo Pit', 'Backstage + ID after 22:00', 'Main Stage',
    ])
    await expect(pass.locator('.zones span.off')).toHaveText(["Eddie's Lounge", 'Photo Pit', 'Main Stage'])
  })
})
