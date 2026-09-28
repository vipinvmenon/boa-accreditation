'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Icon } from '@/components/icon'
import { Button, Field, Select, StatusPill } from '@/components/r10/primitives-a'
import { EmptyState, Sheet, Skeleton, Table, TableCell, Toast } from '@/components/r10/primitives-b'
import { copyForError } from '@/lib/error-copy'
import { loginHref } from '@/gate/session'
import { OPERATOR_ROLE_COPY, operatorRoleSchema, operatorRowSchema, type OperatorRow } from '@/lib/schemas/operator'

const responseSchema = z.object({ operators: operatorRowSchema.array(), callerId: z.string() })
const mutationSchema = z.object({ operator: operatorRowSchema })
const errorOverrides = {
  not_authorized: 'Only a lead or admin operator can do this.',
  forbidden: 'Only a lead or admin operator can invite.',
  not_found: 'That operator no longer exists.',
}
type InviteForm = { displayName: string; email: string; role: OperatorRow['role'] }
const initialInvite: InviteForm = { displayName: '', email: '', role: 'issuer' }

export function UsersScreen() {
  const router = useRouter()
  const [operators, setOperators] = useState<OperatorRow[] | null>(null)
  const [callerId, setCallerId] = useState<string | null>(null)
  const [selected, setSelected] = useState<OperatorRow | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invite, setInvite] = useState(initialInvite)
  const [role, setRole] = useState<OperatorRow['role']>('issuer')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null)

  async function load() {
    try {
      const response = await fetch('/api/desk/operators')
      if (response.status === 401) {
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      const parsed = responseSchema.safeParse(await response.json())
      if (!response.ok || !parsed.success) throw new Error('load')
      setOperators(parsed.data.operators)
      setCallerId(parsed.data.callerId)
      setLoadError(null)
    } catch {
      setLoadError(copyForError(null, errorOverrides))
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openOperator(operator: OperatorRow) {
    setSelected(operator)
    setRole(operator.role)
    setConfirming(false)
  }

  async function mutate(operatorId: string, body: { active: boolean } | { role: OperatorRow['role'] }) {
    setBusy(true)
    try {
      const response = await fetch(`/api/desk/operators/${operatorId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (response.status === 401) {
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      const parsed = mutationSchema.safeParse(await response.json())
      if (!response.ok || !parsed.success) {
        setNotice({ text: copyForError(null, errorOverrides), error: true })
        return
      }
      setOperators((current) => current?.map((item) => item.user_id === operatorId ? parsed.data.operator : item) ?? null)
      setSelected(parsed.data.operator)
      setConfirming(false)
      setNotice({ text: `${parsed.data.operator.display_name} updated.` })
    } catch {
      setNotice({ text: copyForError(null, errorOverrides), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function inviteOperator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    try {
      const response = await fetch('/api/admin/invite-operator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(invite),
      })
      if (!response.ok) {
        setNotice({ text: copyForError(await response.json().catch(() => null), errorOverrides), error: true })
        return
      }
      setInvite(initialInvite)
      setInviteOpen(false)
      setNotice({ text: `Invitation sent to ${invite.email}.` })
      await load()
    } catch {
      setNotice({ text: copyForError(null, errorOverrides), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="users-screen">
      <header className="users-head">
        <div>
          <p className="label gold">Desk access</p>
          <h1 className="display-lg">Users</h1>
          <p className="lede">Who can sign in to the desk and gate, and what each person can do.</p>
        </div>
        <Button variant="primary" onClick={() => setInviteOpen(true)}>Invite operator <Icon name="plus" /></Button>
      </header>

      {loadError && <EmptyState error title="Operators didn’t load" icon={<Icon name="x" />}>
        <p>{loadError}</p>
        <Button onClick={() => { setOperators(null); void load() }}>Try again <Icon name="arrow-right" /></Button>
      </EmptyState>}
      {operators === null && !loadError && (
        <div className="users-table card" role="status" aria-label="Loading operators" aria-busy="true">
          {Array.from({ length: 5 }, (_, index) => <div className="user-skeleton" key={index}><Skeleton /><Skeleton shape="pill" /></div>)}
        </div>
      )}
      {operators?.length === 0 && <EmptyState title="Only you so far" icon={<Icon name="plus" />}>
        Invite the desk and gate issuers. Each person gets an email to set a password.
      </EmptyState>}
      {operators && operators.length > 0 && (
        <Table label="Operators" columns={[
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role' },
          { key: 'status', label: 'Status' },
          { key: 'open', label: <span className="sr-only">Open</span> },
        ]} className="users-table card">
          {operators.map((operator) => (
            <div key={operator.user_id} className="user-row" role="row" tabIndex={0} onClick={() => openOperator(operator)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOperator(operator) } }}>
              <TableCell><strong className="display-sm">{operator.display_name}{operator.user_id === callerId ? ' (you)' : ''}</strong><span className="mono ink-2">{operator.created_at.slice(0, 10)}</span></TableCell>
              <TableCell><StatusPill status="mute">{OPERATOR_ROLE_COPY[operator.role].label}</StatusPill></TableCell>
              <TableCell><StatusPill status={operator.active ? 'ok' : 'mute'}>{operator.active ? 'Active' : 'Deactivated'}</StatusPill></TableCell>
              <TableCell className="user-arrow"><Icon name="arrow-right" /></TableCell>
            </div>
          ))}
        </Table>
      )}

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite operator" footer={
        <><Button variant="primary" type="submit" form="invite-form" disabled={busy}>Send invitation <Icon name="paper-plane-tilt" /></Button><Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button></>
      }>
        <form id="invite-form" onSubmit={(event) => void inviteOperator(event)} className="users-form">
          <Field label="Full name" required minLength={2} maxLength={80} value={invite.displayName} onChange={(event) => setInvite({ ...invite, displayName: event.target.value })} hint="Shown to the team and on gate records." />
          <Field label="Email" type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} />
          <Select label="Role" value={invite.role} onChange={(event) => setInvite({ ...invite, role: operatorRoleSchema.parse(event.target.value) })} hint={OPERATOR_ROLE_COPY[invite.role].description}>
            {operatorRoleSchema.options.map((value) => <option key={value} value={value}>{OPERATOR_ROLE_COPY[value].label}</option>)}
          </Select>
        </form>
      </Sheet>

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.display_name}>
        {selected && <div className="users-form">
          <p className="mono ink-2">Operator access</p>
          {selected.user_id === callerId ? (
            <p className="body-sm ink-2">You can’t change your own role or status. Ask another admin.</p>
          ) : <>
            <Select label="Role" value={role} onChange={(event) => setRole(operatorRoleSchema.parse(event.target.value))} hint={OPERATOR_ROLE_COPY[role].description}>
              {operatorRoleSchema.options.map((value) => <option key={value} value={value}>{OPERATOR_ROLE_COPY[value].label}</option>)}
            </Select>
            {role !== selected.role && <Button variant="primary" disabled={busy} onClick={() => void mutate(selected.user_id, { role })}>Save role</Button>}
            <div className="access-section">
              <p className="label">Access</p>
              <p className="body-sm ink-2">{selected.active ? 'Active. Signs in with their own password.' : 'Deactivated. Can’t sign in.'}</p>
              {confirming ? <div className="confirm" role="alertdialog" aria-label={`Confirm deactivation of ${selected.display_name}`}>
                <strong>Deactivate {selected.display_name}?</strong><span className="body-sm ink-2">They can’t sign in until an admin reactivates them.</span>
                <div className="confirm-actions"><Button variant="danger" disabled={busy} onClick={() => void mutate(selected.user_id, { active: false })}>Deactivate</Button><Button variant="ghost" onClick={() => setConfirming(false)}>Keep active</Button></div>
              </div> : <Button variant={selected.active ? 'danger' : 'default'} onClick={() => selected.active ? setConfirming(true) : void mutate(selected.user_id, { active: true })}>{selected.active ? 'Deactivate' : 'Reactivate'}</Button>}
            </div>
          </>}
        </div>}
      </Sheet>
      {notice && <Toast message={notice.text} {...(notice.error ? { error: true } : {})} onDismiss={() => setNotice(null)} />}
      <style jsx global>{`
        .r10 .users-screen { padding-block: var(--s-10) var(--s-20); }
        .r10 .users-head { display:flex; align-items:end; justify-content:space-between; gap:var(--s-8); margin-bottom:var(--s-8); }
        .r10 .users-head h1 { margin:var(--s-2) 0 var(--s-3); }
        .r10 .users-table { overflow:hidden; }
        .r10 .users-table .thead, .r10 .user-row { display:grid; grid-template-columns:minmax(220px,2fr) minmax(140px,1fr) minmax(140px,1fr) 44px; align-items:center; gap:var(--s-4); padding-inline:var(--s-6); }
        .r10 .users-table .thead { min-height:48px; color:var(--ink-3); font:600 var(--t-label)/1.2 var(--f-label); letter-spacing:var(--track-label); text-transform:uppercase; box-shadow:inset 0 -1px 0 var(--hair); }
        .r10 .user-row { min-height:76px; padding-block:var(--s-3); cursor:pointer; box-shadow:inset 0 -1px 0 var(--hair); transition:background-color var(--d-quick) var(--e-hover),transform var(--d-quick) var(--e-hover); }
        .r10 .user-row:hover { background:var(--raised); transform:translateX(2px); }
        .r10 .user-row:focus-visible { outline:2px solid var(--ink); outline-offset:-2px; }
        .r10 .user-row > [role="cell"]:first-child { display:grid; gap:var(--s-1); }
        .r10 .user-arrow { justify-self:end; color:var(--ink-3); font-size:20px; }
        .r10 .users-form { display:grid; gap:var(--s-5); }
        .r10 .access-section { display:grid; gap:var(--s-3); margin-top:var(--s-3); padding-top:var(--s-5); border-top:1px solid var(--hair); }
        .r10 .access-section .label { margin:0; color:var(--gold); }
        .r10 .confirm { display:grid; gap:var(--s-3); padding:var(--s-4); border-radius:var(--r-md); background:var(--bad-tint); }
        .r10 .confirm-actions { display:flex; flex-wrap:wrap; gap:var(--s-3); }
        .r10 .user-skeleton { display:flex; justify-content:space-between; align-items:center; min-height:76px; padding:var(--s-4) var(--s-6); box-shadow:inset 0 -1px 0 var(--hair); }
        @media (max-width:700px) {
          .r10 .users-screen { padding-block:var(--s-6) var(--s-10); }
          .r10 .users-head { align-items:start; flex-direction:column; gap:var(--s-5); margin-bottom:var(--s-6); }
          .r10 .users-head .btn { width:100%; }
          .r10 .users-table .thead { display:none; }
          .r10 .user-row { grid-template-columns:1fr 44px; gap:var(--s-2); padding-inline:var(--s-5); }
          .r10 .user-row > [role="cell"]:nth-child(2), .r10 .user-row > [role="cell"]:nth-child(3) { grid-column:1; }
          .r10 .user-row > [role="cell"]:nth-child(2) { grid-row:2; }
          .r10 .user-row > [role="cell"]:nth-child(3) { grid-row:3; }
          .r10 .user-row > [role="cell"]:last-child { grid-column:2; grid-row:1 / span 3; }
        }
        @media (prefers-reduced-transparency:reduce) { .r10 .users-table { background:var(--surface-solid); backdrop-filter:none; } }
        @media (prefers-reduced-motion:reduce) { .r10 .user-row { transition:none; } }
      `}</style>
    </main>
  )
}
