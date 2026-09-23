'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ORG_KINDS, type OrgRow } from '@/lib/schemas/org'
import { REQUESTABLE_TIERS, type RequestableTierCode } from '@/lib/desk-tiers'
import { UtilityScreenSkeleton } from '@/components/loading-skeleton'
import { EmptyState, InlineError } from '@/components/states'
import { copyForError } from '@/lib/error-copy'

/**
 * Not part of the approved design (design/source/boa_design_body.html has no
 * orgs screen — the 7 screens in scripts/visual-check.mjs's SCREENS are the
 * whole pixel contract), so this is built from the design's own tokens
 * (lib/design.ts / app/globals.css / app/desk/login/login-form.tsx's precedent),
 * not a transcription. Not gated by test:visual for the same reason.
 *
 * Per docs/ARCHITECTURE.md rule 1, this screen never imports the Supabase
 * client — every read and write goes through app/api/desk/orgs/** (which
 * holds lib/supabase-server.ts, the cookie-backed session client; the
 * service-role client, lib/supabase-admin.ts, is never involved here at all).
 * A 401 from any call means the session cookie is gone or never existed, so
 * this redirects to /desk/login rather than rendering a broken screen.
 *
 * ADR-019 (22 Sep, Vipin): the invite-link list/mint/revoke UI that used to
 * live under each org row is retired with `/s/[token]`. This screen is kept —
 * it is how the admin creates real organisations, which ADR-019/ACC-140c
 * still needs — and the nav now calls it "Organisations" (lib/design.ts).
 */
// ACC-122: shared with every other desk screen via lib/error-copy.ts; this
// screen's `not_authorized` and `not_found` wording differ from the default.
const ORGS_ERROR_OVERRIDES = {
  not_authorized: 'Only a lead or admin operator can do this.',
  not_found: 'That org no longer exists.',
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

  const [announcement, setAnnouncement] = useState('Loading organisations.')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadOrgs() {
      try {
        const res = await fetch('/api/desk/orgs')
        if (cancelled) return
        if (res.status === 401) {
          router.replace('/desk/login')
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const message = copyForError(body, ORGS_ERROR_OVERRIDES)
          if (!cancelled) {
            setLoadError(message)
            setAnnouncement(`Could not load organisations. ${message}`)
          }
          return
        }
        const body = (await res.json()) as { orgs: OrgRow[] }
        if (cancelled) return
        setOrgs(body.orgs)
        setLoadError(null)
        setAnnouncement('Organisations loaded.')
      } catch {
        // A thrown fetch (network down) is still an error state, not an
        // indefinite skeleton.
        if (!cancelled) {
          const message = copyForError(null, ORGS_ERROR_OVERRIDES)
          setLoadError(message)
          setAnnouncement(`Could not load organisations. ${message}`)
        }
      }
    }
    void loadOrgs()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
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
      if (res.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        const message = copyForError(body, ORGS_ERROR_OVERRIDES)
        setCreateError(message)
        setAnnouncement(`Could not create organisation. ${message}`)
        return
      }
      const body = (await res.json()) as { org: OrgRow }
      setOrgs((prev) => [body.org, ...(prev ?? [])])
      setForm(EMPTY_FORM)
      setAnnouncement(`Organisation ${body.org.name} created.`)
    } catch {
      const message = copyForError(null, ORGS_ERROR_OVERRIDES)
      setCreateError(message)
      setAnnouncement(`Could not create organisation. ${message}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="utility-screen">
      <div className="utility-inner">
        {!createError && !loadError && (
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

          {loadError && (
            <InlineError
              className="utility-error"
              message={loadError}
              onRetry={() => { setLoadError(null); setOrgs(null); setReloadKey((k) => k + 1) }}
            />
          )}
          {orgs === null && !loadError && (
            <div role="status" aria-label="Loading organisations"><UtilityScreenSkeleton kind="orgs" /></div>
          )}
          {orgs !== null && orgs.length === 0 && (
            <EmptyState message="No orgs yet. Create the first one above." />
          )}

          <div className="utility-list">
            {orgs?.map((org) => (
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
                </div>
              </div></div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
