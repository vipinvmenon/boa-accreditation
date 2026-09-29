'use client'

import { Suspense, useCallback, useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { destinationAfterLogin } from '@/lib/safe-next'
import { operatorRoleSchema } from '@/lib/schemas/operator'
import { Button, Field, Skeleton, SkeletonText } from '@/components/r10'
import { Icon } from '@/components/icon'
import { useDomTheme } from '@/lib/use-theme'
import styles from './login.module.css'

/**
 * Not part of the approved design (design/source/boa_design_body.html has no
 * login screen — the 7 screens in scripts/visual-check.mjs's SCREENS are the
 * whole contract) — so this page is built from the design's own primitives
 * (tokens, `.h1`, `.btn.go`, `.linkbtn`, `.utility-input`), not transcribed.
 * Not gated by test:visual for the same reason.
 *
 * ACC-176 (ADR-026; round 4 of design/proposals, chosen by Vipin 28 Sep):
 * the festival poster is the page and nothing is written on it; the form
 * sits on a solid panel to its right (on a phone, a sheet rising over the
 * poster's lower half, so the figure's face stays in view). One heading, one
 * sentence saying who this is for, the form, and a help line. It replaced a
 * floating card with a pill tag and a micro-wordmark that read as a generic
 * admin template — the audit's UX-06/UX-07.
 *
 * ACC-188 (Vipin, 29 Sep): reskinned onto r10. The layout is
 * design/source/r10/r8-cold.html's (ADR-026's, unchanged); the form is the
 * desk's r10 primitives (Field, Button, .error), and the poster is the new
 * 2400px artwork. Styles: ./login.module.css.
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
 * the heading, a blank card while `supabase.auth.getUser()` resolves. That
 * reads as broken, not busy. This is the sign-in form (the mode almost
 * everyone lands in) with skeleton values: the same labels, pill fields and
 * button at their real sizes, so nothing moves when the form arrives.
 */
function LoginFormSkeleton() {
  return (
    <div className={styles['form']} aria-hidden="true">
      <div className={styles['skField']}>
        <span className="body-sm"><SkeletonText w="5ch" /></span>
        <Skeleton shape="btn" style={{ '--sk-w': '100%' } as CSSProperties} />
      </div>
      <div className={styles['skField']}>
        <span className="body-sm"><SkeletonText w="8ch" /></span>
        <Skeleton shape="btn" style={{ '--sk-w': '100%' } as CSSProperties} />
      </div>
      <Skeleton shape="btn" className="btn-block" style={{ '--sk-w': '100%' } as CSSProperties} />
    </div>
  )
}

/**
 * A password input with its show/hide toggle inside the pill (Vipin, 29 Sep).
 * The toggle's name is visually hidden text, not an aria-label, so the input
 * stays the only thing labelled "Password" (tests/e2e/login-return-path.spec.ts
 * finds it with getByLabel('Password')).
 */
function PasswordField({ id, label, value, onChange, autoComplete, hint }: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  hint?: string
}) {
  const [visible, setVisible] = useState(false)
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      <label htmlFor={id} className={styles['pwLabel']}>{label}</label>
      <div className={styles['pw']}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input"
          aria-describedby={hintId}
        />
        <button
          type="button"
          className={styles['eye']}
          aria-pressed={visible}
          aria-controls={id}
          onClick={() => setVisible((shown) => !shown)}
        >
          {/* The icon shows the field's state: crossed out while hidden (Vipin). */}
          <Icon name={visible ? 'eye' : 'eye-slash'} />
          <span className="sr-only">{visible ? 'Hide password' : 'Show password'}</span>
        </button>
      </div>
      {hint && <span id={hintId} className="hint">{hint}</span>}
    </div>
  )
}

function FormError({ children }: { children: string }) {
  return (
    <p role="alert" className={`error ${styles['alert']}`}>
      <Icon name="warning-circle" />
      {children}
    </p>
  )
}

function DeskLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = supabaseBrowser()
  // UX-10: this screen has its own colours (var(--bg), var(--logo-filter), …)
  // that already cascade from <html data-theme>, but nothing here read the
  // DOM back — so a theme flipped in desk/gate chrome (app/desk/desk-chrome.tsx,
  // app/gate/gate-chrome.tsx) via document.documentElement.setAttribute and
  // carried here by a client-side `router.replace('/desk/login')` had no
  // local confirmation, and a stale render could silently disagree with the
  // attribute. Read the same source the chrome reads, don't track a second one.
  const theme = useDomTheme()
  const flow = searchParams.get('flow')
  // ACC-150: the gate sends an unauthenticated issuer here with ?next=/gate.
  const next = searchParams.get('next')
  const linkError = searchParams.get('error') === 'invalid_link'
  const forGate = next?.startsWith('/gate') ?? false
  const emailId = useId()
  const passwordId = useId()

  const [mode, setMode] = useState<'checking' | 'redirecting' | 'set-password' | 'sign-in' | 'forgot-password'>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    // The forms are noValidate: every message, including "you left it
    // blank", arrives in the same role="alert" line, not a browser tooltip.
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
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
    if (!email.trim()) {
      setError('Enter the email you were invited with.')
      return
    }
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

  const heading =
    mode === 'set-password'
      ? flow === 'recovery' ? 'Choose a new password' : 'Set your password'
      : mode === 'forgot-password'
        ? 'Reset your password'
        : forGate
          ? 'Gate sign in'
          : 'Sign in'

  return (
    <main className={`r10 ${styles['auth']}`} data-theme={theme}>
      <div className={styles['art']} role="img" aria-label="The Bangalore Open Air 2026 poster" />
      <section className={styles['card']}>
        <img className={styles['logo']} src="/assets/boa-logo.png" alt="Bangalore Open Air" />
        <div className={styles['inner']}>
          {!error && (
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{statusAnnouncement}</div>
          )}
          <h1 className="display-xl">{heading}</h1>
          {(mode === 'sign-in' || mode === 'checking' || mode === 'redirecting') && (
            <p className="lede">
              {forGate
                ? 'Sign in while you have signal. The gate keeps working offline after that.'
                : 'Staff access to BOA accreditation. Crew and partners don\u2019t sign in here. Your pass comes to you on WhatsApp.'}
            </p>
          )}

          {(mode === 'checking' || mode === 'redirecting') && <LoginFormSkeleton />}

          {mode === 'sign-in' && (
            <form onSubmit={handleSignIn} className={styles['form']} noValidate>
              <Field
                id={emailId}
                label="Email"
                type="email"
                autoComplete="username"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <PasswordField id={passwordId} label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
              {error && <FormError>{error}</FormError>}
              <Button variant="primary" type="submit" disabled={busy} className="btn-block" icon={busy ? undefined : <Icon name="arrow-right" />}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setResetSent(false)
                  setMode('forgot-password')
                }}
                className={`btn-link ${styles['back']}`}
              >
                Forgot password?
              </button>
            </form>
          )}

          {mode === 'forgot-password' && (
            <form onSubmit={(e) => void handleForgotPassword(e)} className={styles['form']} noValidate>
              {resetSent ? (
                <p className={styles['note']} role="status">
                  <Icon name="check" />
                  If that email has desk access, a reset link is on its way. Check your inbox.
                </p>
              ) : (
                <>
                  <p className="lede" style={{ margin: 0 }}>
                    Enter the email you were invited with. We&apos;ll send a link to set a new password.
                  </p>
                  <Field
                    label="Email"
                    type="email"
                    autoComplete="username"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  {error && <FormError>{error}</FormError>}
                  <Button variant="primary" type="submit" disabled={busy} className="btn-block" icon={busy ? undefined : <Icon name="paper-plane-tilt" />}>
                    {busy ? 'Sending…' : 'Send reset link'}
                  </Button>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setMode('sign-in')
                }}
                className={`btn-link ${styles['back']}`}
              >
                <Icon name="caret-left" />
                Back to sign in
              </button>
            </form>
          )}

          {mode === 'set-password' && (
            <form onSubmit={handleSetPassword} className={styles['form']} noValidate>
              <p className="lede" style={{ margin: 0 }}>
                {flow === 'recovery'
                  ? 'Choose a new password for your desk account.'
                  : 'This is your first sign-in. Choose a password for future visits.'}
              </p>
              <PasswordField id={`${passwordId}-new`} label="New password" autoComplete="new-password" value={password} onChange={setPassword} hint="Minimum 8 characters." />
              <PasswordField id={`${passwordId}-confirm`} label="Confirm password" autoComplete="new-password" value={confirmPassword} onChange={setConfirmPassword} />
              {error && <FormError>{error}</FormError>}
              <Button variant="primary" type="submit" disabled={busy} className="btn-block" icon={busy ? undefined : <Icon name="arrow-right" />}>
                {busy ? 'Setting password…' : 'Set password and continue'}
              </Button>
            </form>
          )}
        </div>
        {/* ACC-173 decides the desk's help number; until then this is plain text, not a dead link. */}
        <p className={`body-sm ink-3 ${styles['info']}`}>
          <span>Trouble signing in? Contact the accreditation desk.</span>
          <span>© Bangalore Open Air</span>
        </p>
      </section>
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
