import { redirect } from 'next/navigation'

/**
 * ACC-007 originally made the root a deliberate dead end with no login link,
 * on the reasoning that a stranger hitting the bare domain should learn
 * nothing about what surfaces exist. Reversed 12 Sep 2026 on Vipin's direct
 * instruction: the root should be the desk sign-in, full stop — "if you have
 * access then you can login." A sign-in form does not reveal anything the
 * old copy didn't already say more of (it explained the whole invitation
 * model in prose); it is also the normal shape for this kind of app, and it
 * gets Vipin, Bhoopesh, and Salman straight to what they actually need
 * without a detour through marketing copy.
 *
 * Crew's /p/[passToken] link never routes through here regardless — this
 * only changes what a bare, tokenless visit to the domain shows. (The
 * vendor /s/[token] link this comment used to mention alongside it was
 * retired by ADR-019, 22 Sep.)
 */
export default function Home() {
  redirect('/desk/login')
}
