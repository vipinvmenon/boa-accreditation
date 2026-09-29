import { describe, expect, it } from 'vitest'
import { CHECKIN_GUIDE, dayValidityCopy, PUBLIC_PASS_DESK_LINE, PUBLIC_PASS_FINE_PRINT } from '@/lib/pass-copy'

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

// ACC-196 · the check-in guide's times, places and map links come from BOA's
// PDF (v03). The map URLs were opened in Google Maps on 29 Sep 2026; this is
// the tripwire if either is edited into something that no longer resolves.
describe('CHECKIN_GUIDE', () => {
  it('carries the PDF\'s two check-ins', () => {
    expect(CHECKIN_GUIDE.crew.day).toBe('Friday · 9 October')
    expect(CHECKIN_GUIDE.crew.hours).toBe('11:00 AM – 9:00 PM')
    expect(CHECKIN_GUIDE.guest.day).toBe('Saturday · 10 October')
    expect(CHECKIN_GUIDE.guest.hours).toBe('11:00 AM – 5:00 PM')
    expect(CHECKIN_GUIDE.steps).toHaveLength(3)
  })

  it.each([
    ['crew', 'Shri Vidya Niketan School, Essel Gardens, Bileshivale, Bengaluru'],
    ['guest', 'BITS Club, Doddagubbi Main Road, Anagalapura, Bengaluru 560077'],
  ] as const)('%s map link is a Google Maps search URL for the place', (which, query) => {
    const url = new URL(CHECKIN_GUIDE[which].mapUrl)
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/search/')
    expect(url.searchParams.get('api')).toBe('1')
    expect(url.searchParams.get('query')).toBe(query)
  })
})
