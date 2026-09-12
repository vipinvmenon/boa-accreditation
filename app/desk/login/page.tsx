'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'

/**
 * Not part of the approved design (design/source/boa_design_body.html has no
 * login screen — the 7 screens in scripts/visual-check.mjs's SCREENS are the
 * whole contract) — so this is a minimal, on-brand page using the design's
 * own tokens (lib/design.ts / app/globals.css), not a transcription. Not
 * gated by test:visual for the same reason.
 *
 * Two flows, one page, per docs/ARCHITECTURE.md ("Supabase email + password"):
 *
 * 1. A brand-new invite/recovery: app/auth/confirm/route.ts verifies the
 *    email link server-side and redirects here with `?flow=invite` (or
 *    `recovery`) — the session is already a cookie by the time this page's
 *    JS runs, so no client-side token parsing happens at all.
 * 2. A returning operator: the normal email + password form
 *    (`signInWithPassword`).
 *
 * Two things that were tried and were wrong, kept here so nobody repeats
 * them: (1) `user.last_sign_in_at === null` to detect a fresh invite —
 * Supabase sets it the moment the invite link establishes a session, not
 * after a password is set. (2) Parsing `#access_token=...&type=invite` from
 * the URL fragment client-side — `@supabase/ssr`'s `createBrowserClient`
 * hardcodes `flowType: "pkce"` (confirmed by reading its source), which only
 * recognises `?code=`, so the fragment was silently never parsed. Both
 * failed the same way: straight to `/desk` (404, ACC-027 not built) with no
 * error, no password ever set. See app/auth/confirm/route.ts's own comment.
 */
function DeskLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = supabaseBrowser()
  const flow = searchParams.get('flow')
  const linkError = searchParams.get('error') === 'invalid_link'

  const [mode, setMode] = useState<'checking' | 'redirecting' | 'set-password' | 'sign-in'>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    linkError ? 'That link is invalid or has expired. Ask for a new one.' : null,
  )

  useEffect(() => {
    let cancelled = false
    const isInviteOrRecovery = flow === 'invite' || flow === 'recovery'

    async function checkSession() {
      // `getSession()` only trusts the JWT in storage. A deleted or otherwise
      // invalid user can therefore look signed in forever and bounce between
      // `/desk/login` and `/desk` (the desk API correctly rejects that token).
      // Ask Auth to validate the session before redirecting.
      const { data } = await supabase.auth.getUser()
      if (cancelled) return
      const user = data.user
      if (!user) {
        setMode('sign-in')
        return
      }
      if (isInviteOrRecovery) {
        setMode('set-password')
      } else {
        setMode('redirecting')
        router.replace('/desk')
      }
    }
    void checkSession()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (signInError) {
      setError('Wrong email or password.')
      return
    }
    router.replace('/desk')
  }

  async function handleSetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError('Could not set password. Ask for a new invite link.')
      return
    }
    router.replace('/desk')
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--rule,rgba(242,239,226,0.16))',
    background: 'var(--panel,#101012)',
    color: 'var(--ink,#F2EFE2)',
    fontFamily: "'Oswald',sans-serif",
    fontSize: '16px',
    padding: '12px 14px',
    width: '100%',
    outline: 'none',
    minHeight: '44px',
  }
  const labelStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    color: 'var(--ink3,rgba(242,239,226,0.42))',
  }
  const buttonStyle: React.CSSProperties = {
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
    border: '1px solid var(--grn,#00F5A5)',
    background: 'var(--grn,#00F5A5)',
    color: 'var(--on,#0A0A0A)',
    padding: '14px 22px',
    fontFamily: "'Oswald',sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    minHeight: '48px',
    width: '100%',
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '28px 18px',
        background: 'var(--bg,#0A0A0A)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <h1
          style={{
            fontFamily: "'Anton',sans-serif",
            fontSize: 'clamp(28px, 5vw, 38px)',
            lineHeight: 0.94,
            textTransform: 'uppercase',
            color: 'var(--ink,#F2EFE2)',
            margin: '0 0 24px',
          }}
        >
          {mode === 'set-password' ? 'Set your password' : 'Desk sign in'}
        </h1>

        {mode === 'sign-in' && (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
            {error && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={busy} style={buttonStyle}>
              Sign in
            </button>
          </form>
        )}

        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--ink3,rgba(242,239,226,0.42))', margin: 0 }}>
              This is your first sign-in. Choose a password for future visits.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>New password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Confirm password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={inputStyle}
              />
            </label>
            {error && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px', margin: 0 }}>{error}</p>}
            <button type="submit" disabled={busy} style={buttonStyle}>
              Set password and continue
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

export default function DeskLoginPage() {
  return (
    <Suspense fallback={null}>
      <DeskLoginForm />
    </Suspense>
  )
}
