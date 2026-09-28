import type { DayValidity } from '@/lib/design'

export const PUBLIC_PASS_DESK_LINE = 'Show this at the accreditation desk.'
export const PUBLIC_PASS_FINE_PRINT = 'Bring photo ID. One person, one pass, one band.'

/**
 * Plain-words day validity with the actual dates, for /p/[passToken] — the
 * one screen a crew member reads unaccompanied, so "Build + show" alone
 * (lib/design.ts's DAY_VALIDITY, built for the desk's compact pass card)
 * is not enough on its own. The dates themselves are CLAUDE.md's "dates that
 * do not move": build 5–9 Oct, show 10 Oct 2026.
 */
export const DAY_VALIDITY_COPY: Record<DayValidity, { label: string; dates: string }> = {
  build: { label: 'Build day', dates: '5–9 Oct 2026' },
  show: { label: 'Show day', dates: '10 Oct 2026' },
  build_show: { label: 'Build + show', dates: '5–9 Oct and 10 Oct 2026' },
}

export function dayValidityCopy(dayValidity: DayValidity): { label: string; dates: string } {
  return DAY_VALIDITY_COPY[dayValidity]
}
