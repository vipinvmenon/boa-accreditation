import { createBrowserClient } from '@supabase/ssr'

/**
 * The browser-visible client. Holds the publishable key only — zero table
 * grants, zero function EXECUTE (supabase/tests/privileges.test.sql) — so it
 * exists purely to hold a Supabase Auth session for `/desk/*`. It cannot read
 * or write a single row.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
  )
}
