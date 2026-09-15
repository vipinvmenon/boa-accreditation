'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ORG_KINDS, ORG_TYPE_CODES, type OrgRow, type InviteRow, type MintedInvite } from '@/lib/schemas/org'

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
const panelStyle: React.CSSProperties = {
  border: '1px solid var(--rule,rgba(242,239,226,0.16))',
  background: 'var(--panel,#101012)',
  padding: '20px',
}

type CreateFormState = {
  name: string
  kind: (typeof ORG_KINDS)[number]
  quota: string
  contactName: string
  contactPhone: string
  defaultType: (typeof ORG_TYPE_CODES)[number]
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
        if (!cancelled) setLoadError(copyForError(body))
        return
      }
      const body = (await res.json()) as { orgs: OrgRow[] }
      if (cancelled) return
      setOrgs(body.orgs)
      setLoadError(null)
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
      setCreateError(copyForError(body))
      return
    }
    const body = (await res.json()) as { org: OrgRow }
    setOrgs((prev) => [body.org, ...(prev ?? [])])
    setForm(EMPTY_FORM)
  }

  async function loadInvites(orgId: string) {
    const res = await fetch(`/api/desk/orgs/${orgId}/invites`)
    if (res.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!res.ok) return
    const body = (await res.json()) as { invites: InviteRow[] }
    setInvitesByOrg((prev) => ({ ...prev, [orgId]: body.invites }))
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
      setMintError(copyForError(body))
      return
    }
    const body = (await res.json()) as { invite: MintedInvite }
    setJustMinted({ orgId, invite: body.invite })
    setMintLabel('')
    setCopied(false)
    await loadInvites(orgId)
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
          Orgs
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
            Create an org
          </h2>
          <form
            onSubmit={handleCreate}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Name</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                style={inputStyle}
                maxLength={120}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Kind</span>
              <select
                value={form.kind}
                onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as CreateFormState['kind'] }))}
                style={inputStyle}
              >
                {ORG_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Quota</span>
              <input
                required
                type="number"
                min={0}
                max={500}
                value={form.quota}
                onChange={(e) => setForm((f) => ({ ...f, quota: e.target.value }))}
                style={inputStyle}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Default pass type</span>
              <select
                value={form.defaultType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, defaultType: e.target.value as CreateFormState['defaultType'] }))
                }
                style={inputStyle}
              >
                {ORG_TYPE_CODES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Contact name</span>
              <input
                required
                value={form.contactName}
                onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                style={inputStyle}
                maxLength={80}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Contact phone</span>
              <input
                required
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                style={inputStyle}
                placeholder="+91XXXXXXXXXX"
              />
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button type="submit" disabled={creating} className="hov-invert-grn" style={{ ...buttonStyle, opacity: creating ? 0.6 : 1 }}>
                {creating ? 'Creating…' : 'Create org'}
              </button>
              {createError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px', margin: 0 }}>{createError}</p>}
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
            All orgs
          </h2>

          {loadError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{loadError}</p>}
          {orgs === null && !loadError && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>Loading…</p>
          )}
          {orgs !== null && orgs.length === 0 && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>No orgs yet.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {orgs?.map((org) => {
              const isOpen = openOrgId === org.id
              const invites = invitesByOrg[org.id] ?? []
              return (
                <div key={org.id} style={panelStyle}>
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
                        {org.name}
                      </p>
                      <p style={{ ...labelStyle, marginTop: '4px' }}>
                        {org.kind} · quota {org.quota} · {org.status} · {org.contact_name}
                      </p>
                    </div>
                    <button type="button" onClick={() => toggleOrg(org.id)} className="hov-fill-grn" style={ghostButtonStyle}>
                      {isOpen ? 'Close' : 'Invite links'}
                    </button>
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: '16px', borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))', paddingTop: '16px' }}>
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                        <input
                          value={mintLabel}
                          onChange={(e) => setMintLabel(e.target.value)}
                          placeholder="Label (optional)"
                          style={{ ...inputStyle, maxWidth: '260px' }}
                          maxLength={80}
                        />
                        <button
                          type="button"
                          disabled={minting}
                          onClick={() => handleMint(org.id)}
                          className="hov-invert-grn"
                          style={{ ...buttonStyle, opacity: minting ? 0.6 : 1 }}
                        >
                          {minting ? 'Minting…' : 'Mint invite link'}
                        </button>
                      </div>
                      {mintError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{mintError}</p>}

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
                            className="hov-fill-grn"
                            style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
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
                  )}
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
