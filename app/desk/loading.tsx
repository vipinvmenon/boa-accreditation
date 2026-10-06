import { Skeleton } from '@/components/r10/primitives-b'

/**
 * Shown in the page area the instant a desk link is clicked, until the next
 * screen's server response lands. Every /desk/* page is force-dynamic (the nonce
 * CSP is per request), so without this the old screen stayed up while the nav
 * highlight had already moved, and it read as a stuck nav (Vipin, 6 Oct).
 * It sits inside DeskShell, so the nav and footer are not touched. Generic on
 * purpose: it does not know which screen is coming.
 */
export default function DeskLoading() {
  return (
    <div role="status" aria-busy="true" aria-live="polite" style={{ display: 'grid', gap: 'var(--s-6)', paddingBlock: 'var(--s-8)' }}>
      <span className="sr-only">Loading</span>
      <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
        <Skeleton shape="line" style={{ width: 'min(320px, 60%)', height: 36 }} />
        <Skeleton shape="line" style={{ width: 'min(480px, 90%)' }} />
      </div>
      <div style={{ display: 'grid', gap: 'var(--s-3)', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <Skeleton shape="line" style={{ height: 96 }} />
        <Skeleton shape="line" style={{ height: 96 }} />
        <Skeleton shape="line" style={{ height: 96 }} />
      </div>
      <Skeleton shape="line" style={{ height: 240 }} />
    </div>
  )
}
