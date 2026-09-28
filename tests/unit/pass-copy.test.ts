import { describe, expect, it } from 'vitest'
import { dayValidityCopy, PUBLIC_PASS_DESK_LINE, PUBLIC_PASS_FINE_PRINT } from '@/lib/pass-copy'

describe('public pass copy', () => {
  it('uses a tier-neutral accreditation desk line', () => {
    expect(PUBLIC_PASS_DESK_LINE).toBe('Show this at the accreditation desk.')
    expect(PUBLIC_PASS_DESK_LINE.toLowerCase()).not.toContain('crew')
  })

  it('keeps the fine print to one high-contrast line', () => {
    expect(PUBLIC_PASS_FINE_PRINT).toBe('Bring photo ID. One person, one pass, one band.')
    expect(PUBLIC_PASS_FINE_PRINT.split(/\s+/).length).toBeLessThan(10)
  })
})

// ACC-144 · the plain-words day-validity copy shown on /p/[passToken].
// The dates themselves are CLAUDE.md's "dates that do not move" — this test
// is the tripwire if someone edits them without meaning to.

describe('dayValidityCopy', () => {
  it('build → Build day, 5-9 Oct 2026', () => {
    expect(dayValidityCopy('build')).toEqual({ label: 'Build day', dates: '5–9 Oct 2026' })
  })

  it('show → Show day, 10 Oct 2026', () => {
    expect(dayValidityCopy('show')).toEqual({ label: 'Show day', dates: '10 Oct 2026' })
  })

  it('build_show → Build + show, covering both ranges', () => {
    expect(dayValidityCopy('build_show')).toEqual({
      label: 'Build + show',
      dates: '5–9 Oct and 10 Oct 2026',
    })
  })
})
