import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { resolvePassView } from '@/app/api/p/[passToken]/route'
import { PassScreen } from './pass-screen'

// The pass must reflect the current database state on every load — a
// prerendered page would freeze the nonce (ACC-120, docs/CURRENT-STATE.md)
// and could keep showing a since-voided pass. See docs/ARCHITECTURE.md's
// rendering table.
export const dynamic = 'force-dynamic'

// Belt and braces with the global robots block in app/layout.tsx and
// vercel.json's per-path X-Robots-Tag on /p/(.*) — a crawled pass link would
// publish a credential.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
}

export default async function PassPage({
  params,
}: {
  params: Promise<{ passToken: string }>
}) {
  const { passToken } = await params
  const result = await resolvePassView(passToken)
  // Unknown, voided and not-yet-approved tokens all get the same
  // "This pass is not valid" (app/p/[passToken]/not-found.tsx) — a
  // distinguishable response would confirm a token exists (docs/SECURITY.md).
  if (!result.ok) notFound()

  return <PassScreen pass={result.data} />
}
