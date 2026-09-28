import { describe, expect, it } from 'vitest'
import {
  dashboardGateCountSchema,
  dashboardLatestIssueSchema,
  dashboardSchema,
} from '@/lib/schemas/dashboard'

describe('dashboard gate feed schema (ACC-183a)', () => {
  it('defaults the new read-only feed fields for an older dashboard payload', () => {
    const parsed = dashboardSchema.parse({
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
      types: [],
      orgs: [],
    })

    expect(parsed.gateCounts).toEqual([])
    expect(parsed.latestIssues).toEqual([])
  })

  it('accepts a gate count and a typed ledger issue', () => {
    expect(dashboardGateCountSchema.parse({ gateLabel: 'Gate 1', count: 4 })).toEqual({
      gateLabel: 'Gate 1',
      count: 4,
    })
    expect(
      dashboardLatestIssueSchema.parse({
        checkinId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        personId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fullName: 'A Person',
        orgName: 'An Organisation',
        typeCode: 'crew',
        kind: 'wristband',
        bandSerial: '0412',
        stickerNo: null,
        vehicleReg: null,
        gateLabel: 'Gate 1',
        occurredAt: '2026-10-10T10:00:00+05:30',
        postedAt: '2026-10-10T10:01:00+05:30',
        isReissue: false,
      }),
    ).toMatchObject({ gateLabel: 'Gate 1', kind: 'wristband' })
  })

  it('rejects a negative gate count and a void ledger row', () => {
    expect(dashboardGateCountSchema.safeParse({ gateLabel: 'Gate 1', count: -1 }).success).toBe(false)
    expect(
      dashboardLatestIssueSchema.safeParse({
        checkinId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        personId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        fullName: 'A Person',
        orgName: 'An Organisation',
        typeCode: 'crew',
        kind: 'void',
        bandSerial: null,
        stickerNo: null,
        vehicleReg: null,
        gateLabel: 'Gate 1',
        occurredAt: '2026-10-10T10:00:00+05:30',
        postedAt: '2026-10-10T10:01:00+05:30',
        isReissue: false,
      }).success,
    ).toBe(false)
  })
})
