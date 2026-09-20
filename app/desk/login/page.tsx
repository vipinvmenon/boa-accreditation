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

  const [mode, setMode] = useState<'checking' | 'redirecting' | 'set-password' | 'sign-in' | 'forgot-password'>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    linkError ? 'That link is invalid or has expired. Ask for a new one.' : null,
  )
  const [resetSent, setResetSent] = useState(false)

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

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    // Deliberately does not distinguish "no such account" from "sent" —
    // the same reason app/api/s/[token] answers a bad token with 404 rather
    // than a 403 (docs/SECURITY.md, "404, never 403"): telling an unknown
    // caller whether an email has desk access would let them enumerate who
    // has it.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/desk/login`,
    })
    setBusy(false)
    if (resetError) {
      setError('Could not send a reset link. Try again shortly.')
      return
    }
    setResetSent(true)
  }

  return (
    <main className="utility-auth">
      <div className="utility-inner">
        <div className="tag">BOA accreditation</div>
        <h1 className="h1">
          {mode === 'set-password' ? 'Set your password' : mode === 'forgot-password' ? 'Reset your password' : 'Desk sign in'}
        </h1>

        {mode === 'sign-in' && (
          <form onSubmit={handleSignIn} className="utility-form">
            <label className="utility-label">
              <span>Email</span>
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="utility-input"
              />
            </label>
            <label className="utility-label">
              <span>Password</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="utility-input"
              />
            </label>
            {error && <p role="alert" className="utility-error">{error}</p>}
            <button type="submit" disabled={busy} className="btn go wide hov-invert-grn">
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setResetSent(false)
                setMode('forgot-password')
              }}
              className="hov-text-grn"
            >
              Forgot password?
            </button>
          </form>
        )}

        {mode === 'forgot-password' && (
          <form onSubmit={(e) => void handleForgotPassword(e)} className="utility-form">
            {resetSent ? (
              <p className="lede">
                If that email has desk access, a reset link is on its way. Check your inbox.
              </p>
            ) : (
              <>
                <p className="utility-copy">
                  Enter the email you were invited with. We&apos;ll send a link to set a new password.
                </p>
                <label className="utility-label">
                  <span>Email</span>
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="utility-input"
                  />
                </label>
                {error && <p role="alert" className="utility-error">{error}</p>}
                <button type="submit" disabled={busy} className="btn go wide hov-invert-grn">
                  Send reset link
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null)
                setMode('sign-in')
              }}
              className="hov-text-grn"
            >
              Back to sign in
            </button>
          </form>
        )}

        {mode === 'set-password' && (
          <form onSubmit={handleSetPassword} className="utility-form">
            <p className="utility-copy">
              This is your first sign-in. Choose a password for future visits.
            </p>
            <label className="utility-label">
              <span>New password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="utility-input"
              />
            </label>
            <label className="utility-label">
              <span>Confirm password</span>
              <input
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="utility-input"
              />
            </label>
            {error && <p role="alert" className="utility-error">{error}</p>}
            <button type="submit" disabled={busy} className="btn go wide hov-invert-grn">
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
