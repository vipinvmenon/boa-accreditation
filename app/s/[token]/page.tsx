import { notFound } from 'next/navigation'
import { resolveOrgView } from '@/app/api/s/[token]/route'
import { SubmissionScreen } from './submission-screen'

// Quota and status must be current on every load — see docs/ARCHITECTURE.md's
// rendering table.
export const dynamic = 'force-dynamic'

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await resolveOrgView(token)
  // Unknown, revoked and expired tokens all get the same 404 — see
  // app/not-found.tsx and docs/SECURITY.md (a 403 would confirm a token exists).
  if (!result.ok) notFound()

  return <SubmissionScreen token={token} initialOrg={result.data.org} initialRoster={result.data.roster} />
}
