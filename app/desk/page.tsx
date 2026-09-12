import { redirect } from 'next/navigation'

// /desk itself has no screen of its own yet — the Control room (ACC-033) has
// a real pixel contract in design/source/ that nobody has built against yet,
// so this is a redirect, not a placeholder page. /desk/orgs (ACC-027) is the
// first real /desk/* screen.
export default function DeskIndexPage() {
  redirect('/desk/orgs')
}
