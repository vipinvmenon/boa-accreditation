'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type OrgRowWithCounts } from '@/lib/schemas/org'
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
 * live under each org row is retired with `/s/[token]`. Crew now register on
 * a Google Form (docs/ROSTER-FORM.md) and the importer matches the sheet's
 * free-text "Organisation" answer to `boa_acc_org.name`. So this screen's
 * job is now: show the canonical org names the import matches and the form's
 * dropdown (`ORGS` in scripts/roster-form/build-roster-form.gs) mirrors, show
 * how many people each org has sent, and hold the contact to chase. Quotas
 * were dropped 22 Sep (ACC-140g): `boa_acc_org.quota` stays in the schema but
 * nothing enforces it, so it is neither collected here nor shown below.
 *
 * Read-only, on Vipin's instruction (24 Sep), and the reason is worth keeping:
 * this screen used to open with a one-at-a-time "Create an org" form under an
 * "Allocation desk" heading — a name left over from when it allocated quotas.
 * Bhoopesh sends ~38 organisations at once, and the committed path for that is
 * data/orgs.json + scripts/replace-placeholder-orgs.mjs, which calls the same
 * `public.boa_acc_create_org` RPC and refuses to invent a missing contact
 * (docs/ORG-IMPORT.md). Two front doors for the same job, and the form was the
 * worse one — its own empty state pointed operators at it. Creation now lives
 * with the bulk list; this screen reads.
 *
 * `POST /api/desk/orgs` is deliberately left in place: it is the same RPC, it
 * is still authorised in the database, and nothing in the app calls it now.
 * Editing an org's contact from here would need a new RPC and a migration, so
 * it is not quietly bolted on — it is written up as the follow-up instead.
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
export function OrgsScreen() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgRowWithCounts[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

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
        const body = (await res.json()) as { orgs: OrgRowWithCounts[] }
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

  // ADR-019: `boa_acc_org.name` is what the Google Form's dropdown must
  // mirror (the `ORGS` array in scripts/roster-form/build-roster-form.gs —
  // see docs/ROSTER-FORM.md, "Keeping the form dropdown in step"). Copies
  // both the plain one-per-line list and the exact array literal, so Vipin
  // can paste whichever the script needs without retyping or reformatting.
  async function handleCopyOrgNames() {
    if (!orgs || orgs.length === 0) return
    const names = orgs.map((org) => org.name).sort((a, b) => a.localeCompare(b))
    const plain = names.join('\n')
    const arrayLiteral = `var ORGS = [${names.map((n) => `'${n.replaceAll("'", "\\'")}'`).join(', ')}];`
    const text = `${plain}\n\n${arrayLiteral}\n`
    try {
      await navigator.clipboard.writeText(text)
      setCopyStatus(`Copied ${names.length} organisation name${names.length === 1 ? '' : 's'} to the clipboard.`)
    } catch {
      setCopyStatus('Could not copy — clipboard access was denied.')
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="utility-screen">
      <div className="utility-inner">
        {!loadError && (
          <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>
        )}
        <header className="utility-head"><div><div className="tag">Import matching</div><h1 className="h1">Organisations</h1>
          <p className="lede">Every company sending crew, and how many they have sent. The importer refuses a row whose Organisation answer is not one of these names, so add a company <strong>before</strong> you send them the form link. Open one to see its people.</p>
        </div></header>

        <section>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              margin: '0 0 16px',
            }}
          >
            <h2
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
                color: 'var(--ink2,rgba(242,239,226,0.72))',
                margin: 0,
              }}
            >
              All orgs
            </h2>
            <button
              type="button"
              className="btn hov-invert-grn"
              disabled={!orgs || orgs.length === 0}
              onClick={() => void handleCopyOrgNames()}
              style={{ opacity: !orgs || orgs.length === 0 ? 0.6 : 1 }}
            >
              Copy names for the form dropdown
            </button>
          </div>
          {copyStatus && (
            <p role="status" style={{ ...labelStyle, margin: '0 0 12px' }}>
              {copyStatus}
            </p>
          )}

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
            <EmptyState message="No organisations yet. They are loaded in bulk from the list Bhoopesh sends, not typed in one at a time — an admin runs the import." />
          )}

          <div className="utility-list">
            {orgs?.map((org) => (
              /**
               * ADR-021: the row opens Master list filtered to this company,
               * rather than a per-org people screen. Master already searches,
               * filters by BMS state and shows band serials — a second table
               * would be a third place listing the same rows, which is the
               * duplication this ADR exists to end. The whole row is the
               * target, so it works on a phone.
               */
              <Link
                key={org.id}
                href={`/desk/master?org=${encodeURIComponent(org.id)}`}
                className="bz"
                style={{ display: 'block', textDecoration: 'none' }}
                aria-label={`${org.name} — show their people in the master list`}
              ><div className="pl pad">
                <div className="utility-row">
                  <div>
                    <p style={{ fontFamily: "'Oswald',sans-serif", fontSize: '17px', color: 'var(--ink,#F2EFE2)', margin: 0 }}>
                      {org.name}
                    </p>
                    <p style={{ ...labelStyle, marginTop: '4px' }}>
                      {org.kind} · sent {org.submittedCount} · approved {org.approvedCount} · {org.status} ·{' '}
                      {org.contact_name} · {org.contact_phone}
                    </p>
                  </div>
                  <span style={{ ...labelStyle, whiteSpace: 'nowrap' }} aria-hidden="true">
                    {org.submittedCount} {org.submittedCount === 1 ? 'person' : 'people'} &rarr;
                  </span>
                </div>
              </div></Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
