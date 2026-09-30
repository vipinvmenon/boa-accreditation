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
    // r10 (r8-control-room.html): a "Bands" shelf; each card lists its HELD zones
    // only, dot + name, like the pass ticket (ADR-025).
    const shelf = page.getByRole('region', { name: 'Bands' })
    const cards = shelf.locator('a.card')
    await expect(cards).toHaveCount(8)
    await expect(cards.locator('h3')).toHaveText(TIERS.map((t) => t.label))
    const promoters = cards.filter({ hasText: 'Promoters Lounge note from the database' })
    await expect(promoters.locator('ul li')).toHaveText(['Festival Area', 'Promoters Lounge', 'Backstage'])
    // Removed with ADR-021: this asserted `.li .band`, the band chip on the
    // Control room's ORGANISATIONS row — not a tier card, and nothing to do
    // with this test's subject. That list moved to /desk/orgs, whose rows show
    // kind, counts, status and contact rather than a band chip. The Control
    // room's new contract (a count, no list) is covered by
    // tests/e2e/org-filter.spec.ts.
  })

  test('master list names the tier from the row', async ({ page }) => {
    await installChrome(page)
    const master = masterResponseSchema.parse({
      rows: [{
        id: PERSON_ID, fullName: 'Lounge Person', orgId: 'org-tier-test', phone: '+91 90000 00000', orgName: 'Tier Test Org',
        role: 'Host', tshirtSize: null, dayValidity: 'show', orgKind: 'media',
        typeCode: 'eddies_lounge', status: 'approved', passRef: 'BOA26-0001', vehicleReg: null, bandSerial: null,
        stickerNo: null, inBms: false, collectedAt: null, gateLabel: null, decidedAt: null,
      }],
      total: 1,
    })
    await page.route('**/api/desk/master**', (route: Route) => route.fulfill({ json: master }))
    await page.goto('/desk/master')
    await expect(page.locator('.tr [role="cell"] .tier')).toHaveText("Eddie's Lounge")
  })

  test('printed pass: the shared ticket, its band, and only the zones it enters (ADR-025)', async ({ page }) => {
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
    const pass = page.locator('.pass-item')
    await expect(pass).toHaveCount(1)
    await pass.click()
    const ticket = page.locator('.passes-sheet .tk')
    await expect(ticket.locator('.tk-tier')).toHaveText('Promoters Lounge')
    await expect(ticket.getByRole('img', { name: 'Promoters Lounge wristband' })).toHaveAttribute('src', '/assets/bands/promoters_lounge.webp')
    // Round 6 (Vipin, 28 Sep): held zones only, no ID or time qualifiers on the pass.
    await expect(ticket.getByRole('list', { name: 'Zones this pass enters' }).getByRole('listitem')).toHaveText([
      'Festival Area', 'Promoters Lounge', 'Backstage',
    ])
    await expect(ticket.getByText(/\+ ID|after 22:00/)).toHaveCount(0)
  })
})
