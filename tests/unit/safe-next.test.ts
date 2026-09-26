// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { destinationAfterLogin, homeForRole, safeNext } from '@/lib/safe-next'

/**
 * ACC-150 — `?next=` decides where a just-authenticated session lands, and it
 * rides in a link, so it is an allowlist rather than a "starts with /" check.
 */
describe('safeNext', () => {
  it('accepts in-app gate and desk paths', () => {
    expect(safeNext('/gate')).toBe('/gate')
    expect(safeNext('/gate/vehicle')).toBe('/gate/vehicle')
    expect(safeNext('/desk/queue')).toBe('/desk/queue')
    expect(safeNext('/desk/master?org=11111111-1111-4111-8111-111111111111')).toBe(
      '/desk/master?org=11111111-1111-4111-8111-111111111111',
    )
  })

  it('refuses anything that could leave this origin', () => {
    for (const value of [
      'https://evil.example',
      '//evil.example/gate',
      '/\\evil.example',
      'javascript:alert(1)',
      '/api/gate/pull',
      '/gate?x=1',
      '/desk/master?evil=1',
      '/desk/master?org=not-an-id',
      '/desk/master?in_bms=maybe',
      '/desk/master?org=11111111-1111-4111-8111-111111111111&',
      '/desk/master?org=11111111-1111-4111-8111-111111111111&org=22222222-2222-4222-8222-222222222222',
      '',
      null,
      undefined,
    ]) {
      expect(safeNext(value)).toBeNull()
    }
  })
})

describe('destinationAfterLogin', () => {
  it('sends an issuer to the gate and everyone else to the desk', () => {
    expect(homeForRole('issuer')).toBe('/gate')
    expect(homeForRole('approver')).toBe('/desk')
    expect(homeForRole(null)).toBe('/desk')
    expect(destinationAfterLogin(null, 'issuer')).toBe('/gate')
    expect(destinationAfterLogin('/desk/master', 'admin')).toBe('/desk/master')
    expect(destinationAfterLogin('https://evil.example', 'issuer')).toBe('/gate')
  })
})
