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

/**
 * ACC-196 — the check-in guide under the ticket on /p/[passToken]. The words
 * are BOA's own, from BOA26_Crew-Guest-CheckIn_Info_A4_v03.pdf; the pass is
 * the voucher, so step 1 says "this pass". Both check-ins are shown to
 * everyone (a pass does not say whether its holder is crew or a guest).
 *
 * The map links are Google Maps search URLs (api=1), checked on 29 Sep 2026:
 * the school link opens Google's own listing for the school, whose Plus Code
 * is the 3M7C+G52 in BOA's PDF; the club link opens the "Bits Club" listing.
 */
export const CHECKIN_GUIDE = {
  eyebrow: 'Bangalore Open Air 2026 · 14th edition',
  heading: 'How to get your access',
  steps: [
    { icon: 'device-mobile', lead: 'Bring this pass', rest: 'to your check-in. On your phone is fine.' },
    {
      icon: 'identification-card',
      lead: 'Bring a valid photo ID:',
      rest: 'Aadhaar, driving licence, passport or voter ID, so we can confirm it is you.',
    },
    {
      icon: 'watch',
      lead: 'Collect your band',
      rest: 'at the desk. Wear it where it can be seen, everywhere on site. It is personal: do not lend it.',
    },
  ],
  crew: {
    label: 'Crew',
    heading: 'Crew check-in',
    day: 'Friday · 9 October',
    hours: '11:00 AM – 9:00 PM',
    warning: 'No crew check-in on Saturday 10 October.',
    place: 'Shri Vidya Niketan School',
    address: ['Essel Gardens, Bileshivale', 'Bengaluru, Karnataka 560077'],
    notes: [{ icon: 'map-pin', text: 'Plus Code 3M7C+G52: type it into Google Maps to find the gate.' }],
    mapUrl:
      'https://www.google.com/maps/search/?api=1&query=Shri+Vidya+Niketan+School%2C+Essel+Gardens%2C+Bileshivale%2C+Bengaluru',
  },
  guest: {
    label: 'Guests',
    heading: 'Guest check-in',
    day: 'Saturday · 10 October',
    hours: '11:00 AM – 5:00 PM',
    place: 'At the festival venue: BITS Club',
    address: ['Doddagubbi Main Road, Anagalapura', 'near Asha Township, Bengaluru 560077'],
    notes: [
      { icon: 'car', text: 'Parking is at Shri Vidya Niketan School.' },
      { icon: 'door-open', text: 'Doors 1:30 PM.' },
    ],
    mapUrl:
      'https://www.google.com/maps/search/?api=1&query=BITS+Club%2C+Doddagubbi+Main+Road%2C+Anagalapura%2C+Bengaluru+560077',
  },
  signOff: 'See you at the Home Of Heavy metal In India!',
  help: 'Questions? Contact Bhupesh',
  // Bhupesh (production), given by Vipin 30 Sep 2026.
  helpPhone: '+91 70103 90385' as string,
  cue: 'Check-in guide',
  mapsCta: 'Open in Maps',
} as const

export const CHECKIN_GUIDE_ID = 'checkin-guide'
