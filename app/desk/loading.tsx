/**
 * Renders nothing, on purpose. Every /desk/* page is force-dynamic, and Next only
 * prefetches a dynamic route as far as its nearest loading boundary: with none, a nav
 * click waited for the server to render the whole page before anything moved. This is
 * that boundary, so the click commits at once and each screen shows its own loading state.
 */
export default function DeskLoading() {
  return null
}
