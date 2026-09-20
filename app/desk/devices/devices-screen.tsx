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

const labelStyle: React.CSSProperties = {
  fontFamily: "'JetBrains Mono',monospace",
  fontSize: '9.5px',
  fontWeight: 700,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
  color: 'var(--ink3,rgba(242,239,226,0.52))',
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
    <main className="utility-screen">
      <div className="utility-inner">
        <header className="utility-head"><div><div className="tag">Gate access</div><h1 className="h1">Devices</h1></div></header>

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
            Mint a gate device
          </h2>
          <form onSubmit={handleMint} className="utility-form cols">
            <label className="utility-label">
              <span>Gate label</span>
              <input
                required
                value={form.gateLabel}
                onChange={(e) => setForm((f) => ({ ...f, gateLabel: e.target.value }))}
                className="utility-input"
                maxLength={40}
                placeholder="Main gate — lane 2"
              />
            </label>
            <label className="utility-label">
              <span>Volunteer name</span>
              <input
                required
                value={form.volunteerName}
                onChange={(e) => setForm((f) => ({ ...f, volunteerName: e.target.value }))}
                className="utility-input"
                maxLength={60}
              />
            </label>
            <label className="utility-label">
              <span>Scope</span>
              <select
                value={form.scope}
                onChange={(e) => setForm((f) => ({ ...f, scope: e.target.value as CreateFormState['scope'] }))}
                className="utility-input"
              >
                {DEVICE_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <div className="utility-actions full">
              <button type="submit" disabled={minting} className="btn go hov-invert-grn" style={{ opacity: minting ? 0.6 : 1 }}>
                {minting ? 'Minting…' : 'Mint device'}
              </button>
              {mintError && <p role="alert" className="utility-error">{mintError}</p>}
            </div>
          </form>

          {justMinted && (
            <div className="utility-notice">
              <p style={{ ...labelStyle, color: 'var(--grn,#00F5A5)' }}>
                {justMinted.gate_label} — shown once, copy it now
              </p>
              <code
                className="utility-code"
              >
                {justMinted.token}
              </code>
              <button
                type="button"
                onClick={() => copyToken(justMinted.token)}
                className="btn solo"
              >
                {copied ? 'Copied' : 'Copy token'}
              </button>
              <p style={{ ...labelStyle, marginTop: '2px' }}>
                This is the whole credential. It is not stored anywhere and cannot be shown again — only revoke
                and mint a new one if it is lost.
              </p>
            </div>
          )}
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
            All devices
          </h2>

          {loadError && <p role="alert" className="utility-error">{loadError}</p>}
          {revokeError && <p role="alert" className="utility-error">{revokeError}</p>}
          {devices === null && !loadError && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>Loading…</p>
          )}
          {devices !== null && devices.length === 0 && (
            <p style={{ color: 'var(--ink3,rgba(242,239,226,0.52))', fontSize: '13px' }}>No devices yet.</p>
          )}

          <div className="utility-list">
            {devices?.map((d) => {
              const revoked = d.revoked_at !== null
              return (
                <div key={d.id} className="bz"><div className="pl pad utility-row">
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
                        className="btn bad solo hov-fill-bad"
                        style={{ opacity: revokingId === d.id ? 0.6 : 1 }}
                      >
                        {revokingId === d.id ? 'Revoking…' : 'Revoke'}
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
