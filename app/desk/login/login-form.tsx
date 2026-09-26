'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { destinationAfterLogin } from '@/lib/safe-next'
import { operatorRoleSchema } from '@/lib/schemas/operator'
import { Skeleton } from '@/components/states/skeleton'

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
/**
 * ACC-128: the `checking`/`redirecting` states used to render nothing below
 * the heading — a blank card while `supabase.auth.getUser()` resolves. That
 * reads as broken, not busy. This is a skeleton of the sign-in form (the
 * mode almost everyone lands in), built from the same `Skeleton` primitive
 * and `.utility-skeleton-*` classes (app/v2.css) every other desk screen's
 * loading state already uses (components/loading-skeleton.tsx) — not a new
 * loading language, the login card's own shape drawn in placeholder bars.
 */
function LoginFormSkeleton() {
  return (
    <div className="utility-form" aria-hidden="true">
      <div className="utility-skeleton-field">
        <Skeleton width="58px" />
        <Skeleton className="utility-skeleton-input" />
      </div>
      <div className="utility-skeleton-field">
        <Skeleton width="82px" />
        <Skeleton className="utility-skeleton-input" />
      </div>
      <Skeleton className="utility-skeleton-button" />
    </div>
  )
}

function DeskLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = supabaseBrowser()
  const flow = searchParams.get('flow')
  // ACC-150: the gate sends an unauthenticated issuer here with ?next=/gate.
  const next = searchParams.get('next')
  const linkError = searchParams.get('error') === 'invalid_link'

  const [mode, setMode] = useState<'checking' | 'redirecting' | 'set-password' | 'sign-in' | 'forgot-password'>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(
    linkError ? 'That link is invalid or has expired. Ask for a new one.' : null,
  )
  const [resetSent, setResetSent] = useState(false)
  const statusAnnouncement = error
    ? `Error: ${error}`
    : busy
      ? mode === 'forgot-password'
        ? 'Sending password reset link.'
        : mode === 'set-password'
          ? 'Setting password.'
          : 'Signing in.'
      : mode === 'checking'
        ? 'Checking your session.'
        : mode === 'redirecting'
          ? 'Session confirmed. Redirecting.'
          : resetSent
            ? 'If the email has desk access, a reset link is on its way.'
            : ''

  /**
   * Where this person belongs after signing in: back where they were sent
   * from (`?next=`, allowlisted in lib/safe-next.ts), else the gate for an
   * issuer and the desk for everyone else. The role is read from the
   * caller's own boa_acc_operator row, which RLS always shows them
   * (boa_acc_operator_read). A failed read just means "the desk".
   */
  const destination = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('boa_acc_operator')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    const role = operatorRoleSchema.safeParse(data?.role)
    return destinationAfterLogin(next, role.success ? role.data : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next])

  useEffect(() => {
    let cancelled = false
    const isInviteOrRecovery = flow === 'invite' || flow === 'recovery'

    async function checkSession() {
      try {
        // `getSession()` only trusts the JWT in storage. A deleted or
        // otherwise invalid user can therefore look signed in forever and
        // bounce between `/desk/login` and `/desk` (the desk API correctly
        // rejects that token). Ask Auth to validate the session before
        // redirecting.
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
          router.replace(await destination(user.id))
        }
      } catch {
        // Never leave `checking` forever: a thrown session check is a
        // sign-in form with an error, not an indefinite spinner.
        if (!cancelled) {
          setMode('sign-in')
          setError('Could not check your session. Sign in below.')
        }
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
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError || !data.user) {
        setError('Wrong email or password.')
        return
      }
      router.replace(await destination(data.user.id))
    } catch {
      setError('Could not reach the sign-in server. Try again.')
    } finally {
      setBusy(false)
    }
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
    try {
      const { data, error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError || !data.user) {
        setError('Could not set password. Ask for a new invite link.')
        return
      }
      router.replace(await destination(data.user.id))
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      // Deliberately does not distinguish "no such account" from "sent" — the
      // same reasoning as docs/SECURITY.md's "404, never 403": telling an
      // unknown caller whether an email has desk access would let them
      // enumerate who has it.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/desk/login${next ? `?next=${encodeURIComponent(next)}` : ''}`,
      })
      if (resetError) {
        setError('Could not send a reset link. Try again shortly.')
        return
      }
      setResetSent(true)
    } catch {
      setError('Could not reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="utility-auth">
      <div className="utility-inner">
        {!error && (
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusAnnouncement}</div>
        )}
        <div className="auth-brand">
          <img src="/assets/boa-logo.png" alt="Bangalore Open Air" />
          <span>Accred<br />desk</span>
        </div>
        <div className="tag">BOA accreditation</div>
        <h1 className="h1">
          {mode === 'set-password' ? 'Set your password' : mode === 'forgot-password' ? 'Reset your password' : next?.startsWith('/gate') ? <><span style={{ whiteSpace: 'nowrap' }}>Check-in</span> sign in</> : 'Desk sign in'}
        </h1>

        {(mode === 'checking' || mode === 'redirecting') && <LoginFormSkeleton />}

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
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="utility-input"
              />
              <small className="utility-hint">Minimum 8 characters.</small>
              <button
                type="button"
                className="linkbtn hov-text-grn"
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
                style={{ minHeight: '44px', justifySelf: 'start' }}
              >
                {showPassword ? 'Hide password' : 'Show password'}
              </button>
            </label>
            {error && <p role="alert" className="utility-error">{error}</p>}
            <button type="submit" disabled={busy} className="btn go wide hov-invert-grn">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null)
                setResetSent(false)
                setMode('forgot-password')
              }}
              className="linkbtn hov-text-grn"
              style={{ minHeight: '44px' }}
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
                  {busy ? 'Sending…' : 'Send reset link'}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setError(null)
                setMode('sign-in')
              }}
              className="linkbtn hov-text-grn"
              style={{ minHeight: '44px' }}
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
              {busy ? 'Setting password…' : 'Set password and continue'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

/** Rendered by page.tsx, which is per-request so the CSP nonce reaches these scripts. */
export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <DeskLoginForm />
    </Suspense>
  )
}
