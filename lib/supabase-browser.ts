import { createBrowserClient } from '@supabase/ssr'

/**
 * The browser-visible client. Holds the publishable key only — zero table
 * grants, zero function EXECUTE (supabase/tests/privileges.test.sql) — so it
 * exists purely to hold a Supabase Auth session for `/desk/*`. It cannot read
 * or write a single row.
 *
 * PKCE is @supabase/ssr's only flow, not a default — `createBrowserClient`
 * hardcodes `flowType: "pkce"` in its own source and silently discards any
 * `auth.flowType` passed in, so there is no client-side option here to parse
 * an implicit-flow `#access_token=...` fragment even if one wanted to. That
 * is exactly why email links (invite, recovery) verify server-side instead —
 * see app/auth/confirm/route.ts.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
  )
}
