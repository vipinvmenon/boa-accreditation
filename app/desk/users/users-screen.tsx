'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { OPERATOR_ROLE_COPY, operatorRoleSchema, type InviteOperatorInput, type OperatorRow } from '@/lib/schemas/operator'
import { UtilityScreenSkeleton } from '@/components/loading-skeleton'
import { EmptyState, InlineConfirm, InlineError } from '@/components/states'
import { copyForError } from '@/lib/error-copy'
import { loginHref } from '@/gate/session'

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
// ACC-122: shared with every other desk screen via lib/error-copy.ts; this
// screen's `not_authorized`, `forbidden`, `rate_limited` and `not_found`
// wording differ from the default because they name this screen's own
// actions ("invite", "operator").
const USERS_ERROR_OVERRIDES = {
  not_authorized: 'Only a lead or admin operator can do this.',
  forbidden: 'Only a lead or admin operator can invite.',
  rate_limited: 'Too many invites sent recently. Try again shortly.',
  not_found: 'That operator no longer exists.',
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

const EMPTY_FORM: InviteFormState = { displayName: '', email: '', role: 'issuer' }

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
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('Loading operators.')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadOperators() {
      try {
        const res = await fetch('/api/desk/operators')
        if (cancelled) return
        if (res.status === 401) {
          router.replace(loginHref(window.location.pathname + window.location.search))
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const message = copyForError(body, USERS_ERROR_OVERRIDES)
          if (!cancelled) {
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
      } catch {
        if (!cancelled) {
          const message = copyForError(null, USERS_ERROR_OVERRIDES)
          setLoadError(message)
          setAnnouncement(`Could not load operators. ${message}`)
        }
      }
    }
    void loadOperators()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  // Reused after a mutation (invite/activate/deactivate) to refresh the
  // list from the server rather than hand-shaping a row client-side — same
  // reasoning as devices-screen.tsx's post-mint refetch. Not called from a
  // useEffect body, so it is a plain event-driven refetch, not an effect.
  async function refetchOperators() {
    try {
      const res = await fetch('/api/desk/operators')
      if (res.status === 401) {
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      if (!res.ok) {
        const message = copyForError(await res.json().catch(() => null), USERS_ERROR_OVERRIDES)
        setAnnouncement(`Could not refresh operators. ${message}`)
        return
      }
      const body = (await res.json()) as { operators: OperatorRow[]; callerId: string }
      setOperators(body.operators)
      setCallerId(body.callerId)
    } catch {
      setAnnouncement(`Could not refresh operators. ${copyForError(null, USERS_ERROR_OVERRIDES)}`)
    }
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
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = copyForError(body, USERS_ERROR_OVERRIDES)
        setInviteMessage({ kind: 'error', text: message })
        setAnnouncement(`Could not send invitation. ${message}`)
        return
      }
      setInviteMessage({ kind: 'ok', text: `Invitation sent to ${form.email}.` })
      setAnnouncement(`Invitation sent to ${form.email}.`)
      setForm(EMPTY_FORM)
      await refetchOperators()
    } catch {
      const message = copyForError(null, USERS_ERROR_OVERRIDES)
      setInviteMessage({ kind: 'error', text: message })
      setAnnouncement(`Could not send invitation. ${message}`)
    } finally {
      setInviting(false)
    }
  }

  // ACC-125: Deactivate is destructive (it locks the operator out immediately
  // — boa_acc_set_operator_active is the real guard, this is only the
  // confirmation step) and Activate is not, so only Deactivate goes through
  // the inline confirm; Activate fires straight away like the rest of the
  // desk's non-destructive actions.
  function requestSetActive(userId: string, active: boolean) {
    if (!active) {
      setConfirmingId(userId)
      return
    }
    void handleSetActive(userId, active)
  }

  async function handleSetActive(userId: string, active: boolean) {
    setRowError(null)
    setBusyId(userId)
    setConfirmingId(null)
    try {
      const res = await fetch(`/api/desk/operators/${userId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (res.status === 401) {
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = copyForError(body, USERS_ERROR_OVERRIDES)
        setRowError(message)
        setAnnouncement(`Could not ${active ? 'activate' : 'deactivate'} operator. ${message}`)
        return
      }
      const body = (await res.json()) as { operator: OperatorRow }
      setOperators((prev) =>
        (prev ?? []).map((o) => (o.user_id === userId ? { ...o, active: body.operator.active } : o)),
      )
      setAnnouncement(`Operator ${active ? 'activated' : 'deactivated'}.`)
    } catch {
      const message = copyForError(null, USERS_ERROR_OVERRIDES)
      setRowError(message)
      setAnnouncement(`Could not ${active ? 'activate' : 'deactivate'} operator. ${message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="utility-screen">
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
                aria-describedby="operator-name-hint"
                required
                minLength={2}
                maxLength={80}
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                className="utility-input"
              />
              <small id="operator-name-hint" className="utility-hint">Shown to the team and on gate records.</small>
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
                aria-describedby="operator-role-description"
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: operatorRoleSchema.parse(e.target.value) }))}
                className="utility-input utility-select"
              >
                {operatorRoleSchema.options.map((option) => (
                  <option key={option} value={option}>
                    {OPERATOR_ROLE_COPY[option].label}
                  </option>
                ))}
              </select>
              <small id="operator-role-description" className="utility-hint">{OPERATOR_ROLE_COPY[form.role].description}</small>
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

          {loadError && (
            <InlineError
              className="utility-error"
              message={loadError}
              onRetry={() => { setLoadError(null); setOperators(null); setReloadKey((k) => k + 1) }}
            />
          )}
          {rowError && <p role="alert" className="utility-error">{rowError}</p>}
          {operators === null && !loadError && (
            <div role="status" aria-label="Loading operators"><UtilityScreenSkeleton kind="users" /></div>
          )}
          {operators !== null && operators.length === 0 && (
            <EmptyState message="No operators visible to you. Invite one above." />
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
                        {OPERATOR_ROLE_COPY[o.role].label} · {o.active ? 'active' : 'deactivated'}
                      </p>
                    </div>
                    {isSelf ? (
                      <span style={{ ...labelStyle }}>Cannot change your own status</span>
                    ) : confirmingId === o.user_id ? (
                      <InlineConfirm
                        prompt={`Deactivate ${o.display_name}?`}
                        confirmLabel="Deactivate"
                        busy={busyId === o.user_id}
                        busyLabel="Working…"
                        onConfirm={() => void handleSetActive(o.user_id, false)}
                        onCancel={() => setConfirmingId(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === o.user_id}
                        onClick={() => requestSetActive(o.user_id, !o.active)}
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
