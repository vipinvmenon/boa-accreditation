// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { canUseGate, OPERATOR_ROLE_COPY, operatorRoleSchema } from '@/lib/schemas/operator'

describe('operator role copy', () => {
  it('documents every role and matches the database gate-role affordance', () => {
    for (const role of operatorRoleSchema.options) {
      const copy = OPERATOR_ROLE_COPY[role]
      expect(copy.description.length).toBeGreaterThan(0)
      expect(copy.canUseGate).toBe(canUseGate(role))
    }
  })
})
