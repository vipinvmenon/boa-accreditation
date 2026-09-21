'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ORG_KINDS, type OrgRow, type InviteRow, type MintedInvite } from '@/lib/schemas/org'
import { REQUESTABLE_TIERS, type RequestableTierCode } from '@/lib/desk-tiers'
import { UtilityScreenSkeleton } from '@/components/loading-skeleton'

/**
 * Not part of the approved design (design/source/boa_design_body.html has no
 * orgs screen — the 7 screens in scripts/visual-check.mjs's SCREENS are the
 * whole pixel contract), so this is built from the design's own tokens
 * (lib/design.ts / app/globals.css / app/desk/login/page.tsx's precedent),
 * not a transcription. Not gated by test:visual for the same reason.
 *
 * Per docs/ARCHITECTURE.md rule 1, this screen never imports the Supabase
 * client — every read and write goes through app/api/desk/orgs/** (which
 * holds lib/supabase-server.ts, the cookie-backed session client; the
 * service-role client, lib/supabase-admin.ts, is never involved here at all).
 * A 401 from any call means the session cookie is gone or never existed, so
 * this redirects to /desk/login rather than rendering a broken screen.
 */
const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_authorized: 'Only a lead or admin operator can do this.',
  duplicate_name: 'An org with that name already exists.',
  invalid_body: 'Check the form — something did not match the required shape.',
  not_found: 'That org no longer exists.',
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
type CreateFormState = {
  name: string
  kind: (typeof ORG_KINDS)[number]
  quota: string
  contactName: string
  contactPhone: string
  defaultType: RequestableTierCode
}

const EMPTY_FORM: CreateFormState = {
  name: '',
  kind: 'vendor',
  quota: '',
  contactName: '',
  contactPhone: '+91',
  defaultType: 'crew',
}

export function OrgsScreen() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [openOrgId, setOpenOrgId] = useState<string | null>(null)
  const [invitesByOrg, setInvitesByOrg] = useState<Record<string, InviteRow[]>>({})
  const [mintLabel, setMintLabel] = useState('')
  const [minting, setMinting] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)
  const [justMinted, setJustMinted] = useState<{ orgId: string; invite: MintedInvite } | null>(null)
  const [copied, setCopied] = useState(false)
  const [announcement, setAnnouncement] = useState('Loading organisations.')

  useEffect(() => {
    let cancelled = false
    async function loadOrgs() {
      const res = await fetch('/api/desk/orgs')
      if (cancelled) return
      if (res.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        if (!cancelled) {
          setLoadError(copyForError(body))
          setAnnouncement(`Could not load organisations. ${copyForError(body)}`)
        }
        return
      }
      const body = (await res.json()) as { orgs: OrgRow[] }
      if (cancelled) return
      setOrgs(body.orgs)
      setLoadError(null)
      setAnnouncement('Organisations loaded.')
    }
    void loadOrgs()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    const res = await fetch('/api/desk/orgs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        kind: form.kind,
        quota: Number(form.quota),
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        defaultType: form.defaultType,
      }),
    })
    setCreating(false)
    if (res.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const message = copyForError(body)
      setCreateError(message)
      setAnnouncement(`Could not create organisation. ${message}`)
      return
    }
    const body = (await res.json()) as { org: OrgRow }
    setOrgs((prev) => [body.org, ...(prev ?? [])])
    setForm(EMPTY_FORM)
    setAnnouncement(`Organisation ${body.org.name} created.`)
  }

  async function loadInvites(orgId: string) {
    const res = await fetch(`/api/desk/orgs/${orgId}/invites`)
    if (res.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!res.ok) {
      const message = copyForError(await res.json().catch(() => null))
      setAnnouncement(`Could not load invite links. ${message}`)
      return
    }
    const body = (await res.json()) as { invites: InviteRow[] }
    setInvitesByOrg((prev) => ({ ...prev, [orgId]: body.invites }))
    setAnnouncement('Invite links loaded.')
  }

  async function toggleOrg(orgId: string) {
    setJustMinted(null)
    setMintError(null)
    setMintLabel('')
    if (openOrgId === orgId) {
      setOpenOrgId(null)
      return
    }
    setOpenOrgId(orgId)
    await loadInvites(orgId)
  }

  async function handleMint(orgId: string) {
    setMintError(null)
    setMinting(true)
    const res = await fetch(`/api/desk/orgs/${orgId}/invites`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: mintLabel || undefined }),
    })
    setMinting(false)
    if (res.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      const message = copyForError(body)
      setMintError(message)
      setAnnouncement(`Could not mint invite link. ${message}`)
      return
    }
    const body = (await res.json()) as { invite: MintedInvite }
    setJustMinted({ orgId, invite: body.invite })
    setMintLabel('')
    setCopied(false)
    await loadInvites(orgId)
    setAnnouncement('Invite link minted.')
  }

  function linkFor(token: string): string {
    if (typeof window === 'undefined') return `/s/${token}`
    return `${window.location.origin}/s/${token}`
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="utility-screen">
      <div className="utility-inner">
        {!createError && !loadError && !mintError && (
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
        )}
        <header className="utility-head"><div><div className="tag">Allocation desk</div><h1 className="h1">Orgs</h1></div></header>

        <section className="utility-section bz"><div className="pl pad">
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
            Create an org
          </h2>
          <form onSubmit={handleCreate} className="utility-form cols">
            <label className="utility-label">
              <span>Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="utility-input"
                maxLength={120}
              />
            </label>
            <label className="utility-label">
              <span>Kind</span>
              <select
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as CreateFormState['kind'] }))}
                className="utility-input"
              >
                {ORG_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="utility-label">
              <span>Quota</span>
              <input
                required
                type="number"
                min={0}
                max={500}
                value={form.quota}
                onChange={(e) => setForm((f) => ({ ...f, quota: e.target.value }))}
                className="utility-input"
              />
            </label>
            <label className="utility-label">
              <span>Default pass type</span>
              <select
                value={form.defaultType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, defaultType: e.target.value as CreateFormState['defaultType'] }))
                }
                className="utility-input"
              >
                {REQUESTABLE_TIERS.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="utility-label">
              <span>Contact name</span>
              <input
                required
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                className="utility-input"
                maxLength={80}
              />
            </label>
            <label className="utility-label">
              <span>Contact phone</span>
              <input
                required
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                className="utility-input"
                placeholder="+91XXXXXXXXXX"
              />
            </label>
            <div className="utility-actions full">
              <button type="submit" disabled={creating} className="btn go hov-invert-grn" style={{ opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating…' : 'Create org'}
              </button>
              {createError && <p role="alert" className="utility-error">{createError}</p>}
            </div>
          </form>
        </div></section>

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
            All orgs
          </h2>

          {loadError && <p role="alert" className="utility-error">{loadError}</p>}
          {orgs === null && !loadError && (
            <div role="status"><UtilityScreenSkeleton kind="orgs" /></div>
          )}
          {orgs !== null && orgs.length === 0 && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>No orgs yet.</p>
          )}

          <div className="utility-list">
            {orgs?.map((org) => {
              const isOpen = openOrgId === org.id
              const invites = invitesByOrg[org.id] ?? []
              return (
                <div key={org.id} className="bz"><div className="pl pad">
                  <div className="utility-row">
                    <div>
                      <p style={{ fontFamily: "'Oswald',sans-serif", fontSize: '17px', color: 'var(--ink,#F2EFE2)', margin: 0 }}>
                        {org.name}
                      </p>
                      <p style={{ ...labelStyle, marginTop: '4px' }}>
                        {org.kind} · quota {org.quota} · {org.status} · {org.contact_name}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleOrg(org.id)}
                      className="btn solo hov-fill-grn"
                      aria-expanded={isOpen}
                      aria-controls={`org-invites-${org.id}`}
                    >
                      {isOpen ? 'Close' : 'Invite links'}
                    </button>
                  </div>

                  <div
                      id={`org-invites-${org.id}`}
                      hidden={!isOpen}
                      style={{ marginTop: '16px', borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))', paddingTop: '16px' }}
                    >
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                        <input
                          value={mintLabel}
                          onChange={(e) => setMintLabel(e.target.value)}
                          placeholder="Label (optional)"
                          className="utility-input"
                          style={{ maxWidth: '260px' }}
                          maxLength={80}
                        />
                        <button
                          type="button"
                          disabled={minting}
                          onClick={() => handleMint(org.id)}
                          className="btn go hov-invert-grn"
                          style={{ opacity: minting ? 0.6 : 1 }}
                        >
                          {minting ? 'Minting…' : 'Mint invite link'}
                        </button>
                      </div>
                      {mintError && <p role="alert" style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{mintError}</p>}

                      {justMinted && justMinted.orgId === org.id && (
                        <div
                          style={{
                            border: '1px solid var(--grn,#00F5A5)',
                            background: 'var(--grnbg,rgba(0,245,165,0.10))',
                            padding: '12px 14px',
                            marginBottom: '14px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          <p style={{ ...labelStyle, color: 'var(--grn,#00F5A5)' }}>
                            Shown once — copy it now
                          </p>
                          <code
                            style={{
                              fontFamily: "'JetBrains Mono',monospace",
                              fontSize: '12.5px',
                              color: 'var(--ink,#F2EFE2)',
                              wordBreak: 'break-all',
                            }}
                          >
                            {linkFor(justMinted.invite.token)}
                          </code>
                          <button
                            type="button"
                            onClick={() => copyLink(justMinted.invite.token)}
                            className="btn solo hov-fill-grn"
                          >
                            {copied ? 'Copied' : 'Copy link'}
                          </button>
                        </div>
                      )}

                      {invites.length === 0 ? (
                        <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px', margin: 0 }}>
                          No live links yet.
                        </p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {invites.map((inv) => (
                            <div key={inv.id} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11.5px', color: 'var(--ink3,rgba(242,239,226,0.52))' }}>
                              {inv.token_hint}… {inv.label ? `· ${inv.label}` : ''} · used {inv.use_count}×
                              {inv.revoked_at ? ' · revoked' : ''}
                            </div>
                          ))}
                        </div>
                      )}
                  </div>
                </div></div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
