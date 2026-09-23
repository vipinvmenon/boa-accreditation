// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { copyForError, ERROR_COPY } from '@/lib/error-copy'

/**
 * ACC-122 — one error-code → copy mapping shared by every desk screen that
 * used to carry its own `ERROR_COPY` object (control-room, orgs, users,
 * passes). Each screen's own wording lives in an `overrides` map passed to
 * `copyForError`, not a second copy of the whole table.
 */
describe('copyForError', () => {
  it('resolves a known code from the shared table', () => {
    expect(copyForError({ error: 'not_authenticated' })).toBe(ERROR_COPY.not_authenticated)
  })

  it('falls back to the shared internal message for an unknown code', () => {
    expect(copyForError({ error: 'something_new' })).toBe(ERROR_COPY.internal)
  })

  it('falls back to the shared internal message for a non-object body', () => {
    expect(copyForError(null)).toBe(ERROR_COPY.internal)
    expect(copyForError(undefined)).toBe(ERROR_COPY.internal)
    expect(copyForError('oops')).toBe(ERROR_COPY.internal)
  })

  it('lets a screen override wording for a code without touching the shared table', () => {
    const overrides = { not_authorized: 'Only a lead or admin can send passes.' }
    expect(copyForError({ error: 'not_authorized' }, overrides)).toBe(overrides.not_authorized)
    // The shared table itself is untouched by the override.
    expect(ERROR_COPY.not_authorized).not.toBe(overrides.not_authorized)
  })

  it('lets a screen override the fallback used for an unknown code', () => {
    const overrides = { internal: 'Sending failed. Try again, or use the one-tap links.' }
    expect(copyForError({ error: 'anything_unmapped' }, overrides)).toBe(overrides.internal)
    expect(copyForError(null, overrides)).toBe(overrides.internal)
  })

  it('prefers a screen override over the shared table for a code both define', () => {
    const overrides = { not_found: 'That org no longer exists.' }
    expect(copyForError({ error: 'not_found' }, overrides)).toBe('That org no longer exists.')
  })
})
