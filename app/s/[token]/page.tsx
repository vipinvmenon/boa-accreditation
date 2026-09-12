import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { orgViewSchema } from '@/lib/schemas/org-view'
import { SubmissionScreen } from './submission-screen'

// Quota and status must be current on every load — see docs/ARCHITECTURE.md's
// rendering table.
export const dynamic = 'force-dynamic'

/**
 * A screen never imports the Supabase client (docs/ARCHITECTURE.md, rule 1);
 * it calls its own route handler instead, same-origin, so this works
 * unmodified against whatever host is actually serving the request — the
 * production domain, a preview deployment, or `next start` under
 * test:visual's own throwaway port.
 */
async function fetchOrg(token: string) {
  const h = await headers()
  const host = h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('127.0.0.1') ? 'http' : 'https')
  const res = await fetch(`${proto}://${host}/api/s/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`org_view failed: ${res.status}`)
  const parsed = orgViewSchema.safeParse(await res.json())
  if (!parsed.success) throw new Error('org_view returned an unexpected shape')
  return parsed.data
}

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const org = await fetchOrg(token)
  // Unknown, revoked and expired tokens all get the same 404 — see
  // app/not-found.tsx and docs/SECURITY.md (a 403 would confirm a token exists).
  if (!org) notFound()

  return <SubmissionScreen token={token} initialOrg={org} />
}
