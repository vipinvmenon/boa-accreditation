import { redirect } from 'next/navigation'

/**
 * ACC-049 supersedes this screen (ACC-026b, invite-only) with
 * app/desk/users — same content plus the list and activate/deactivate
 * controls the roadmap asked for, at the path the roadmap actually names
 * (`/desk/users`). Nothing in the app links to /desk/operators (grepped
 * before this change — the only reference was this file's own header
 * comment), but the URL is kept alive as a redirect rather than a 404 in
 * case anyone has it bookmarked from the ACC-026b days.
 */
export default function OperatorsPage() {
  redirect('/desk/users')
}
