'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DEVICE_SCOPES, type DeviceRow, type MintedDevice } from '@/lib/schemas/device'

/**
 * Not part of the approved design (design/source/boa_design_body.html has no
 * devices screen — the 7 screens in scripts/visual-check.mjs's SCREENS are
 * the whole pixel contract), so this is built from the design's own tokens,
 * following the exact precedent app/desk/orgs/orgs-screen.tsx set for an
 * "our own screen, same visual language" build. Not gated by test:visual for
 * the same reason /desk/orgs isn't.
 *
 * Per docs/ARCHITECTURE.md rule 1, this screen never imports the Supabase
 * client — every read and write goes through app/api/desk/devices/** (which
 * holds lib/supabase-server.ts, the cookie-backed session client; the
 * service-role client, lib/supabase-admin.ts, is never involved here at all).
 * A 401 from any call means the session cookie is gone or never existed, so
 * this redirects to /desk/login rather than rendering a broken screen.
 */
const ERROR_COPY: Record<string, string> = {
  not_authenticated: 'Your session has expired. Sign in again.',
  not_authorized: 'Only a lead or admin operator can do this.',
  invalid_expiry: 'The expiry must be a real time in the future.',
  invalid_body: 'Check the form — something did not match the required shape.',
  not_found: 'That device no longer exists, or is already revoked.',
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

type CreateFormState = {
  gateLabel: string
  volunteerName: string
  scope: (typeof DEVICE_SCOPES)[number]
}

const EMPTY_FORM: CreateFormState = {
  gateLabel: '',
  volunteerName: '',
  scope: 'crew',
}

export function DevicesScreen() {
  const router = useRouter()
  const [devices, setDevices] = useState<DeviceRow[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const [minting, setMinting] = useState(false)
  const [mintError, setMintError] = useState<string | null>(null)
  const [justMinted, setJustMinted] = useState<MintedDevice | null>(null)
  const [copied, setCopied] = useState(false)

  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadDevices() {
      const res = await fetch('/api/desk/devices')
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
      const body = (await res.json()) as { devices: DeviceRow[] }
      if (cancelled) return
      setDevices(body.devices)
      setLoadError(null)
    }
    void loadDevices()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleMint(e: React.FormEvent) {
    e.preventDefault()
    setMintError(null)
    setMinting(true)
    const res = await fetch('/api/desk/devices', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        gateLabel: form.gateLabel,
        volunteerName: form.volunteerName,
        scope: form.scope,
      }),
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
    const body = (await res.json()) as { device: MintedDevice }
    setJustMinted(body.device)
    setCopied(false)
    setForm(EMPTY_FORM)

    // Re-fetch rather than optimistically prepend: the list route selects
    // the columns the desk is allowed to see (never token_hash), and the
    // mint response already carries everything this screen needs to show
    // the one-time token — no reason to hand-shape a DeviceRow from it.
    const listRes = await fetch('/api/desk/devices')
    if (listRes.ok) {
      const listBody = (await listRes.json()) as { devices: DeviceRow[] }
      setDevices(listBody.devices)
    }
  }

  async function handleRevoke(id: string) {
    setRevokeError(null)
    setRevokingId(id)
    const res = await fetch(`/api/desk/devices/${id}`, { method: 'DELETE' })
    setRevokingId(null)
    if (res.status === 401) {
      router.replace('/desk/login')
      return
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      setRevokeError(copyForError(body))
      return
    }
    setDevices((prev) =>
      (prev ?? []).map((d) => (d.id === id ? { ...d, revoked_at: new Date().toISOString() } : d))
    )
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token)
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
          Devices
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
            Mint a gate device
          </h2>
          <form
            onSubmit={handleMint}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '14px',
            }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Gate label</span>
              <input
                required
                value={form.gateLabel}
                onChange={(e) => setForm((f) => ({ ...f, gateLabel: e.target.value }))}
                style={inputStyle}
                maxLength={40}
                placeholder="Main gate — lane 2"
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Volunteer name</span>
              <input
                required
                value={form.volunteerName}
                onChange={(e) => setForm((f) => ({ ...f, volunteerName: e.target.value }))}
                style={inputStyle}
                maxLength={60}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={labelStyle}>Scope</span>
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as CreateFormState['scope'] }))}
                style={inputStyle}
              >
                {DEVICE_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button type="submit" disabled={minting} className="hov-invert-grn" style={{ ...buttonStyle, opacity: minting ? 0.6 : 1 }}>
                {minting ? 'Minting…' : 'Mint device'}
              </button>
              {mintError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px', margin: 0 }}>{mintError}</p>}
            </div>
          </form>

          {justMinted && (
            <div
              style={{
                marginTop: '18px',
                border: '1px solid var(--grn,#00F5A5)',
                background: 'var(--grnbg,rgba(0,245,165,0.10))',
                padding: '12px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <p style={{ ...labelStyle, color: 'var(--grn,#00F5A5)' }}>
                {justMinted.gate_label} — shown once, copy it now
              </p>
              <code
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: '13px',
                  color: 'var(--ink,#F2EFE2)',
                  wordBreak: 'break-all',
                }}
              >
                {justMinted.token}
              </code>
              <button
                type="button"
                onClick={() => copyToken(justMinted.token)}
                className="hov-fill-grn"
                style={{ ...ghostButtonStyle, alignSelf: 'flex-start' }}
              >
                {copied ? 'Copied' : 'Copy token'}
              </button>
              <p style={{ ...labelStyle, marginTop: '2px' }}>
                This is the whole credential. It is not stored anywhere and cannot be shown again — only revoke
                and mint a new one if it is lost.
              </p>
            </div>
          )}
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
            All devices
          </h2>

          {loadError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{loadError}</p>}
          {revokeError && <p style={{ color: 'var(--bad,#FF6B5A)', fontSize: '13px' }}>{revokeError}</p>}
          {devices === null && !loadError && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>Loading…</p>
          )}
          {devices !== null && devices.length === 0 && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>No devices yet.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {devices?.map((d) => {
              const revoked = d.revoked_at !== null
              return (
                <div key={d.id} style={panelStyle}>
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
                        {d.gate_label}
                      </p>
                      <p style={{ ...labelStyle, marginTop: '4px' }}>
                        {d.token_hint}… · {d.scope} · {d.volunteer_name}
                        {revoked ? ' · revoked' : ''}
                      </p>
                    </div>
                    {!revoked && (
                      <button
                        type="button"
                        disabled={revokingId === d.id}
                        onClick={() => handleRevoke(d.id)}
                        className="hov-fill-bad"
                        style={{ ...dangerGhostButtonStyle, opacity: revokingId === d.id ? 0.6 : 1 }}
                      >
                        {revokingId === d.id ? 'Revoking…' : 'Revoke'}
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
