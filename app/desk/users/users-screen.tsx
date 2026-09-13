'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { operatorRoleSchema, type InviteOperatorInput, type OperatorRow } from '@/lib/schemas/operator'

/**
 * Not part of the approved design — design/source/boa_design_body.html has no
 * operator-management screen, same reason /desk/login isn't transcribed.
 * ACC-049 supersedes app/desk/operators/page.tsx (ACC-026b, invite-only):
 * that page now redirects here. The roadmap names this path literally
 * (`/desk/users`) and ACC-04B's coming profile menu links to a "Manage
 * users" entry, so this is the page that entry will point at rather than
 * the old /desk/operators.
 *
 * Per docs/ARCHITECTURE.md rule 1, this screen never imports the Supabase
 * client — every read and write goes through app/api/desk/operators/** and
 * the pre-existing app/api/admin/invite-operator (all cookie-session, via
 * lib/supabase-server.ts; the service-role client is never involved here).
 * app/desk/operators/page.tsx's earlier version manually attached a bearer
 * token from supabase.auth.getSession() — unnecessary, since every one of
 * these routes reads the session from cookies, not the Authorization
 * header, and it was the one place in the desk app importing the Supabase
 * client directly. Dropped here.
 *
 * Authorisation is enforced by the database, not this screen (non-negotiable
 * #3): boa_acc_set_operator_active checks lead/admin, self-deactivation and
 * the last-admin guard inside the function body. An approver can load this
 * page — RLS lets them see only their own row in the list (boa_acc_operator's
 * own read policy, 202609110002) — and any activate/deactivate attempt comes
 * back "not authorized" from the server. The self-deactivation disablement
 * below is a usability affordance only; the real guard is the database CHECK
 * inside the RPC.
 */
const ROLE_LABEL: Record<InviteOperatorInput['role'], string> = {
  lead: 'Lead',
  approver: 'Approver',
  admin: 'Admin',
}

const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_authorized: 'Only a lead or admin operator can do this.',
  forbidden: 'Only a lead or admin operator can invite.',
  rate_limited: 'Too many invites sent recently. Try again shortly.',
  invalid_body: 'Check the form — something did not match the required shape.',
  invite_failed: 'Could not send the invitation.',
  cannot_deactivate_self: 'You cannot deactivate your own account.',
  cannot_deactivate_last_admin: 'At least one active admin must remain.',
  not_found: 'That operator no longer exists.',
  internal: "That didn't go through. Try again.",
}

function copyForError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const code = String((body as { error: unknown }).error)
    return ERROR_COPY[code] ?? ERROR_COPY['internal']!
  }
  return ERROR_COPY['internal']!
}

const inputStyle: React.CSSProperties = {
  border: '1px solid var(--rule,rgba(242,239,226,0.16))',
  background: 'var(--panel,#101012)',
  color: 'var(--ink,#F2EFE2)',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '15px',
  padding: '11px 13px',
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
  color: 'var(--ink3,rgba(242,239,226,0.52))',
}
const buttonStyle: React.CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--grn,#00F5A5)',
  background: 'var(--grn,#00F5A5)',
  color: 'var(--on,#0A0A0A)',
  padding: '12px 20px',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '13px',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  minHeight: '44px',
}
const ghostButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'transparent',
  color: 'var(--grn,#00F5A5)',
}
const dangerGhostButtonStyle: React.CSSProperties = {
  ...ghostButtonStyle,
  border: '1px solid var(--bad,#FF6B5A)',
  color: 'var(--bad,#FF6B5A)',
}
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--rule,rgba(242,239,226,0.16))',
  background: 'var(--panel,#101012)',
  padding: '20px',
}

type InviteFormState = {
  displayName: string
  email: string
  role: InviteOperatorInput['role']
}

const EMPTY_FORM: InviteFormState = { displayName: '', email: '', role: 'approver' }

export function UsersScreen() {
  const router = useRouter()
  const [operators, setOperators] = useState<OperatorRow[] | null>(null)
  const [callerId, setCallerId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<InviteFormState>(EMPTY_FORM)
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadOperators() {
      const res = await fetch('/api/desk/operators')
      if (cancelled) return
      if (res.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if (!cancelled) setLoadError(copyForError(body))
        return
      }
      const body = (await res.json()) as { operators: OperatorRow[]; callerId: string }
      if (cancelled) return
      setOperators(body.operators)
      setCallerId(body.callerId)
      setLoadError(null)
    }
    void loadOperators()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reused after a mutation (invite/activate/deactivate) to refresh the
  // list from the server rather than hand-shaping a row client-side — same
  // reasoning as devices-screen.tsx's post-mint refetch. Not called from a
  // useEffect body, so it is a plain event-driven refetch, not an effect.
  async function refetchOperators() {
    const res = await fetch('/api/desk/operators')
    if (res.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!res.ok) return
    const body = (await res.json()) as { operators: OperatorRow[]; callerId: string }
    setOperators(body.operators)
    setCallerId(body.callerId)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteMessage(null)
    setInviting(true)
    try {
      const res = await fetch('/api/admin/invite-operator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.email, displayName: form.displayName, role: form.role }),
      })
      if (res.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setInviteMessage({ kind: 'error', text: copyForError(body) })
        return
      }
      setInviteMessage({ kind: 'ok', text: `Invitation sent to ${form.email}.` })
      setForm(EMPTY_FORM)
      await refetchOperators()
    } finally {
      setInviting(false)
    }
  }

  async function handleSetActive(userId: string, active: boolean) {
    setRowError(null)
    setBusyId(userId)
    try {
      const res = await fetch(`/api/desk/operators/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (res.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setRowError(copyForError(body))
        return
      }
      const body = (await res.json()) as { operator: OperatorRow }
      setOperators((prev) =>
        (prev ?? []).map((o) => (o.user_id === userId ? { ...o, active: body.operator.active } : o)),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--bg,#0A0A0A)',
        padding: '28px 18px 64px',
      }}
    >
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <h1
          style={{
            fontFamily: "'Anton',sans-serif",
            fontSize: 'clamp(28px, 5vw, 40px)',
            lineHeight: 0.94,
            textTransform: 'uppercase',
            color: 'var(--ink,#F2EFE2)',
            margin: '0 0 28px',
          }}
        >
          Manage users
        </h1>

        <section style={{ ...panelStyle, marginBottom: '28px' }}>
          <h2
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: 'var(--ink2,rgba(242,239,226,0.72))',
              margin: '0 0 16px',
            }}
          >
            Invite an operator
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--ink3,rgba(242,239,226,0.52))', margin: '0 0 16px' }}>
            They get an email with a link to set their own password, then sign in at /desk/login.
          </p>
          <form
            onSubmit={(e) => void handleInvite(e)}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Full name</span>
              <input
                required
                minLength={2}
                maxLength={80}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                style={inputStyle}
                placeholder="Ranjith Kumar"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Email</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                style={inputStyle}
                placeholder="ranjith@example.com"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: operatorRoleSchema.parse(e.target.value) }))}
                style={inputStyle}
              >
                {operatorRoleSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button type="submit" disabled={inviting} style={{ ...buttonStyle, opacity: inviting ? 0.6 : 1 }}>
                {inviting ? 'Sending…' : 'Send invitation'}
              </button>
              {inviteMessage && (
                <p
                  role="status"
                  style={{
                    color: inviteMessage.kind === 'error' ? 'var(--bad,#FF6B5A)' : 'var(--grn,#00F5A5)',
                    fontSize: '13px',
                    margin: 0,
                  }}
                >
                  {inviteMessage.text}
                </p>
              )}
            </div>
          </form>
        </section>

        <section>
          <h2
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              color: 'var(--ink2,rgba(242,239,226,0.72))',
              margin: '0 0 16px',
            }}
          >
            All operators
          </h2>

          {loadError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{loadError}</p>}
          {rowError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{rowError}</p>}
          {operators === null && !loadError && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>Loading…</p>
          )}
          {operators !== null && operators.length === 0 && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>No operators visible to you.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {operators?.map((o) => {
              const isSelf = o.user_id === callerId
              return (
                <div key={o.user_id} style={panelStyle}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '14px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <p style={{ fontFamily: "'Oswald',sans-serif", fontSize: '17px', color: 'var(--ink,#F2EFE2)', margin: 0 }}>
                        {o.display_name}
                        {isSelf ? ' (you)' : ''}
                      </p>
                      <p style={{ ...labelStyle, marginTop: '4px' }}>
                        {ROLE_LABEL[o.role]} · {o.active ? 'active' : 'deactivated'}
                      </p>
                    </div>
                    {isSelf ? (
                      <span style={{ ...labelStyle }}>Cannot change your own status</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === o.user_id}
                        onClick={() => void handleSetActive(o.user_id, !o.active)}
                        style={{
                          ...(o.active ? dangerGhostButtonStyle : ghostButtonStyle),
                          opacity: busyId === o.user_id ? 0.6 : 1,
                        }}
                      >
                        {busyId === o.user_id ? 'Working…' : o.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
