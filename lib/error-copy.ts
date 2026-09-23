/**
 * ACC-122: one place for the API error-code → operator copy mapping that
 * used to be a near-identical `ERROR_COPY` object copied into
 * control-room-screen.tsx, orgs-screen.tsx, users-screen.tsx and (as
 * `SEND_ERROR_COPY`) passes-screen.tsx.
 *
 * This is consolidation, not a rewrite: every message below is the wording
 * that was already shipping somewhere. Where two screens used different
 * words for the same code (e.g. `not_authorized` reads differently on the
 * Control room than on Orgs, because the two screens gate different
 * actions), the default here keeps one of them and the other screen passes
 * an `overrides` map to `copyForError` to keep its own wording — nobody's
 * copy silently changed.
 */
export const ERROR_COPY = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_authorized: 'You are not allowed to do that.',
  internal: "That didn't go through. Try again.",
  invalid_body: 'Check the form — something did not match the required shape.',
  not_found: 'That no longer exists.',
  rate_limited: 'Too many attempts recently. Try again shortly.',
  duplicate_name: 'An org with that name already exists.',
  forbidden: 'You do not have permission to do that.',
  invite_failed: 'Could not send the invitation.',
  cannot_deactivate_self: 'You cannot deactivate your own account.',
  cannot_deactivate_last_admin: 'At least one active admin must remain.',
  whatsapp_not_configured: 'WhatsApp is not configured yet. Use the one-tap links.',
} as const satisfies Record<string, string>

export type ErrorCode = keyof typeof ERROR_COPY

/**
 * Resolves a JSON error body (`{ error: "<code>" }`, the shape every
 * app/api/desk/** route returns on failure) to operator-facing copy.
 * `overrides` lets one screen's wording differ from the shared default
 * without another copy of the whole table — pass only the codes that screen
 * says differently.
 */
export function copyForError(body: unknown, overrides: Partial<Record<string, string>> = {}): string {
  const fallback = overrides['internal'] ?? ERROR_COPY.internal
  if (body && typeof body === 'object' && 'error' in body) {
    const code = String((body as { error: unknown }).error)
    return overrides[code] ?? ERROR_COPY[code as ErrorCode] ?? fallback
  }
  return fallback
}
