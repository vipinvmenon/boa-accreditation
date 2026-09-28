'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { orgRowWithCountsSchema, type OrgRowWithCounts } from '@/lib/schemas/org'
import { copyForError } from '@/lib/error-copy'
import { loginHref } from '@/gate/session'
import { Icon } from '@/components/icon'
import { Button, CountDot, FilterBar, StatusPill } from '@/components/r10/primitives-a'
import { EmptyState, Skeleton } from '@/components/r10/primitives-b'

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

const orgResponseSchema = orgRowWithCountsSchema.array()

function statusKind(status: string): 'ok' | 'wait' | 'bad' | 'mute' {
  if (status === 'open' || status === 'approved') return 'ok'
  if (status === 'rejected' || status === 'voided') return 'bad'
  if (status === 'submitted') return 'wait'
  return 'mute'
}
export function OrgsScreen() {
  const router = useRouter()
  const [orgs, setOrgs] = useState<OrgRowWithCounts[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const [announcement, setAnnouncement] = useState('Loading organisations.')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function loadOrgs() {
      try {
        const res = await fetch('/api/desk/orgs')
        if (cancelled) return
        if (res.status === 401) {
          router.replace(loginHref(window.location.pathname + window.location.search))
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
        const body: unknown = await res.json()
        const parsed = typeof body === 'object' && body !== null && 'orgs' in body
          ? orgResponseSchema.safeParse(body.orgs)
          : { success: false as const }
        if (!parsed.success) {
          const message = copyForError(null, ORGS_ERROR_OVERRIDES)
          if (!cancelled) {
            setLoadError(message)
            setAnnouncement(`Could not load organisations. ${message}`)
          }
          return
        }
        if (cancelled) return
        setOrgs(parsed.data)
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

  const visibleOrgs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!orgs || !needle) return orgs ?? []
    return orgs.filter((org) =>
      [org.name, org.contact_name, org.kind].some((value) => value.toLocaleLowerCase().includes(needle)),
    )
  }, [orgs, query])

  return (
    <main id="main-content" tabIndex={-1} className="orgs-screen">
      {!loadError && <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>}
      <header className="orgs-head">
        <div>
          <p className="label gold">Import matching</p>
          <h1 className="display-lg">Organisations</h1>
          <p className="lede">Every company sending people. Open one to see them in the Master list.</p>
          <p className="body-sm ink-2 orgs-help">
            Organisations are added from <code>data/orgs.json</code> with <code>scripts/replace-placeholder-orgs.mjs</code>;
            see <code>docs/ORG-IMPORT.md</code> before you send the form link.
          </p>
        </div>
        <Button variant="ghost" disabled={!orgs || orgs.length === 0} onClick={() => void handleCopyOrgNames()}>
          <Icon name="paper-plane-tilt" /> Copy names for the form
        </Button>
      </header>

      <FilterBar
        className="orgs-filterbar"
        searchValue={query}
        onSearchChange={setQuery}
        searchLabel="Search organisations"
        searchPlaceholder="Organisation or contact name"
        onClearAll={() => setQuery('')}
        resultCount={orgs ? <><strong>{visibleOrgs.length}</strong> of {orgs.length}</> : undefined}
      />

      {copyStatus && <p className="orgs-copy-status" role="status">{copyStatus}</p>}
      {loadError && (
        <EmptyState error title="The list didn’t load" icon={<Icon name="x" />}>
          <p>{loadError}</p>
          <Button onClick={() => { setLoadError(null); setOrgs(null); setReloadKey((key) => key + 1) }}>
            Try again <Icon name="arrow-right" />
          </Button>
        </EmptyState>
      )}
      {orgs === null && !loadError && (
        <div className="orgs-table card" role="status" aria-label="Loading organisations" aria-busy="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="org-row org-row-skeleton" key={index}>
              <div><Skeleton style={{ width: `${45 + (index % 3) * 15}%` }} /><Skeleton style={{ width: '32%', marginTop: 'var(--s-2)' }} /></div>
              <Skeleton shape="num" /><Skeleton shape="pill" /><Skeleton style={{ width: '70%' }} /><Skeleton shape="dot" />
            </div>
          ))}
        </div>
      )}
      {orgs !== null && orgs.length === 0 && (
        <EmptyState title="No organisations yet" icon={<Icon name="plus" />}>
          Organisations appear here as soon as people are imported from the response sheet.
        </EmptyState>
      )}
      {orgs !== null && orgs.length > 0 && visibleOrgs.length === 0 && (
        <EmptyState title="No organisations match" icon={<Icon name="magnifying-glass" />}>
          <p>Try the organisation’s name or its contact.</p>
          <Button variant="ghost" onClick={() => setQuery('')}>Clear search</Button>
        </EmptyState>
      )}
      {orgs !== null && visibleOrgs.length > 0 && (
        <div className="orgs-table card" role="table" aria-label="Organisations">
          <div className="orgs-thead" role="row">
            <span role="columnheader">Organisation</span><span role="columnheader">People</span>
            <span role="columnheader">Status</span><span role="columnheader">Contact</span>
            <span role="columnheader"><span className="sr-only">Open</span></span>
          </div>
          <div role="rowgroup">
            {visibleOrgs.map((org) => (
              <Link key={org.id} href={`/desk/master?org=${encodeURIComponent(org.id)}`} className="org-row" role="row" aria-label={`${org.name} — show their people in the master list`}>
                <span role="cell"><strong className="display-sm nm">{org.name}</strong><span className="body-sm ink-2">{org.kind}</span></span>
                <span role="cell" className="org-counts">
                  <span><CountDot label={`${org.submittedCount} sent`}>{org.submittedCount}</CountDot><span>sent</span></span>
                  <span><CountDot label={`${org.approvedCount} approved`}>{org.approvedCount}</CountDot><span>approved</span></span>
                </span>
                <span role="cell"><StatusPill className={`st ${statusKind(org.status)}`} status={statusKind(org.status)}>{org.status}</StatusPill></span>
                <span role="cell" className="org-contact"><span>{org.contact_name}</span><span className="mono ink-2">{org.contact_phone}</span></span>
                <span role="cell" className="org-arrow"><Icon name="arrow-right" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <style jsx global>{`
        .r10 .orgs-screen { padding-block: var(--s-10) var(--s-20); }
        .r10 .orgs-head { display: flex; align-items: end; justify-content: space-between; gap: var(--s-8); margin-bottom: var(--s-8); }
        .r10 .orgs-head h1 { margin: var(--s-2) 0 var(--s-3); }
        .r10 .orgs-help { max-width: 700px; margin: var(--s-4) 0 0; }
        .r10 .orgs-help code { color: var(--ink); }
        .r10 .orgs-filterbar { margin-bottom: var(--s-5); }
        .r10 .orgs-copy-status { color: var(--ink-2); margin: 0 0 var(--s-4); }
        .r10 .orgs-table { overflow: hidden; }
        .r10 .orgs-thead, .r10 .org-row { display: grid; grid-template-columns: minmax(220px, 2fr) minmax(150px, 1.2fr) minmax(120px, .8fr) minmax(190px, 1.4fr) 44px; align-items: center; gap: var(--s-4); padding-inline: var(--s-6); }
        .r10 .orgs-thead { min-height: 48px; color: var(--ink-3); font: 600 var(--t-label)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; box-shadow: inset 0 -1px 0 var(--hair); }
        .r10 .org-row { min-height: 72px; padding-block: var(--s-3); color: inherit; text-decoration: none; box-shadow: inset 0 -1px 0 var(--hair); transition: background-color var(--d-quick) var(--e-hover), transform var(--d-quick) var(--e-hover); }
        .r10 .org-row:last-child { box-shadow: none; }
        .r10 .org-row:hover { background: var(--raised); transform: translateX(2px); }
        .r10 .org-row:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
        .r10 .org-row > span:first-child, .r10 .org-contact, .r10 .org-counts { display: grid; gap: var(--s-1); }
        .r10 .org-counts { grid-template-columns: repeat(2, minmax(64px, 1fr)); gap: var(--s-2); }
        .r10 .org-counts > span { display: inline-flex; align-items: center; gap: var(--s-2); color: var(--ink-2); font-size: var(--t-body-sm); }
        .r10 .org-arrow { justify-self: end; color: var(--ink-3); font-size: 20px; }
        .r10 .org-row:hover .org-arrow, .r10 .org-row:focus-visible .org-arrow { color: var(--ink); }
        .r10 .org-row-skeleton { pointer-events: none; }
        .r10 .org-row-skeleton > :last-child { justify-self: end; }
        @media (max-width: 700px) {
          .r10 .orgs-screen { padding-block: var(--s-6) var(--s-10); }
          .r10 .orgs-head { align-items: start; flex-direction: column; gap: var(--s-5); margin-bottom: var(--s-6); }
          .r10 .orgs-head .btn { width: 100%; }
          .r10 .orgs-thead { display: none; }
          .r10 .org-row { grid-template-columns: 1fr 44px; gap: var(--s-2); padding-inline: var(--s-5); }
          .r10 .org-row > :nth-child(2), .r10 .org-row > :nth-child(3), .r10 .org-row > :nth-child(4) { grid-column: 1; }
          .r10 .org-row > :nth-child(2) { grid-row: 2; }
          .r10 .org-row > :nth-child(3) { grid-row: 3; }
          .r10 .org-row > :nth-child(4) { grid-row: 4; }
          .r10 .org-row > :last-child { grid-column: 2; grid-row: 1 / span 4; }
          .r10 .org-counts { display: flex; flex-wrap: wrap; }
        }
        @media (prefers-reduced-transparency: reduce) {
          .r10 .orgs-table { background: var(--surface-solid); backdrop-filter: none; }
        }
        @media (prefers-reduced-motion: reduce) { .r10 .org-row { transition: none; } }
      `}</style>
    </main>
  )
}
