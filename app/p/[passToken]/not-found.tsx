/**
 * ACC-144 — the one response for an unknown, voided or not-yet-approved
 * pass token. Same shape as app/not-found.tsx (the equivalent for
 * /s/[token]): one message, no hint about which of the three it was — a
 * distinguishable error would confirm a token exists (docs/ARCHITECTURE.md,
 * "404, never 403"). Scoped to this route segment (not the root) because the
 * copy is pass-specific, not link-specific.
 */
export default function PassNotFound() {
  return (
    <main className="utility-auth">
      <div className="utility-inner">
        <div className="tag">Pass status</div>
        <h1 className="h1">This pass is not valid</h1>
        <p className="lede">
          It may have been mistyped, voided, or not approved yet. Ask the person who sent it to
          you for a current one, or contact the accreditation desk.
        </p>
      </div>
    </main>
  )
}
