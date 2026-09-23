// Design data for the authenticated desk screens, served to the real UI
// through the real API contract.
//
// Every value below is transcribed from design/source/boa_design_body.html
// renderVals() (line numbers cited per block). visual-check.mjs fulfils
// /api/desk/* with these payloads via Playwright's page.route(), so the
// shipped components fetch, Zod-parse and render them exactly as they would
// production data. This is the same pattern as seedGateDexie() for the gate:
// the design is a static artboard, so its numbers have to arrive through the
// data layer before the real screen is captured.
//
// Two rules keep this honest:
//  1. validateDeskFixtures() parses every payload with the SAME Zod schema the
//     screen uses. A fixture that drifts from the API contract fails the run
//     before a single screenshot is taken.
//  2. scripts/check-bundle-content.mjs fails the build if any fixture name
//     below appears in app/, lib/ or components/ — so a screen can never pass
//     by hardcoding what these fixtures supply.

import QRCode from 'qrcode'

/** Names that must never appear in shipped source. Read by check-bundle-content.mjs. */
export const FIXTURE_SENTINELS = [
  'Ranjith',
  'Chakra Sound',
  'Faisal Mohammed',
  'Sentinel Security',
  'Thunderjaw',
  'Distortion Press',
  'Redline Beverages',
  'Ironhoof',
  'Prakash Devaiah',
  'Nikita Banerjee',
  'BOA26-0412',
  'BOA26-2205',
  'Meera Doubleday',
]

/** Copies of lib/design.ts's QR_* (this .mjs cannot import TypeScript at
 *  runtime). tests/unit/visual-fixtures.test.ts fails if they drift. */
export const QR_SCHEME = 'BOA26:'
export const QR_DARK = '#0A0A0A'
export const QR_LIGHT = '#FFFFFF'

const IST = (date, time) => `2026-10-${date}T${time}:00.000+05:30`
const uuid = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// ── Status bar + Control room (lines 53-57, 640-669, 122, 565-567) ─────────
const DESIGN_ORGS = [
  { name: 'Chakra Sound & Light', kind: 'vendor', contactName: 'Ranjith K', contactPhone: '+91 98861 04422', used: 14, quota: 22, defaultType: 'stage', status: 'submitted' },
  { name: 'Sentinel Security Services', kind: 'security', contactName: 'Faisal M', contactPhone: '+91 99012 88104', used: 68, quota: 70, defaultType: 'crew', status: 'approved' },
  { name: 'BOA Production Core', kind: 'crew', contactName: 'Bhoopesh', contactPhone: '+91 98450 11290', used: 41, quota: 45, defaultType: 'stage', status: 'approved' },
  { name: 'Thunderjaw Merch', kind: 'vendor', contactName: 'Aditi R', contactPhone: '+91 90350 77218', used: 9, quota: 12, defaultType: 'crew', status: 'open' },
  { name: 'Redline Beverages', kind: 'sponsor', contactName: 'Sameer T', contactPhone: '+91 87620 41139', used: 18, quota: 20, defaultType: 'crew', status: 'approved' },
  { name: 'Distortion Press', kind: 'media', contactName: 'Nikita B', contactPhone: '+91 96110 55873', used: 11, quota: 15, defaultType: 'crew', status: 'submitted' },
  { name: 'Ironhoof Rigging', kind: 'contractor', contactName: 'Prakash D', contactPhone: '+91 94480 30012', used: 26, quota: 26, defaultType: 'stage', status: 'closed' },
]

export const dashboard = {
  submittedTotal: 641,
  submittedOrgs: 38,
  approvedTotal: 612,
  pendingTotal: 29,
  bandsIssued: 184,
  bandsNotCollected: 428,
  stickersActive: 47,
  stickersPending: 5, // 47 + 5 = "52 registrations approved"
  bmsAdded: 598,
  bmsPending: 14,
  aaaStamped: 14,
  aaaNominatedApproved: 18,
  // ACC-148: the design has no double-issue state, so the reference capture
  // carries none and the warning panel stays absent.
  doubleIssues: 0,
  doubleIssueList: [],
  // ACC-115: the RPC returns every boa_acc_type row in sort_order (ADR-018).
  // The design's three counts are kept on the codes that survived; the five
  // pack-only tiers have no design figure and read 0. Pixel sign-off against
  // the three-band artboard is re-run under ACC-111.
  types: [
    { code: 'aaa', count: 14 },
    { code: 'artist', count: 0 },
    { code: 'stage', count: 78 },
    { code: 'promoters_lounge', count: 0 },
    { code: 'crew', count: 520 },
    { code: 'photo', count: 0 },
    { code: 'eddies_lounge', count: 0 },
    { code: 'general_admission', count: 0 },
  ],
  orgs: DESIGN_ORGS.map((o, i) => ({ id: uuid(100 + i), ...o })),
}

// ── ACC-148 · a double issue, caught after sync ─────────────────────────────
// Not in the design (the artboard predates ADR-020), so this state is not
// captured against a reference. It exists so the warning panel has a
// schema-checked payload to render through the real route contract. The
// person, org and serials are invented; the names are sentinels below.
export const dashboardDoubleIssue = {
  ...dashboard,
  doubleIssues: 1,
  doubleIssueList: [
    {
      personId: uuid(700),
      fullName: 'Meera Doubleday',
      orgName: DESIGN_ORGS[1].name,
      typeCode: 'crew',
      liveBands: 2,
      issues: [
        { checkinId: uuid(701), bandSerial: '0771', issuerName: 'Kavya R', issuerKind: 'operator', operatorId: uuid(901), deviceId: null, gateLabel: 'Gate 1', occurredAt: IST('09', '10:00'), postedAt: IST('09', '10:20'), isReissue: false },
        { checkinId: uuid(702), bandSerial: '0772', issuerName: 'Arjun P', issuerKind: 'device', operatorId: null, deviceId: uuid(800), gateLabel: 'Gate 2', occurredAt: IST('09', '10:05'), postedAt: IST('09', '10:31'), isReissue: false },
      ],
    },
  ],
}

export const operators = {
  callerId: uuid(900),
  operators: [
    { user_id: uuid(900), role: 'approver', display_name: 'Bhoopesh S', active: true, created_at: IST('01', '09:00') },
  ],
}

// Queue (design lines 181-183, 671-697) was retired app-side by ADR-019
// (22 Sep) — the fixture that used to sit here (org_id CHAKRA_ID, seven
// QUEUE_PEOPLE) is gone with it; nothing else in this module referenced it.

// ── Master list (lines 703-725) ─────────────────────────────────────────────
const MASTER = [
  { name: 'Ranjith Kumar', phone: '+91 98861 04422', org: 'Chakra Sound & Light', kind: 'vendor', type: 'stage', band: '#0412', vehicle: 'KA 05 MJ 8871', at: IST('09', '14:02'), gate: 'Gate 1', inBms: true },
  { name: 'Faisal Mohammed', phone: '+91 99012 88104', org: 'Sentinel Security', kind: 'security', type: 'crew', band: '#1180', vehicle: null, at: IST('09', '06:40'), gate: 'Gate 1', inBms: true },
  { name: 'Bhoopesh S', phone: '+91 98450 11290', org: 'BOA Production Core', kind: 'crew', type: 'aaa', band: '#0001', vehicle: 'KA 01 AB 2211', at: IST('08', '11:15'), gate: 'Desk', inBms: true },
  { name: 'Aditi Rao', phone: '+91 90350 77218', org: 'Thunderjaw Merch', kind: 'vendor', type: 'crew', band: null, vehicle: 'KA 51 CQ 0043', at: null, gate: null, inBms: false },
  { name: 'Nikita Banerjee', phone: '+91 96110 55873', org: 'Distortion Press', kind: 'media', type: 'crew', band: '#2205', vehicle: null, at: IST('10', '12:30'), gate: 'Gate 2', inBms: true },
  { name: 'Sameer Thomas', phone: '+91 87620 41139', org: 'Redline Beverages', kind: 'sponsor', type: 'crew', band: null, vehicle: 'KA 03 HD 7788', at: null, gate: null, inBms: false },
  { name: 'Prakash Devaiah', phone: '+91 94480 30012', org: 'Ironhoof Rigging', kind: 'contractor', type: 'stage', band: '#0388', vehicle: 'KA 09 TR 1902', at: IST('08', '07:55'), gate: 'Desk', inBms: true },
  { name: 'Imran Sheikh', phone: '+91 96320 90014', org: 'Chakra Sound & Light', kind: 'vendor', type: 'crew', band: null, vehicle: null, at: null, gate: null, inBms: false, rejectedAt: IST('05', '18:00') },
]

export const master = {
  rows: MASTER.map((m, i) => ({
    id: uuid(300 + i),
    fullName: m.name,
    phone: m.phone,
    orgName: m.org,
    orgKind: m.kind,
    typeCode: m.type,
    status: m.rejectedAt ? 'rejected' : 'approved',
    passRef: m.rejectedAt ? null : `BOA26-${String(i + 1).padStart(4, '0')}`,
    vehicleReg: m.vehicle,
    bandSerial: m.band,
    stickerNo: null,
    inBms: m.inBms,
    collectedAt: m.at,
    // ACC-095 contract fields (docs/PLAN-DESIGN-FIDELITY.md), declared by the
    // Master response schema and validated with the rest of this fixture.
    gateLabel: m.gate,
    decidedAt: m.rejectedAt ?? null,
  })),
}

// ── Passes (lines 740-756) ──────────────────────────────────────────────────
const SHEET = [
  { name: 'Ranjith Kumar', org: 'Chakra Sound & Light', role: 'Stage tech', type: 'stage', vehicle: 'KA 05 MJ 8871', days: 'build_show', ref: 'BOA26-0412' },
  { name: 'Vinay Shetty', org: 'Chakra Sound & Light', role: 'Rigger', type: 'stage', vehicle: null, days: 'build_show', ref: 'BOA26-0418' },
  { name: 'Meera Joseph', org: 'Chakra Sound & Light', role: 'FOH engineer', type: 'crew', vehicle: null, days: 'show', ref: 'BOA26-0421' },
  { name: 'Suhas Bhat', org: 'Thunderjaw Merch', role: 'Truck driver', type: 'crew', vehicle: 'KA 51 CQ 0043', days: 'build', ref: 'BOA26-0631' },
  { name: 'Bhoopesh S', org: 'BOA Production Core', role: 'Accreditation lead', type: 'aaa', vehicle: 'KA 01 AB 2211', days: 'build_show', ref: 'BOA26-0001' },
  { name: 'Nikita Banerjee', org: 'Distortion Press', role: 'Photographer', type: 'crew', vehicle: null, days: 'show', ref: 'BOA26-2205' },
]

/**
 * `{ passes: (Pass & { qrSvg })[] }` — the ACC-097 (P7) response. The QR is a
 * real code for the fixture token, generated with the same library and options
 * as the server; the design draws a fake 13x13 pattern, so the QR region is a
 * named mask in visual-check.mjs rather than something a fixture can match.
 * Every viewport gets the same six passes as the approved source.
 */
export async function passesFor() {
  const sheet = SHEET
  const passes = await Promise.all(
    sheet.map(async (p, i) => {
      const passToken = `visualPassToken${String(i).padStart(7, '0')}`
      return {
        id: uuid(400 + i),
        fullName: p.name,
        role: p.role,
        vehicleReg: p.vehicle,
        orgName: p.org,
        passRef: p.ref,
        passToken,
        typeCode: p.type,
        dayValidity: p.days,
        qrSvg: await QRCode.toString(`${QR_SCHEME}${passToken}`, {
          type: 'svg',
          margin: 0,
          errorCorrectionLevel: 'M',
          color: { dark: QR_DARK, light: QR_LIGHT },
        }),
      }
    }),
  )
  return { passes }
}

/**
 * Parse every payload with the schema its screen uses. Throws with the Zod
 * issue list on the first mismatch — the run stops before capturing anything.
 */
export async function validateDeskFixtures() {
  const [{ dashboardResponseSchema }, { masterResponseSchema }, { passesResponseSchema }, { operatorRowSchema }] =
    await Promise.all([
      import('../../lib/schemas/dashboard.ts'),
      import('../../lib/schemas/master.ts'),
      import('../../lib/schemas/pass.ts'),
      import('../../lib/schemas/operator.ts'),
    ])
  const check = (label, schema, value) => {
    const r = schema.safeParse(value)
    if (!r.success) throw new Error(`visual fixture "${label}" does not match its API schema:\n${JSON.stringify(r.error.issues, null, 2)}`)
  }
  check('dashboard', dashboardResponseSchema, dashboard)
  check('dashboard/double-issue', dashboardResponseSchema, dashboardDoubleIssue)
  check('master', masterResponseSchema, master)
  for (const op of operators.operators) check('operators', operatorRowSchema, op)
  for (const vp of ['web', 'mob']) {
    check(`passes/${vp}`, passesResponseSchema, await passesFor(vp))
  }
}
