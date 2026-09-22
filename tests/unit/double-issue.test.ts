import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  dashboardResponseSchema,
  dashboardSchema,
  doubleIssueListSchema,
  doubleIssueSchema,
} from '@/lib/schemas/dashboard'
import { formatBandSerial, formatLedgerTime } from '@/lib/format'
import { DoubleIssuePanel } from '@/app/desk/double-issue-panel'
// @ts-expect-error -- plain .mjs shared with scripts/visual-check.mjs; allowJs is off
import * as desk from '../../scripts/visual-fixtures/desk.mjs'

/**
 * ACC-148. The dashboard contract is EXTENDED by one key; these tests pin
 * that an old payload still parses, that the new list's shape is enforced,
 * and that the Control room panel renders from that data (not from itself).
 */

const band = (n: number, over: Record<string, unknown> = {}) => ({
  checkinId: `b0000000-0000-4000-8000-00000000000${n}`,
  bandSerial: `04${n}`,
  issuerName: `Issuer ${n}`,
  issuerKind: 'device',
  operatorId: null,
  deviceId: 'd0000000-0000-4000-8000-000000000001',
  gateLabel: 'Gate 1',
  occurredAt: '2026-10-09T04:30:00+00:00',
  postedAt: '2026-10-09T04:50:00.123456+00:00',
  isReissue: false,
  ...over,
})

const person = (issues: unknown[]) => ({
  personId: 'c0000000-0000-4000-8000-000000000001',
  fullName: 'Test Person',
  orgName: 'Test Org',
  typeCode: 'crew',
  liveBands: issues.length,
  issues,
})

const preAcc148Payload: Record<string, unknown> = { ...(desk.dashboard as Record<string, unknown>) }
delete preAcc148Payload['doubleIssues']
delete preAcc148Payload['doubleIssueList']

describe('dashboard schema (ACC-148 extension)', () => {
  it('still parses a payload from before the migration, reading doubleIssues as 0', () => {
    expect('doubleIssues' in preAcc148Payload).toBe(false)
    const parsed = dashboardSchema.parse(preAcc148Payload)
    expect(parsed.doubleIssues).toBe(0)
  })

  it('keeps the count the RPC sends', () => {
    expect(dashboardSchema.parse({ ...preAcc148Payload, doubleIssues: 3 }).doubleIssues).toBe(3)
  })

  it('refuses a negative or fractional count', () => {
    expect(dashboardSchema.safeParse({ ...preAcc148Payload, doubleIssues: -1 }).success).toBe(false)
    expect(dashboardSchema.safeParse({ ...preAcc148Payload, doubleIssues: 1.5 }).success).toBe(false)
  })

  it('defaults the route list to empty and allows null (count known, list failed)', () => {
    expect(dashboardResponseSchema.parse(preAcc148Payload).doubleIssueList).toEqual([])
    expect(dashboardResponseSchema.parse({ ...preAcc148Payload, doubleIssues: 1, doubleIssueList: null }).doubleIssueList).toBeNull()
  })
})

describe('double-issue list schema', () => {
  it('accepts two live bands, from an operator and from a legacy device', () => {
    const row = person([
      band(1, { issuerKind: 'operator', operatorId: 'e0000000-0000-4000-8000-000000000001', deviceId: null }),
      band(2),
    ])
    expect(doubleIssueListSchema.parse([row])).toHaveLength(1)
  })

  it('accepts a band with no serial typed (non-negotiable #6)', () => {
    expect(doubleIssueSchema.safeParse(person([band(1, { bandSerial: null }), band(2)])).success).toBe(true)
  })

  it('refuses a "double" issue with one band', () => {
    expect(doubleIssueSchema.safeParse(person([band(1)])).success).toBe(false)
  })

  it('refuses an unknown issuer kind and a time without an offset', () => {
    expect(doubleIssueSchema.safeParse(person([band(1, { issuerKind: 'robot' }), band(2)])).success).toBe(false)
    expect(doubleIssueSchema.safeParse(person([band(1, { occurredAt: '2026-10-09 10:00' }), band(2)])).success).toBe(false)
  })
})

describe('DoubleIssuePanel', () => {
  const render = (count: number, list: unknown) =>
    renderToStaticMarkup(createElement(DoubleIssuePanel, { count, list: list as never }))

  it('renders nothing when the count is zero', () => {
    expect(render(0, [])).toBe('')
  })

  it('renders person, both serials, both issuers and both times from the fixture', () => {
    const fixture = dashboardResponseSchema.parse(desk.dashboardDoubleIssue)
    const html = render(fixture.doubleIssues, fixture.doubleIssueList)
    const [row] = fixture.doubleIssueList ?? []
    expect(row).toBeDefined()
    expect(html).toContain(row!.fullName)
    expect(html).toContain(row!.orgName)
    for (const issue of row!.issues) {
      expect(html).toContain(formatBandSerial(issue.bandSerial))
      expect(html).toContain(issue.issuerName)
      expect(html).toContain(formatLedgerTime(issue.occurredAt))
    }
    expect(html).toContain('1 person holds two live bands')
  })

  it('still warns when the count is known but the list failed', () => {
    const html = render(2, null)
    expect(html).toContain('2 people hold two live bands')
    expect(html).toContain('could not load')
  })
})
