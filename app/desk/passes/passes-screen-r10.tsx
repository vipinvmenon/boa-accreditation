'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Chip, CountDot, EmptyState, FilterBar, HoldButton, Sheet, Skeleton, StatusPill, Table, TableCell } from '@/components/r10'
import { Icon } from '@/components/icon'
import { PassTicket } from '@/components/pass-ticket'
import { passesResponseSchema, type Pass } from '@/lib/schemas/pass'
import { copyForError } from '@/lib/error-copy'
import { loginHref } from '@/gate/session'
import {
  passSendsResponseSchema,
  sendRequestSchema,
  sendResponseSchema,
  type PassSendsResponse,
  type SendResult,
} from './send-schema'

type SendTone = 'ok' | 'wait' | 'bad' | 'mute'
type Filter = 'unsent' | 'failed'
type PassWithQr = Pass & { qrSvg: string }

const SEND_COPY: Record<string, { label: string; tone: SendTone }> = {
  queued: { label: 'Queued', tone: 'wait' },
  sent: { label: 'Sent', tone: 'wait' },
  delivered: { label: 'Delivered', tone: 'ok' },
  read: { label: 'Read', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
}

const SEND_ERROR_OVERRIDES = {
  not_authorized: 'Only a lead or admin can send passes.',
  not_authenticated: 'Your session has ended. Log in again.',
}

function statusFor(status: string | undefined): { label: string; tone: SendTone } {
  return (status ? SEND_COPY[status] : undefined) ?? { label: 'Not sent', tone: 'mute' }
}

function waMeLink(phone: string, fullName: string, passToken: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? ''
  const text = `Hi ${firstName}, here is your Bangalore Open Air crew pass. Show this QR at the accreditation desk with a photo ID: ${window.location.origin}/p/${passToken}`
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

export function PassesScreenR10() {
  const router = useRouter()
  const [passes, setPasses] = useState<PassWithQr[]>([])
  const [sends, setSends] = useState<PassSendsResponse | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter | null>(null)
  const [selected, setSelected] = useState<PassWithQr | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastResults, setLastResults] = useState<SendResult[]>([])
  const rootRef = useRef<HTMLElement>(null)

  const loadSends = useCallback(async () => {
    try {
      const response = await fetch('/api/desk/passes/send')
      if (!response.ok) return
      const parsed = passSendsResponseSchema.safeParse(await response.json())
      if (parsed.success) setSends(parsed.data)
    } catch {
      // The pass list remains useful when delivery state is unavailable.
    }
  }, [])

  const loadPasses = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/desk/passes')
      if (response.status === 401) {
        router.replace(loginHref(window.location.pathname + window.location.search))
        return
      }
      if (!response.ok) throw new Error('request_failed')
      const parsed = passesResponseSchema.safeParse(await response.json())
      if (!parsed.success) throw new Error('invalid_response')
      setPasses(parsed.data.passes)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPasses()
      void loadSends()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadPasses, loadSends])

  const sendByPerson = useMemo(
    () => new Map((sends?.people ?? []).map((person) => [person.personId, person])),
    [sends],
  )
  const unsent = useMemo(
    () => passes.filter((pass) => !sendByPerson.get(pass.id)?.live),
    [passes, sendByPerson],
  )
  const failed = useMemo(
    () => passes.filter((pass) => sendByPerson.get(pass.id)?.last?.status === 'failed'),
    [passes, sendByPerson],
  )
  const filteredPasses = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return passes.filter((pass) => {
      const matchesQuery = !needle || [pass.fullName, pass.orgName, pass.role, pass.passRef]
        .some((value) => value.toLowerCase().includes(needle))
      const matchesFilter = filter === null
        || (filter === 'unsent' && unsent.some((item) => item.id === pass.id))
        || (filter === 'failed' && failed.some((item) => item.id === pass.id))
      return matchesQuery && matchesFilter
    })
  }, [failed, filter, passes, query, unsent])

  const canSend = Boolean(sends?.canSend && sends.configured)

  async function send(request: { mode: 'all' } | { mode: 'one'; personId: string; resend: boolean }, key: string) {
    const parsedRequest = sendRequestSchema.safeParse(request)
    if (!parsedRequest.success) return
    setBusy(key)
    setNotice(null)
    const collected: SendResult[] = []
    try {
      for (let round = 0; round < 20; round += 1) {
        const response = await fetch('/api/desk/passes/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedRequest.data),
        })
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          setNotice(copyForError(body, { ...SEND_ERROR_OVERRIDES, internal: 'Sending failed. Try again.' }))
          break
        }
        const parsed = sendResponseSchema.safeParse(await response.json())
        if (!parsed.success) {
          setNotice('Unexpected response from the server.')
          break
        }
        collected.push(...parsed.data.results)
        if (parsed.data.remaining === 0 || parsed.data.results.length === 0) break
      }
      if (collected.length > 0) {
        const accepted = collected.filter((result) => result.outcome === 'queued').length
        setNotice(`${accepted} of ${collected.length} accepted by WhatsApp.`)
      }
    } catch {
      setNotice('Network error. Nothing more was sent.')
    } finally {
      setLastResults(collected.filter((result) => result.outcome !== 'queued'))
      setBusy(null)
      await loadSends()
    }
  }

  function sendOne(pass: PassWithQr, resend: boolean) {
    setConfirmResend(false)
    void send({ mode: 'one', personId: pass.id, resend }, pass.id)
  }

  function openPass(pass: PassWithQr) {
    setSelected(pass)
    setConfirmResend(false)
  }

  function closePass() {
    setSelected(null)
    setConfirmResend(false)
  }

  const selectedSend = selected ? sendByPerson.get(selected.id) : undefined
  const status = statusFor(selectedSend?.last?.status)
  const nameOf = (id: string) => passes.find((pass) => pass.id === id)?.fullName ?? 'Unknown'

  return (
    <main id="main-content" tabIndex={-1} ref={rootRef} className="r10 passes-page">
      <header className="passes-head">
        <div>
          <span className="tag">The pass</span>
          <h1 className="display-lg">Pass sheet</h1>
          <p className="lede">One card per approved person. Open a pass to review its ticket and delivery state.</p>
          {sends && !sends.configured && <p className="mono passes-note">WhatsApp is not configured yet. Use each pass&apos;s one-tap link.</p>}
          {notice && <p role="status" className="mono passes-note">{notice}</p>}
        </div>
        <div className="passes-actions">
          <Button
            variant="primary"
            onClick={() => setConfirmAll(true)}
            disabled={!canSend || unsent.length === 0 || busy !== null}
            title={sends && !sends.canSend ? 'Only a lead or admin can send passes' : undefined}
          >
            Send all unsent <CountDot label="Unsent passes">{unsent.length}</CountDot>
            <span className="ic"><Icon name="paper-plane-tilt" /></span>
          </Button>
        </div>
      </header>

      {(failed.length > 0 || lastResults.length > 0) && (
        <section className="passes-failures" aria-label="WhatsApp failures">
          <StatusPill status="bad">Not delivered</StatusPill>
          <ul>
            {failed.map((person) => (
              <li key={person.id}><b>{person.fullName}</b><span className="mono">{sendByPerson.get(person.id)?.last?.failureReason ?? 'Failed'}</span></li>
            ))}
            {lastResults.filter((result) => !failed.some((person) => person.id === result.personId)).map((result) => (
              <li key={result.personId}><b>{nameOf(result.personId)}</b><span className="mono">{result.reason ?? result.outcome}</span></li>
            ))}
          </ul>
        </section>
      )}

      <FilterBar
        searchValue={query}
        onSearchChange={(value) => setQuery(value)}
        searchPlaceholder="Name, organisation or pass ref"
        searchLabel="Search passes"
        activeFilters={filter ? [{ id: filter, label: filter === 'unsent' ? 'Not sent' : 'Failed', onRemove: () => setFilter(null) }] : []}
        onClearAll={() => { setFilter(null); setQuery('') }}
        resultCount={<><strong>{filteredPasses.length}</strong> of {passes.length}</>}
      >
        <div className="chips passes-presets" aria-label="Pass presets">
          <Chip preset count={unsent.length} onActivate={() => setFilter('unsent')}>Not sent</Chip>
          <Chip preset count={failed.length} onActivate={() => setFilter('failed')}>Failed</Chip>
        </div>
      </FilterBar>

      {loading && (
        <section className="passes-loading" aria-busy="true" aria-label="Loading passes">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} shape="line" className="passes-loading-line" />)}
        </section>
      )}
      {!loading && error && (
        <EmptyState title="The list did not load" error>
          Your connection or the server stopped answering.
          <Button onClick={() => void loadPasses()}>Try again</Button>
        </EmptyState>
      )}
      {!loading && !error && passes.length === 0 && (
        <EmptyState title="No approved passes yet">
          People appear here as soon as they are approved in the response sheet.
        </EmptyState>
      )}
      {!loading && !error && passes.length > 0 && filteredPasses.length === 0 && (
        <EmptyState title="No one matches">
          Try a different search or clear the filter.
          <Button onClick={() => { setFilter(null); setQuery('') }}>Clear filters</Button>
        </EmptyState>
      )}
      {!loading && !error && filteredPasses.length > 0 && (
        <Table label="Approved passes" className="passes-table" columns={[
          { key: 'person', label: 'Person' },
          { key: 'tier', label: 'Tier' },
          { key: 'whatsapp', label: 'WhatsApp' },
          { key: 'action', label: '' },
        ]}>
          {filteredPasses.map((pass) => {
            const sendState = sendByPerson.get(pass.id)
            const sendStatus = statusFor(sendState?.last?.status)
            return (
              <div
                key={pass.id}
                className="tr passes-row pass-item"
                role="row"
                tabIndex={0}
                onClick={() => openPass(pass)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPass(pass) } }}
              >
                <TableCell><button type="button" className="passes-person" onClick={() => openPass(pass)}><strong>{pass.fullName}</strong><span>{pass.orgName} · {pass.role}</span></button></TableCell>
                <TableCell className="passes-tier">{pass.typeCode}</TableCell>
                <TableCell><StatusPill status={sendStatus.tone}>{sendStatus.label}</StatusPill></TableCell>
                <TableCell className="cell-r"><Button variant="sm" onClick={(event) => { event.stopPropagation(); openPass(pass) }}>Open</Button></TableCell>
              </div>
            )
          })}
        </Table>
      )}

      <Sheet open={selected !== null} onClose={closePass} title={selected ? selected.fullName : undefined} className="passes-sheet">
        {selected && (
          <>
            <div className="passes-ticket"><PassTicket {...selected} variant="sheet" /></div>
            <div className="passes-sheet-status"><StatusPill status={status.tone}>{status.label}</StatusPill></div>
          </>
        )}
        {selected && (
          <div className="passes-sheet-actions">
            {confirmResend ? (
              <>
                <p className="body-sm">This pass was already sent. Send it again?</p>
                <Button variant="primary" onClick={() => sendOne(selected, true)} disabled={busy !== null}>Send again</Button>
                <Button variant="ghost" onClick={() => setConfirmResend(false)}>Cancel</Button>
              </>
            ) : (
              <>
                <Button variant={selectedSend?.live ? 'default' : 'primary'} onClick={() => selectedSend?.live ? setConfirmResend(true) : sendOne(selected, false)} disabled={!canSend || busy !== null}>
                  {busy === selected.id ? 'Sending' : selectedSend?.live ? 'Resend' : 'Send pass'}
                  <span className="ic"><Icon name="paper-plane-tilt" /></span>
                </Button>
                {selectedSend && <a className="btn btn-ghost" href={waMeLink(selectedSend.phone, selected.fullName, selected.passToken)} target="_blank" rel="noopener noreferrer">One-tap WhatsApp</a>}
              </>
            )}
          </div>
        )}
      </Sheet>

      <Sheet open={confirmAll} onClose={() => setConfirmAll(false)} title={`Send ${unsent.length} unsent passes`} className="passes-confirm-sheet">
        <p>Review the count before sending each unsent pass through WhatsApp.</p>
        <ul className="passes-confirm-list">
          {unsent.slice(0, 5).map((pass) => <li key={pass.id}>{pass.fullName}<span>{pass.orgName}</span></li>)}
          {unsent.length > 5 && <li className="ink-3">And {unsent.length - 5} more</li>}
        </ul>
        <div className="passes-confirm-actions">
          <HoldButton variant="primary" onDone={() => { setConfirmAll(false); void send({ mode: 'all' }, 'all') }} disabled={!canSend || busy !== null}>
            Hold to send {unsent.length}
          </HoldButton>
          <Button variant="ghost" onClick={() => setConfirmAll(false)}>Cancel</Button>
        </div>
      </Sheet>
      <style>{`
        .passes-page { container: passes / inline-size; }
        .passes-head { display: flex; align-items: end; justify-content: space-between; gap: var(--s-8); margin-bottom: var(--s-8); }
        .passes-head h1 { margin: var(--s-3) 0 var(--s-4); }
        .passes-head .lede { max-width: 62ch; margin: 0; }
        .passes-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: var(--s-3); }
        .passes-note { margin: var(--s-3) 0 0; color: var(--ink-2); }
        .passes-presets { margin-left: auto; }
        .passes-table { --cols: minmax(220px, 2.4fr) minmax(110px, .9fr) minmax(170px, 1.3fr) 96px; }
        .passes-row { cursor: pointer; }
        .passes-row:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
        .passes-person { display: grid; min-height: var(--hit); align-content: center; justify-items: start; padding: 0; border: 0; background: none; color: inherit; text-align: left; cursor: pointer; }
        .passes-person strong { font: 600 14.5px/1.2 var(--f-label); letter-spacing: .02em; text-transform: uppercase; }
        .passes-person span { margin-top: 2px; color: var(--ink-3); font-size: var(--t-body-sm); }
        .passes-tier { color: var(--ink-2); font: 600 var(--t-label)/1 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .passes-failures { display: flex; flex-wrap: wrap; align-items: start; gap: var(--s-3) var(--s-5); margin-bottom: var(--s-6); padding: var(--s-4) var(--s-5); border-radius: var(--r-md); box-shadow: inset 0 0 0 1px var(--hair); }
        .passes-failures ul { flex: 1 1 320px; display: grid; gap: var(--s-2); margin: 0; padding: 0; list-style: none; }
        .passes-failures li { display: flex; flex-wrap: wrap; gap: var(--s-3); align-items: baseline; }
        .passes-failures li .mono { color: var(--bad); }
        .passes-loading { display: grid; gap: var(--s-4); padding: var(--s-6); }
        .passes-loading-line { width: 100%; height: 56px; border-radius: var(--r-sm); }
        .passes-ticket { margin-bottom: var(--s-6); }
        .passes-sheet-status { margin-bottom: var(--s-4); }
        .passes-sheet-actions, .passes-confirm-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); }
        .passes-sheet-actions p { flex: 1 1 100%; margin: 0; color: var(--ink-2); }
        .passes-confirm-list { display: grid; gap: var(--s-2); margin: var(--s-6) 0; padding: 0; list-style: none; }
        .passes-confirm-list li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--s-3); padding-bottom: var(--s-2); box-shadow: inset 0 -1px 0 var(--hair); }
        .passes-confirm-list span { color: var(--ink-3); }
        @media (max-width: 700px) {
          .passes-head { display: block; margin-bottom: var(--s-6); }
          .passes-actions { justify-content: start; margin-top: var(--s-5); }
          .passes-actions .btn { width: 100%; }
          .passes-presets { margin-left: 0; }
          .passes-table { --cols: 1fr auto; }
          .passes-table .passes-tier, .passes-table .cell-r { display: none; }
          .passes-table .tr { min-height: 72px; }
        }
        @media (prefers-reduced-transparency: reduce) {
          .passes-page .passes-failures { background: var(--surface-solid); }
        }
      `}</style>
    </main>
  )
}
