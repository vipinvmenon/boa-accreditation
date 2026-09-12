'use client'

import { useState } from 'react'
import { DeskChrome } from '../desk-chrome'
import { supabaseBrowser } from '@/lib/supabase-browser'
import { operatorRoleSchema, type InviteOperatorInput } from '@/lib/schemas/operator'

/**
 * Not part of the approved design — design/source/boa_design_body.html has no
 * operator-management screen, same reason /desk/login isn't transcribed. This
 * is the missing half of ACC-026: `/api/admin/invite-operator` has existed
 * since ACC-026, but nothing in the app ever called it — inviting an operator
 * meant constructing a `curl` by hand. ACC-026b.
 *
 * Reuses `DeskChrome` for the header (session guard included, so a signed-out
 * visitor is redirected to /desk/login same as every other desk screen), but
 * this route is not one of the 7 in scripts/visual-check.mjs's SCREENS, so it
 * is not gated by test:visual and DeskChrome's own markup is untouched — this
 * page only adds content below the header, exactly like /desk/login adds a
 * whole separate page rather than editing an existing gated one.
 *
 * Not linked from anywhere in the design's own nav (that nav is the design's
 * literal 7-screen list, non-negotiable 1) — reached directly at
 * /desk/operators, same as /desk/login itself has no link pointing to it
 * either.
 *
 * Authorisation is enforced by the API, not this form: only an active
 * lead/admin operator can actually invite (app/api/admin/invite-operator/
 * route.ts). An approver can load this page and submit it, and will see the
 * server's "forbidden" back — the form does not pre-filter by role because
 * this page has no way to know the caller's own role without a new
 * "who am I" endpoint, and the client-side check would only be a usability
 * affordance regardless (non-negotiable 3).
 */
const ROLE_LABEL: Record<InviteOperatorInput['role'], string> = {
  lead: 'Lead',
  approver: 'Approver',
  admin: 'Admin',
}

export default function OperatorsPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InviteOperatorInput['role']>('approver')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    try {
      const supabase = supabaseBrowser()
      const { data } = await supabase.auth.getSession()
      const accessToken = data.session?.access_token
      if (!accessToken) {
        setMessage({ kind: 'error', text: 'Your session has expired. Sign in again.' })
        return
      }
      const response = await fetch('/api/admin/invite-operator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email, displayName, role }),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        const reason =
          body?.error === 'forbidden'
            ? 'Only a lead or admin operator can invite.'
            : body?.error === 'rate_limited'
              ? 'Too many invites sent recently. Try again shortly.'
              : body?.error === 'invalid_body'
                ? 'Check the name, email and role.'
                : 'Could not send the invitation.'
        setMessage({ kind: 'error', text: reason })
        return
      }
      setMessage({ kind: 'ok', text: `Invitation sent to ${email}. They will set a password from the email link.` })
      setDisplayName('')
      setEmail('')
      setRole('approver')
    } finally {
      setBusy(false)
    }
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

  return (
    <DeskChrome>
      <main style={{ padding: '40px 18px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <h1
            style={{
              fontFamily: "'Anton',sans-serif",
              fontSize: 'clamp(28px, 5vw, 38px)',
              lineHeight: 0.94,
              textTransform: 'uppercase',
              color: 'var(--ink,#F2EFE2)',
              margin: '0 0 8px',
            }}
          >
            Invite an operator
          </h1>
          <p style={{ fontSize: '13.5px', color: 'var(--ink3,rgba(242,239,226,0.42))', margin: '0 0 24px' }}>
            They get an email with a link to set their own password, then sign in at /desk/login.
          </p>
          <form onSubmit={(e) => void handleInvite(e)} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Full name</span>
              <input
                required
                minLength={2}
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={inputStyle}
                placeholder="Ranjith Kumar"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                placeholder="ranjith@example.com"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Role</span>
              <select
                value={role}
                onChange={(e) => setRole(operatorRoleSchema.parse(e.target.value))}
                style={inputStyle}
              >
                {operatorRoleSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            {message && (
              <p
                role="status"
                style={{
                  color: message.kind === 'error' ? 'var(--bad,#FF6B5A)' : 'var(--grn,#00F5A5)',
                  fontSize: '13px',
                  margin: 0,
                }}
              >
                {message.text}
              </p>
            )}
            <button
              type="submit"
              disabled={busy}
              style={{
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
              }}
              className="hov-invert-grn"
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </form>
        </div>
      </main>
    </DeskChrome>
  )
}
