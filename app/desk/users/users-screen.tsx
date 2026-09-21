'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { operatorRoleSchema, type InviteOperatorInput, type OperatorRow } from '@/lib/schemas/operator'
import { UtilityScreenSkeleton } from '@/components/loading-skeleton'

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

const labelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--ink3,rgba(242,239,226,0.52))',
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
  const [announcement, setAnnouncement] = useState('Loading operators.')

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
        if (!cancelled) {
          const message = copyForError(body)
          setLoadError(message)
          setAnnouncement(`Could not load operators. ${message}`)
        }
        return
      }
      const body = (await res.json()) as { operators: OperatorRow[]; callerId: string }
      if (cancelled) return
      setOperators(body.operators)
      setCallerId(body.callerId)
      setLoadError(null)
      setAnnouncement('Operators loaded.')
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
    if (!res.ok) {
      const message = copyForError(await res.json().catch(() => null))
      setAnnouncement(`Could not refresh operators. ${message}`)
      return
    }
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
        const message = copyForError(body)
        setInviteMessage({ kind: 'error', text: message })
        setAnnouncement(`Could not send invitation. ${message}`)
        return
      }
      setInviteMessage({ kind: 'ok', text: `Invitation sent to ${form.email}.` })
      setAnnouncement(`Invitation sent to ${form.email}.`)
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
        const message = copyForError(body)
        setRowError(message)
        setAnnouncement(`Could not ${active ? 'activate' : 'deactivate'} operator. ${message}`)
        return
      }
      const body = (await res.json()) as { operator: OperatorRow }
      setOperators((prev) =>
        (prev ?? []).map((o) => (o.user_id === userId ? { ...o, active: body.operator.active } : o)),
      )
      setAnnouncement(`Operator ${active ? 'activated' : 'deactivated'}.`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="utility-screen">
      <div className="utility-inner">
        {!inviteMessage && !loadError && !rowError && (
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
        )}
        <header className="utility-head">
          <div>
            <div className="tag">Desk operations</div>
            <h1 className="h1">Manage users</h1>
          </div>
        </header>

        <section className="utility-section bz">
          <div className="pl pad">
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
          <form onSubmit={(e) => void handleInvite(e)} className="utility-form cols">
            <label className="utility-label">
              <span>Full name</span>
              <input
                required
                minLength={2}
                maxLength={80}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="utility-input"
                placeholder="As they should appear to the team"
              />
            </label>
            <label className="utility-label">
              <span>Email</span>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="utility-input"
                placeholder="ranjith@example.com"
              />
            </label>
            <label className="utility-label">
              <span>Role</span>
              <select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: operatorRoleSchema.parse(e.target.value) }))}
                className="utility-input"
              >
                {operatorRoleSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {ROLE_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>
            <div className="utility-actions full">
              <button type="submit" disabled={inviting} className="btn go hov-invert-grn" style={{ opacity: inviting ? 0.6 : 1 }}>
                {inviting ? 'Sending…' : 'Send invitation'}
              </button>
              {inviteMessage && (
                <p
                  role={inviteMessage.kind === 'error' ? 'alert' : 'status'}
                  className={inviteMessage.kind === 'error' ? 'utility-error' : 'utility-ok'}
                >
                  {inviteMessage.text}
                </p>
              )}
            </div>
          </form>
          </div>
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

          {loadError && <p role="alert" className="utility-error">{loadError}</p>}
          {rowError && <p role="alert" className="utility-error">{rowError}</p>}
          {operators === null && !loadError && (
            <div role="status"><UtilityScreenSkeleton kind="users" /></div>
          )}
          {operators !== null && operators.length === 0 && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>No operators visible to you.</p>
          )}

          <div className="utility-list">
            {operators?.map((o) => {
              const isSelf = o.user_id === callerId
              return (
                <div key={o.user_id} className="bz"><div className="pl pad utility-row">
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
                        className={`btn solo ${o.active ? 'bad hov-fill-bad' : 'hov-fill-grn'}`}
                        style={{ opacity: busyId === o.user_id ? 0.6 : 1 }}
                      >
                        {busyId === o.user_id ? 'Working…' : o.active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                  </div></div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
