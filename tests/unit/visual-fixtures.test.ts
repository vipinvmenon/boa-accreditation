import { describe, expect, it } from 'vitest'
import { QR_DARK, QR_LIGHT, QR_SCHEME } from '@/lib/design'
// @ts-expect-error -- plain .mjs shared with scripts/visual-check.mjs; allowJs is off
import * as desk from '../../scripts/visual-fixtures/desk.mjs'

/**
 * The visual harness serves these payloads through /api/desk/*. If a fixture
 * drifts from the API contract, the screen would render an error state and
 * the pixel diff would report "design mismatch" for the wrong reason — so the
 * contract is checked here, on every commit, with the screens' own schemas.
 */
describe('visual desk fixtures', () => {
  it('parse with the same Zod schemas the desk screens use', async () => {
    await expect(desk.validateDeskFixtures()).resolves.toBeUndefined()
  })

  it('carry the same QR constants as lib/design.ts', () => {
    expect({ QR_SCHEME: desk.QR_SCHEME, QR_DARK: desk.QR_DARK, QR_LIGHT: desk.QR_LIGHT }).toEqual({ QR_SCHEME, QR_DARK, QR_LIGHT })
  })

  it('every hardcoding sentinel really is fixture data', async () => {
    const all = JSON.stringify([desk.dashboard, desk.queue, desk.master, await desk.passesFor('web')])
    for (const sentinel of desk.FIXTURE_SENTINELS as string[]) expect(all).toContain(sentinel)
  })

  it('mobile passes carry the full approved sheet', async () => {
    const { passes } = await desk.passesFor('mob')
    expect(passes).toHaveLength(6)
  })
})
