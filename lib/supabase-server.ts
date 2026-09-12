import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side session reader, publishable key only (never the service role —
 * that stays in lib/supabase-admin.ts). Used to answer "who is signed in?"
 * from a route handler or Server Component; RLS still applies to anything
 * queried through the client this returns.
 *
 * `setAll` is wrapped in try/catch because `cookies()` is read-only in a
 * Server Component — only route handlers and Server Actions can write
 * cookies. Session refresh there is a no-op; middleware would be needed to
 * refresh a Server Component's session, which /desk/* does not need yet.
 */
export async function supabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options: CookieOptions }[]) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options)
          } catch {
            /* called from a Server Component — no-op */
          }
        },
      },
    },
  )
}
