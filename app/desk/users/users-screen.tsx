'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { z } from 'zod'
import { Icon } from '@/components/icon'
import { Button, Field, Select, StatusPill } from '@/components/r10/primitives-a'
import { EmptyState, Sheet, Skeleton, SkeletonText, Table, TableCell } from '@/components/r10/primitives-b'
import { copyForError } from '@/lib/error-copy'
import { loginHref } from '@/gate/session'
import { OPERATOR_ROLE_COPY, operatorRoleSchema, operatorRowSchema, setOperatorActiveResultSchema, type OperatorRow } from '@/lib/schemas/operator'

const responseSchema = z.object({ operators: operatorRowSchema.array(), callerId: z.string() })
const mutationSchema = z.object({ operator: setOperatorActiveResultSchema })
const errorOverrides = {
  not_authorized: 'Only a lead or admin operator can do this.',
  forbidden: 'Only a lead or admin operator can invite.',
  not_found: 'That operator no longer exists.',
  cannot_change_own_role: 'You can’t change your own role.',
  cannot_demote_last_admin: 'The last active admin can’t be moved off admin.',
  cannot_deactivate_self: 'You can’t deactivate yourself.',
  cannot_deactivate_last_admin: 'The last active admin can’t be deactivated.',
}
type InviteForm = { displayName: string; email: string; role: OperatorRow['role'] }
const initialInvite: InviteForm = { displayName: '', email: '', role: 'issuer' }

const USER_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'open', label: <span className="sr-only">Open</span> },
]

type UsersNote = { scope: string; text: string; error?: boolean } | null

/** Inline confirmation or error, shown beside the control that was pressed. */
function Note({ note, scope }: { note: UsersNote; scope: string }) {
  if (!note || note.scope !== scope) return null
  return (
    <p className={note.error ? 'users-note bad' : 'users-note'} role={note.error ? 'alert' : 'status'}>
      <Icon name={note.error ? 'x' : 'check'} />{note.text}
    </p>
  )
}

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
  const [sent, setSent] = useState(false)
  // Feedback lives inside the sheet, beside the control that was pressed.
  const [note, setNote] = useState<{ scope: 'role' | 'access' | 'invite'; text: string; error?: boolean } | null>(null)

  useEffect(() => {
    if (!note || note.error) return
    const timer = window.setTimeout(() => setNote(null), 3200)
    return () => window.clearTimeout(timer)
  }, [note])

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
    setNote(null)
  }

  async function mutate(operatorId: string, body: { active: boolean } | { role: OperatorRow['role'] }) {
    const scope = 'role' in body ? 'role' : 'access'
    setBusy(true)
    setNote(null)
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
      const payload: unknown = await response.json().catch(() => null)
      const parsed = mutationSchema.safeParse(payload)
      if (!response.ok || !parsed.success) {
        setNote({ scope, text: copyForError(payload, errorOverrides), error: true })
        return
      }
      const next = (current: OperatorRow): OperatorRow => ({
        ...current,
        role: parsed.data.operator.role,
        display_name: parsed.data.operator.display_name,
        active: parsed.data.operator.active,
        created_at: parsed.data.operator.created_at ?? current.created_at,
      })
      setOperators((current) => current?.map((item) => item.user_id === operatorId ? next(item) : item) ?? null)
      setSelected((current) => current && current.user_id === operatorId ? next(current) : current)
      setConfirming(false)
      setNote({ scope, text: 'role' in body ? 'Role saved.' : parsed.data.operator.active ? 'Reactivated.' : 'Deactivated.' })
    } catch {
      setNote({ scope, text: copyForError(null, errorOverrides), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function inviteOperator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setNote(null)
    try {
      const response = await fetch('/api/admin/invite-operator', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(invite),
      })
      if (!response.ok) {
        setNote({ scope: 'invite', text: copyForError(await response.json().catch(() => null), errorOverrides), error: true })
        return
      }
      // The button itself confirms ("Invitation sent"), then the sheet closes.
      setSent(true)
      await load()
      await new Promise((resolve) => window.setTimeout(resolve, 1100))
      setInviteOpen(false)
      setInvite(initialInvite)
      setSent(false)
    } catch {
      setNote({ scope: 'invite', text: copyForError(null, errorOverrides), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="users-screen">
      <header className="users-head">
        <div>
          <h1 className="display-lg">Users</h1>
          <p className="lede">Who can sign in to the desk and the gate, and what each of them can do.</p>
        </div>
        <Button variant="primary" onClick={() => { setNote(null); setInviteOpen(true) }}>Invite operator <Icon name="plus" /></Button>
      </header>

      {loadError && <EmptyState error title="Operators didn’t load" icon={<Icon name="x" />}>
        <p>{loadError}</p>
        <Button onClick={() => { setOperators(null); void load() }}>Try again <Icon name="arrow-right" /></Button>
      </EmptyState>}
      {operators === null && !loadError && (
        // The loaded table's header and row markup with skeleton values, so
        // each row is its real height and the header does not appear late.
        <div role="status" aria-label="Loading operators" aria-busy="true">
          <Table label="Loading operators" columns={USER_COLUMNS} className="users-table card">
            {[16, 12, 18, 14].map((w, index) => (
              <div key={index} className="user-row user-row-skeleton" role="row" aria-hidden="true">
                <TableCell><strong className="users-nm"><SkeletonText w={`${w}ch`} /></strong><span className="mono ink-2"><SkeletonText w="10ch" /></span></TableCell>
                <TableCell><SkeletonText w="9ch" /></TableCell>
                <TableCell><Skeleton shape="pill" /></TableCell>
                <TableCell className="user-arrow"><Skeleton shape="dot" /></TableCell>
              </div>
            ))}
          </Table>
        </div>
      )}
      {operators?.length === 0 && <EmptyState title="Only you so far" icon={<Icon name="plus" />}>
        Invite the desk and the gate issuers. Each gets an email to set a password.
      </EmptyState>}
      {operators && operators.length > 0 && (
        <Table label="Operators" columns={USER_COLUMNS} className="users-table card">
          {operators.map((operator) => (
            <div key={operator.user_id} className="user-row" role="row" tabIndex={0} onClick={() => openOperator(operator)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openOperator(operator) } }}>
              <TableCell><strong className="users-nm">{operator.display_name}{operator.user_id === callerId && <span className="users-you"> (you)</span>}</strong><span className="mono ink-2">{operator.created_at.slice(0, 10)}</span></TableCell>
              <TableCell>{OPERATOR_ROLE_COPY[operator.role].label}</TableCell>
              <TableCell><StatusPill status={operator.active ? 'ok' : 'mute'}>{operator.active ? 'Active' : 'Deactivated'}</StatusPill></TableCell>
              <TableCell className="user-arrow"><Icon name="arrow-right" /></TableCell>
            </div>
          ))}
        </Table>
      )}

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite operator" footer={
        <><Button variant="primary" type="submit" form="invite-form" disabled={busy || sent}>{sent ? <>Invitation sent <Icon name="check" /></> : <>Send invitation <Icon name="paper-plane-tilt" /></>}</Button><Button onClick={() => setInviteOpen(false)}>Cancel</Button></>
      }>
        <form id="invite-form" onSubmit={(event) => void inviteOperator(event)} className="users-form">
          <Field label="Full name" required minLength={2} maxLength={80} value={invite.displayName} onChange={(event) => setInvite({ ...invite, displayName: event.target.value })} hint="Shown to the team and on gate records." />
          <Field label="Email" type="email" required value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} />
          <Select label="Role" value={invite.role} onChange={(event) => setInvite({ ...invite, role: operatorRoleSchema.parse(event.target.value) })} hint={OPERATOR_ROLE_COPY[invite.role].description}>
            {operatorRoleSchema.options.map((value) => <option key={value} value={value}>{OPERATOR_ROLE_COPY[value].label}</option>)}
          </Select>
          <Note note={note} scope="invite" />
        </form>
      </Sheet>

      <Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.display_name}>
        {selected && <div className="users-form">
          {selected.user_id === callerId ? (
            <>
              <dl className="users-dl body-sm">
                <dt>Role</dt><dd>{OPERATOR_ROLE_COPY[selected.role].label}</dd>
                <dt>Status</dt><dd><StatusPill status={selected.active ? 'ok' : 'mute'}>{selected.active ? 'Active' : 'Deactivated'}</StatusPill></dd>
              </dl>
              <p className="body-sm ink-3">You can’t change your own role or status. Ask another admin.</p>
            </>
          ) : <>
            <Select label="Role" value={role} onChange={(event) => setRole(operatorRoleSchema.parse(event.target.value))} hint={OPERATOR_ROLE_COPY[role].description}>
              {operatorRoleSchema.options.map((value) => <option key={value} value={value}>{OPERATOR_ROLE_COPY[value].label}</option>)}
            </Select>
            {role !== selected.role && <Button variant="primary" disabled={busy} onClick={() => void mutate(selected.user_id, { role })}>{busy ? 'Saving…' : 'Save role'}</Button>}
            <Note note={note} scope="role" />
            <div className="access-section">
              <p className="label">Access</p>
              <p className="body-sm ink-2">{selected.active ? 'Active. Signs in with their own password.' : 'Deactivated. Can’t sign in.'}</p>
              {confirming ? <div className="confirm" role="alertdialog" aria-label={`Confirm deactivation of ${selected.display_name}`}>
                <strong>Deactivate {selected.display_name}?</strong><span className="body-sm ink-2">They can’t sign in until an admin reactivates them.</span>
                <div className="confirm-actions"><Button variant="danger" disabled={busy} onClick={() => void mutate(selected.user_id, { active: false })}>Deactivate</Button><Button onClick={() => setConfirming(false)}>Keep active</Button></div>
              </div> : <Button variant={selected.active ? 'danger' : 'default'} disabled={busy} onClick={() => selected.active ? setConfirming(true) : void mutate(selected.user_id, { active: true })}>{selected.active ? 'Deactivate' : 'Reactivate'}</Button>}
              <Note note={note} scope="access" />
            </div>
          </>}
        </div>}
      </Sheet>
      <style jsx global>{`
        /* No padding-block here: this <main> already sits inside desk-chrome's
           .page, which pads padding-top: var(--s-10) and padding-bottom:
           var(--s-20) (var(--s-6) top on mobile). A second padding-block here
           stacked a redundant 40px under the header — see master/orgs. */
        .r10 .users-head { display:flex; align-items:end; justify-content:space-between; gap:var(--s-8); margin-bottom:var(--s-8); }
        .r10 .users-head h1 { margin:var(--s-2) 0 var(--s-3); }
        /* clip, not hidden: hidden makes a scroll container and breaks the sticky .thead (design/source/r10/r8/ui.css line 554) */
        .r10 .users-table { overflow:clip; }
        .r10 .users-table .users-nm { display:block; font:600 14.5px/1.2 var(--f-label); letter-spacing:.02em; text-transform:uppercase; color:var(--ink); }
        .r10 .users-table .users-you { font:400 var(--t-body-sm)/1 var(--f-body); letter-spacing:0; text-transform:none; color:var(--ink-3); }
        .r10 .users-table .thead, .r10 .user-row { display:grid; grid-template-columns:minmax(220px,2fr) minmax(140px,1fr) minmax(140px,1fr) 44px; align-items:center; gap:var(--s-4); padding-inline:var(--s-6); }
        .r10 .users-table .thead { min-height:48px; color:var(--ink-3); font:600 var(--t-label)/1.2 var(--f-label); letter-spacing:var(--track-label); text-transform:uppercase; box-shadow:inset 0 -1px 0 var(--hair); }
        .r10 .user-row { min-height:76px; padding-block:var(--s-3); cursor:pointer; box-shadow:inset 0 -1px 0 var(--hair); transition:background-color var(--d-quick) var(--e-hover),transform var(--d-quick) var(--e-hover); }
        .r10 .user-row:hover { background:var(--raised); transform:translateX(2px); }
        .r10 .user-row:focus-visible { outline:2px solid var(--ink); outline-offset:-2px; }
        .r10 .user-row > [role="cell"]:first-child { display:grid; gap:var(--s-1); }
        .r10 .user-arrow { justify-self:end; color:var(--ink-3); font-size:20px; }
        .r10 .users-form { display:grid; gap:var(--s-5); }
        .r10 .users-dl { display:grid; grid-template-columns:120px 1fr; gap:var(--s-3) var(--s-4); margin:0; }
        .r10 .users-dl dt { color:var(--ink-3); }
        .r10 .users-dl dd { margin:0; }
        .r10 .access-section { display:grid; gap:var(--s-3); margin-top:var(--s-3); padding-top:var(--s-5); border-top:1px solid var(--hair); }
        .r10 .access-section .label { margin:0; color:var(--gold); }
        .r10 .confirm { display:grid; gap:var(--s-3); padding:var(--s-4); border-radius:var(--r-md); background:var(--bad-tint); }
        .r10 .users-note { display:flex; align-items:center; gap:var(--s-2); margin:0; font-size:var(--t-body-sm); color:var(--go); animation:note-in var(--d-quick) var(--e-out); }
        .r10 .users-note.bad { color:var(--bad); }
        @keyframes note-in { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
        .r10 .confirm-actions { display:flex; flex-wrap:wrap; gap:var(--s-3); }
        .r10 .user-row.user-row-skeleton { cursor:default; pointer-events:none; }
        @media (max-width:700px) {
          .r10 .users-head { align-items:start; flex-direction:column; gap:var(--s-5); margin-bottom:var(--s-6); }
          .r10 .users-head .btn { width:100%; }
          .r10 .users-table .thead { display:none; }
          .r10 .user-row { grid-template-columns:max-content 1fr 44px; grid-template-areas:"name name arrow" "role status arrow"; gap:var(--s-1) var(--s-3); padding-inline:var(--s-5); }
          .r10 .user-row > [role="cell"]:first-child { grid-area:name; }
          .r10 .user-row > [role="cell"]:nth-child(2) { grid-area:role; }
          .r10 .user-row > [role="cell"]:nth-child(3) { grid-area:status; justify-self:start; }
          .r10 .user-row > [role="cell"]:last-child { grid-area:arrow; align-self:center; }
        }
        @media (prefers-reduced-transparency:reduce) { .r10 .users-table { background:var(--surface-solid); backdrop-filter:none; } }
        @media (prefers-reduced-motion:reduce) { .r10 .user-row { transition:none; } }
      `}</style>
    </main>
  )
}
