import { describe, expect, it } from 'vitest'
import { passTokenParamSchema, passViewSchema, passViewWithQrSchema } from '@/lib/schemas/pass-view'

// ACC-144 · the boundary Zod schemas behind /p/[passToken]. The RPC call and
// the route handler itself are exercised by supabase/tests/pass-view.test.sql
// (the database, live) and tests/e2e/pass-page.spec.ts (the rendered page,
// mocked data) — this file covers only the pure parsing these schemas do.

const VALID_ROW = {
  fullName: 'Asha Rao',
  role: 'Stage tech',
  vehicleReg: 'KA05MJ8871',
  orgName: 'Chakra Sound & Light',
  passRef: 'BOA26-0412',
  typeCode: 'stage',
  dayValidity: 'build_show',
} as const

describe('passViewSchema', () => {
  it('accepts the shape boa_acc_pass_view returns', () => {
    expect(passViewSchema.safeParse(VALID_ROW).success).toBe(true)
  })

  it('accepts a null vehicleReg — most people have no vehicle', () => {
    expect(passViewSchema.safeParse({ ...VALID_ROW, vehicleReg: null }).success).toBe(true)
  })

  it('rejects an unknown tier code — the pack (ADR-018) is a closed vocabulary', () => {
    expect(passViewSchema.safeParse({ ...VALID_ROW, typeCode: 'vip' }).success).toBe(false)
  })

  it('rejects an unknown day validity', () => {
    expect(passViewSchema.safeParse({ ...VALID_ROW, dayValidity: 'weekend' }).success).toBe(false)
  })

  it('never validates a row carrying a phone or a passToken — those keys are not in the schema', () => {
    const withExtras = { ...VALID_ROW, phone: '+919876543210', passToken: 'x'.repeat(22) }
    const parsed = passViewSchema.parse(withExtras)
    expect(parsed).not.toHaveProperty('phone')
    expect(parsed).not.toHaveProperty('passToken')
  })

  it('rejects a missing required field', () => {
    const rest: Record<string, unknown> = { ...VALID_ROW }
    delete rest['fullName']
    expect(passViewSchema.safeParse(rest).success).toBe(false)
  })
})

describe('passViewWithQrSchema', () => {
  it('requires qrSvg on top of the base fields', () => {
    expect(passViewWithQrSchema.safeParse(VALID_ROW).success).toBe(false)
    expect(passViewWithQrSchema.safeParse({ ...VALID_ROW, qrSvg: '<svg></svg>' }).success).toBe(true)
  })
})

describe('passTokenParamSchema', () => {
  it('accepts a real 22-character base64url token', () => {
    expect(passTokenParamSchema.safeParse('AbCdEfGhIjKlMnOpQrSt-_').success).toBe(true)
  })

  it('rejects the wrong length', () => {
    expect(passTokenParamSchema.safeParse('tooshort').success).toBe(false)
    expect(passTokenParamSchema.safeParse('x'.repeat(23)).success).toBe(false)
  })

  it('rejects characters outside the URL-safe base64 alphabet', () => {
    expect(passTokenParamSchema.safeParse('AbCdEfGhIjKlMnOpQrSt+/').success).toBe(false)
    expect(passTokenParamSchema.safeParse('../../etc/passwd/xxxx').success).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(passTokenParamSchema.safeParse('').success).toBe(false)
  })
})
