'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { logoFilterFor } from '@/lib/design'
import './login.css'

/**
 * Not part of the approved design (design/source/boa_design_body.html has no
 * login screen — the 7 screens in scripts/visual-check.mjs's SCREENS are the
 * whole contract) — so this recomposes the Control room hero (poster +
 * scrim), the desk chrome logo lock-up and the design's own tokens
 * (lib/design.ts / app/globals.css) in ./login.css, not a transcription. Not
 * gated by test:visual for the same reason (ACC-108).
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

  const labelStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '9.5px',
    fontWeight: 700,
    letterSpacing: '0.13em',
    textTransform: 'uppercase',
    color: 'var(--ink3,rgba(242,239,226,0.42))',
  }
  const buttonStyle: React.CSSProperties = {
    cursor: busy ? 'progress' : 'pointer',
    opacity: busy ? 0.7 : 1,
    border: '1px solid var(--grn,#00F5A5)',
    background: 'var(--grn,#00F5A5)',
    color: 'var(--on,#0A0A0A)',
    padding: '14px 22px',
    fontFamily: "'Oswald',sans-serif",
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    minHeight: '50px',
    width: '100%',
    marginTop: '6px',
  }
  const linkButtonStyle: React.CSSProperties = {
    cursor: 'pointer',
    border: 0,
    background: 'transparent',
    color: 'var(--ink3,rgba(242,239,226,0.42))',
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '6px 0',
    textAlign: 'left',
    alignSelf: 'flex-start',
  }
  const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '7px' }

  const copy = {
    checking: { eyebrow: 'Operator access', title: 'Desk sign in', lede: 'Checking for an existing session…' },
    redirecting: { eyebrow: 'Operator access', title: 'Opening the desk', lede: 'You are already signed in.' },
    'sign-in': {
      eyebrow: 'Operator access',
      title: 'Desk sign in',
      lede: 'Invite only. Use the email address your invitation was sent to.',
    },
    'forgot-password': {
      eyebrow: 'Password reset',
      title: 'Reset your password',
      lede: 'Enter the email you were invited with and we will send a link to set a new password.',
    },
    'set-password': {
      eyebrow: 'First sign-in',
      title: 'Set your password',
      lede: 'Choose a password of at least 8 characters. You will use it with this email from now on.',
    },
  }[mode]

  const errorLine = error && (
    <p role="alert" className="l-error">
      {error}
    </p>
  )

  return (
    <main className="l-shell">
      <div className="l-art" aria-hidden="true">
        <div className="l-art-img" />
        <div className="l-art-scrim" />
      </div>

      <section className="l-panel" aria-labelledby="login-title">
        <div className="l-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- same logo element as app/desk/desk-chrome.tsx */}
          <img
            src="/assets/boa-logo.png"
            alt="Bangalore Open Air"
            style={{ height: '44px', width: 'auto', display: 'block', filter: logoFilterFor('dark') }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.16em',
              lineHeight: 1.2,
              textTransform: 'uppercase',
              color: 'var(--ink3,rgba(242,239,226,0.42))',
            }}
          >
            Accred
            <br />
            desk
          </span>
        </div>

        <div className="l-body l-enter" key={mode}>
          <p className="l-eyebrow">{copy.eyebrow}</p>
          <h1 id="login-title" className="l-title">
            {copy.title}
          </h1>
          <p className="l-lede" aria-live="polite">
            {mode === 'forgot-password' && resetSent
              ? 'If that email has desk access, a reset link is on its way. Check your inbox.'
              : copy.lede}
          </p>

          {(mode === 'checking' || mode === 'redirecting') && (
            <div className="l-form" aria-hidden="true">
              <span className="l-skel" style={{ height: '9px', width: '44px', border: 0 }} />
              <span className="l-skel" style={{ height: '48px' }} />
              <span className="l-skel" style={{ height: '9px', width: '64px', border: 0 }} />
              <span className="l-skel" style={{ height: '48px' }} />
              <span className="l-skel" style={{ height: '50px', marginTop: '6px' }} />
            </div>
          )}

          {mode === 'sign-in' && (
            <form onSubmit={handleSignIn} className="l-form">
              <label style={fieldStyle}>
                <span style={labelStyle}>Email</span>
                <input
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="l-input"
                />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Password</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="l-input"
                />
              </label>
              {errorLine}
              <button type="submit" disabled={busy} style={buttonStyle} className="hov-invert-grn l-submit">
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setResetSent(false)
                  setMode('forgot-password')
                }}
                className="hov-text-grn"
                style={linkButtonStyle}
              >
                Forgot password?
              </button>
            </form>
          )}

          {mode === 'forgot-password' && (
            <form onSubmit={(e) => void handleForgotPassword(e)} className="l-form">
              {!resetSent && (
                <>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Email</span>
                    <input
                      type="email"
                      required
                      autoComplete="username"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="l-input"
                    />
                  </label>
                  {errorLine}
                  <button type="submit" disabled={busy} style={buttonStyle} className="hov-invert-grn l-submit">
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
                className="hov-text-grn"
                style={linkButtonStyle}
              >
                ← Back to sign in
              </button>
            </form>
          )}

          {mode === 'set-password' && (
            <form onSubmit={handleSetPassword} className="l-form">
              <label style={fieldStyle}>
                <span style={labelStyle}>New password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="l-input"
                />
              </label>
              <label style={fieldStyle}>
                <span style={labelStyle}>Confirm password</span>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="l-input"
                />
              </label>
              {errorLine}
              <button type="submit" disabled={busy} style={buttonStyle} className="hov-invert-grn l-submit">
                {busy ? 'Saving…' : 'Set password and continue'}
              </button>
            </form>
          )}
        </div>

        <footer className="l-meta">
          <span>
            <b>Bangalore Open Air</b> 2026
          </span>
          <span>Gate live · Sun 4 Oct</span>
          <span>Show · Sat 10 Oct</span>
        </footer>
      </section>
    </main>
  )
}

export function LoginForm() {
  return (
    <Suspense fallback={null}>
      <DeskLoginForm />
    </Suspense>
  )
}
