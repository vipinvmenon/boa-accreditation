'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { TIERS, tier, tierColour } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { Button, Chip, EmptyState, HoldButton, Sheet, Skeleton, Table, TableCell } from '@/components/r10'
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
type FieldKey = 'send' | 'tier' | 'org'
type Filters = Partial<Record<FieldKey, string[]>>
type PassWithQr = Pass & { qrSvg: string }
type ToastState = { id: number; text: string; bad: boolean; icon: 'check-circle' | 'warning-circle' }

const PAGE = 60
const FIELD_KEYS: FieldKey[] = ['send', 'tier', 'org']
const FIELD_LABEL: Record<FieldKey, string> = { send: 'WhatsApp', tier: 'Tier', org: 'Organisation' }
const PRESETS: Array<{ label: string; filters: Filters }> = [
  { label: 'Not sent', filters: { send: ['none'] } },
  { label: 'Failed', filters: { send: ['failed'] } },
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SEND_COPY: Record<string, { label: string; tone: SendTone }> = {
  none: { label: 'Not sent', tone: 'mute' },
  queued: { label: 'Queued', tone: 'wait' },
  sent: { label: 'Sent', tone: 'wait' },
  delivered: { label: 'Delivered', tone: 'ok' },
  read: { label: 'Read', tone: 'ok' },
  failed: { label: 'Failed', tone: 'bad' },
}
const SEND_ORDER = ['none', 'queued', 'sent', 'delivered', 'read', 'failed']

const SEND_ERROR_OVERRIDES = {
  not_authorized: 'Only a lead or admin can send passes.',
  not_authenticated: 'Your session has ended. Log in again.',
}

function statusFor(status: string | undefined): { label: string; tone: SendTone } {
  return SEND_COPY[status ?? 'none'] ?? { label: 'Not sent', tone: 'mute' }
}

/** "27 Sep, 14:03" in festival time, whatever the operator's laptop says. */
function sentStamp(iso: string | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const hour = get('hour') === '24' ? '00' : get('hour')
  return `${get('day')} ${MONTHS[Number(get('month')) - 1] ?? ''}, ${hour}:${get('minute')}`
}

function waMeLink(phone: string, fullName: string, passToken: string): string {
  const firstName = fullName.trim().split(/\s+/)[0] ?? ''
  const text = `Hi ${firstName}, here is your Bangalore Open Air crew pass. Show this QR at the accreditation desk with a photo ID: ${window.location.origin}/p/${passToken}`
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

function readUrlState(): { query: string; filters: Filters } {
  const params = new URLSearchParams(window.location.search)
  const filters: Filters = {}
  for (const key of FIELD_KEYS) {
    const value = params.get(key)
    if (value) filters[key] = value.split(',').filter(Boolean)
  }
  return { query: params.get('q') ?? '', filters }
}

export function PassesScreenR10() {
  const theme = useDomTheme()
  const router = useRouter()
  const [passes, setPasses] = useState<PassWithQr[]>([])
  const [sends, setSends] = useState<PassSendsResponse | null>(null)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({})
  const [shown, setShown] = useState(PAGE)
  const [menu, setMenu] = useState<{ field: FieldKey | null } | null>(null)
  const [selected, setSelected] = useState<PassWithQr | null>(null)
  const [confirmAll, setConfirmAll] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const urlReady = useRef(false)

  const showToast = useCallback((text: string, bad = false) => {
    setToast({ id: Date.now(), text, bad, icon: bad ? 'warning-circle' : 'check-circle' })
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

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
      const initial = readUrlState()
      setQuery(initial.query)
      setFilters(initial.filters)
      urlReady.current = true
      void loadPasses()
      void loadSends()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadPasses, loadSends])

  // The mockup keeps the search and filters in the URL, so a filtered view can be shared.
  useEffect(() => {
    if (!urlReady.current) return
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    for (const key of FIELD_KEYS) {
      const values = filters[key]
      if (values && values.length > 0) params.set(key, values.join(','))
    }
    const search = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`)
  }, [filters, query])

  const sendByPerson = useMemo(
    () => new Map((sends?.people ?? []).map((person) => [person.personId, person])),
    [sends],
  )
  const sendKey = useCallback((pass: Pass) => sendByPerson.get(pass.id)?.last?.status ?? 'none', [sendByPerson])
  const unsent = useMemo(
    () => passes.filter((pass) => !sendByPerson.get(pass.id)?.live),
    [passes, sendByPerson],
  )
  const failed = useMemo(
    () => passes.filter((pass) => sendKey(pass) === 'failed'),
    [passes, sendKey],
  )

  const valueOf = useCallback((pass: Pass, field: FieldKey) => (
    field === 'send' ? sendKey(pass) : field === 'tier' ? pass.typeCode : pass.orgName
  ), [sendKey])
  const matches = useCallback((pass: Pass, active: Filters) => (
    FIELD_KEYS.every((field) => {
      const values = active[field]
      return !values || values.length === 0 || values.includes(valueOf(pass, field))
    })
  ), [valueOf])

  const options = useMemo(() => {
    const count = (field: FieldKey, value: string) => passes.filter((pass) => valueOf(pass, field) === value).length
    const send = SEND_ORDER
      .map((value) => ({ value, label: SEND_COPY[value]?.label ?? value, n: count('send', value), colour: undefined as string | undefined }))
    const tiers = TIERS
      .map((item) => ({ value: item.code as string, label: item.label, n: count('tier', item.code), colour: tierColour(item.code, theme) as string | undefined }))
    const orgNames = Array.from(new Set(passes.map((pass) => pass.orgName))).sort((a, b) => a.localeCompare(b))
    const orgs = orgNames.map((name) => ({ value: name, label: name, n: count('org', name), colour: undefined as string | undefined }))
    return { send, tier: tiers, org: orgs } satisfies Record<FieldKey, unknown>
  }, [passes, theme, valueOf])
  const visibleOptions = (field: FieldKey) => options[field].filter((option) => option.n > 0)
  const labelFor = (field: FieldKey, value: string) => options[field].find((option) => option.value === value)?.label ?? value

  const filteredPasses = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return passes.filter((pass) => {
      const matchesQuery = !needle || [pass.fullName, pass.orgName, pass.role, pass.passRef]
        .some((value) => value.toLowerCase().includes(needle))
      return matchesQuery && matches(pass, filters)
    })
  }, [filters, matches, passes, query])

  const activeFields = FIELD_KEYS.filter((field) => (filters[field]?.length ?? 0) > 0)
  const hasFilter = query.trim() !== '' || activeFields.length > 0
  const canSend = Boolean(sends?.canSend && sends.configured)

  function changeFilters(next: Filters) {
    setFilters(next)
    setShown(PAGE)
  }
  function toggleValue(field: FieldKey, value: string, on: boolean) {
    const set = new Set(filters[field] ?? [])
    if (on) set.add(value)
    else set.delete(value)
    const next = { ...filters }
    if (set.size === 0) delete next[field]
    else next[field] = [...set]
    changeFilters(next)
  }
  function removeField(field: FieldKey) {
    const next = { ...filters }
    delete next[field]
    changeFilters(next)
  }
  function clearFilters() {
    setFilters({})
    setQuery('')
    setShown(PAGE)
  }
  function showFailed() {
    changeFilters({ send: ['failed'] })
    window.requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  // Add-filter menu: closes on an outside click or Escape.
  useEffect(() => {
    if (!menu) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement | null
      if (target?.closest('.passes-add-wrap') || target?.closest('.passes-chip-edit')) return
      setMenu(null)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('click', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('click', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])
  const menuField = menu?.field ?? null
  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLElement>('button, input')?.focus()
  }, [menu, menuField])

  // "/" focuses the search box, as in the mockup.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      event.preventDefault()
      rootRef.current?.querySelector<HTMLInputElement>('.passes-search input')?.focus()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  async function send(request: { mode: 'all' } | { mode: 'one'; personId: string; resend: boolean }, key: string, personName?: string) {
    const parsedRequest = sendRequestSchema.safeParse(request)
    if (!parsedRequest.success) return
    setBusy(key)
    const collected: SendResult[] = []
    let failure: string | null = null
    try {
      for (let round = 0; round < 20; round += 1) {
        const response = await fetch('/api/desk/passes/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedRequest.data),
        })
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          failure = copyForError(body, { ...SEND_ERROR_OVERRIDES, internal: 'Sending failed. Try again.' })
          break
        }
        const parsed = sendResponseSchema.safeParse(await response.json())
        if (!parsed.success) {
          failure = 'Unexpected response from the server.'
          break
        }
        collected.push(...parsed.data.results)
        if (parsed.data.remaining === 0 || parsed.data.results.length === 0) break
      }
    } catch {
      failure = 'Network error. Nothing more was sent.'
    }
    const accepted = collected.filter((result) => result.outcome === 'queued').length
    if (failure) showToast(failure, true)
    else if (collected.length > 0 && accepted < collected.length) showToast(`${accepted} of ${collected.length} accepted by WhatsApp.`, true)
    else if (request.mode === 'one' && personName) showToast(request.resend ? `Pass resent to ${personName} on WhatsApp` : `Pass sent to ${personName} on WhatsApp`)
    else if (collected.length > 0) showToast(`${accepted} passes queued on WhatsApp`)
    setBusy(null)
    await loadSends()
  }

  function sendOne(pass: PassWithQr, resend: boolean) {
    setConfirmResend(false)
    setSelected(null)
    void send({ mode: 'one', personId: pass.id, resend }, pass.id, pass.fullName)
  }

  function openPass(pass: PassWithQr, confirming = false) {
    setSelected(pass)
    setConfirmResend(confirming)
  }

  function closePass() {
    setSelected(null)
    setConfirmResend(false)
  }

  async function copyLink(pass: PassWithQr, phone: string | undefined) {
    if (!phone) {
      showToast('No WhatsApp number on file for this pass', true)
      return
    }
    try {
      await navigator.clipboard.writeText(waMeLink(phone, pass.fullName, pass.passToken))
      showToast('WhatsApp link copied')
    } catch {
      showToast('Could not copy the link', true)
    }
  }

  const selectedSend = selected ? sendByPerson.get(selected.id) : undefined
  const selectedStamp = sentStamp(selectedSend?.last?.requestedAt)
  const unsentLabel = `Send ${unsent.length} unsent passes`

  return (
    <main id="main-content" tabIndex={-1} ref={rootRef} className="r10 passes-page">
      <header className="passes-head">
        <div>
          <h1 className="display-lg">Passes</h1>
          <p className="lede">{passes.length} approved people. {unsent.length} haven&apos;t got their pass yet.</p>
          {sends && !sends.configured && <p className="passes-note">WhatsApp isn&apos;t set up yet, so passes can&apos;t be sent from here. Copy a pass&apos;s WhatsApp link from its sheet instead.</p>}
        </div>
        {unsent.length > 0 && (
          <div className="passes-actions">
            <Button
              variant="primary"
              onClick={() => setConfirmAll(true)}
              disabled={!canSend || busy !== null}
              title={sends && !sends.canSend ? 'Only a lead or admin can send passes' : undefined}
              icon={<Icon name="paper-plane-tilt" />}
            >
              {unsentLabel}
            </Button>
          </div>
        )}
      </header>

      {failed.length > 0 && (
        <div className="passes-banner" role="alert">
          <i className="ph-light ph-warning-circle" aria-hidden="true" />
          <span>{failed.length === 1 ? '1 pass wasn’t delivered' : `${failed.length} passes weren’t delivered`}</span>
          <Button variant="sm" className="passes-banner-btn" onClick={showFailed}>Show them</Button>
        </div>
      )}

      <div className="filterbar passes-filterbar" role="search">
        <div className="filterbar-row">
          <label className="search passes-search">
            <span className="sr-only">Search passes</span>
            <span className="ph" aria-hidden="true"><Icon name="magnifying-glass" /></span>
            <input
              className="input"
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setShown(PAGE) }}
              placeholder="Name, org or pass ref"
              autoComplete="off"
              aria-label="Search passes"
            />
            <kbd aria-hidden="true">/</kbd>
          </label>
          <div className="passes-add-wrap">
            <button
              type="button"
              className="btn"
              aria-haspopup="menu"
              aria-expanded={menu !== null}
              onClick={() => setMenu(menu ? null : { field: null })}
            >
              <i className="ph-light ph-funnel-simple passes-funnel" aria-hidden="true" />Add filter
            </button>
            {menu && (
              <div className="passes-menu" role="menu" ref={menuRef} onClick={(event) => event.stopPropagation()}>
                {menu.field === null ? (
                  <>
                    <div className="passes-menu-title">Filter by</div>
                    {FIELD_KEYS.map((field) => (
                      <button key={field} type="button" role="menuitem" onClick={() => setMenu({ field })}>
                        {FIELD_LABEL[field]}
                        {(filters[field]?.length ?? 0) > 0
                          ? <span className="n">{filters[field]?.length} on</span>
                          : <i className="ph-light ph-caret-right n" aria-hidden="true" />}
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <button type="button" className="passes-menu-back" onClick={() => setMenu({ field: null })}>
                      <i className="ph-light ph-caret-left" aria-hidden="true" />{FIELD_LABEL[menu.field]}
                    </button>
                    {visibleOptions(menu.field).map((option) => {
                      const field = menu.field as FieldKey
                      return (
                        <label key={option.value}>
                          <input
                            type="checkbox"
                            value={option.value}
                            checked={(filters[field] ?? []).includes(option.value)}
                            onChange={(event) => toggleValue(field, option.value, event.target.checked)}
                          />
                          {option.colour && <span className="passes-swatch" style={{ '--c': option.colour } as CSSProperties} />}
                          {option.label}
                          <span className="n">{option.n}</span>
                        </label>
                      )
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="filterbar-row">
          <div className="chips" aria-label="Active filters">
            {activeFields.length === 0
              ? PRESETS.map((preset) => (
                <Chip
                  key={preset.label}
                  preset
                  count={passes.filter((pass) => matches(pass, preset.filters)).length}
                  onActivate={() => changeFilters(structuredClone(preset.filters))}
                >
                  {preset.label}
                </Chip>
              ))
              : activeFields.map((field) => (
                <Chip
                  key={field}
                  className="passes-chip-edit"
                  onEdit={() => setMenu({ field })}
                  onRemove={() => removeField(field)}
                  removeLabel={`Remove ${FIELD_LABEL[field]} filter`}
                >
                  <b>{FIELD_LABEL[field]}:</b> {(filters[field] ?? []).map((value) => labelFor(field, value)).join(', ')}
                </Chip>
              ))}
            {activeFields.length >= 2 && <Button variant="ghost" className="btn-sm" onClick={() => changeFilters({})}>Clear all</Button>}
          </div>
          <span className="count body-sm" aria-live="polite">
            {hasFilter ? <><strong>{filteredPasses.length}</strong> of {passes.length}</> : <><strong>{passes.length}</strong> people</>}
          </span>
        </div>
      </div>

      {loading && (
        <section className="passes-loading" aria-busy="true" aria-label="Loading passes">
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} shape="line" className="passes-loading-line" />)}
        </section>
      )}
      {!loading && error && (
        <EmptyState title="The list didn't load" error>
          Your connection or the server stopped answering. Nothing you did was lost.
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
          {query ? `No one matches "${query}". Try a name or a pass ref, or remove a filter.` : 'Remove a filter to see more people.'}
          <Button onClick={clearFilters}>Clear filters</Button>
        </EmptyState>
      )}
      {!loading && !error && filteredPasses.length > 0 && (
        <div ref={tableRef} className="passes-table-wrap">
          <Table label="Passes" className="passes-table" columns={[
            { key: 'person', label: 'Person' },
            { key: 'tier', label: 'Tier' },
            { key: 'whatsapp', label: 'WhatsApp' },
            { key: 'action', label: '', className: 'cell-r' },
          ]}>
            {filteredPasses.slice(0, shown).map((pass) => {
              const sendState = sendByPerson.get(pass.id)
              const sendStatus = statusFor(sendState?.last?.status)
              const stamp = sentStamp(sendState?.last?.requestedAt)
              const tierLabel = tier(pass.typeCode).label
              const tierStyle = { '--c': tierColour(pass.typeCode, theme) } as CSSProperties
              const reason = sendState?.last?.failureReason ?? undefined
              return (
                <div
                  key={pass.id}
                  className="tr passes-row pass-item"
                  role="row"
                  tabIndex={0}
                  style={tierStyle}
                  onClick={() => openPass(pass)}
                  onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openPass(pass) } }}
                >
                  <TableCell><div className="nm">{pass.fullName}</div><div className="sub">{pass.orgName} · {pass.role}</div></TableCell>
                  <TableCell className="passes-tier hide-s"><span style={tierStyle}>{tierLabel}</span></TableCell>
                  <TableCell className="passes-wa hide-s">
                    <span className={`pill pill-${sendStatus.tone}`} title={reason}>{sendStatus.label}</span>
                    {stamp && <span className="body-sm passes-stamp">{stamp}</span>}
                  </TableCell>
                  <TableCell className="cell-r hide-s">
                    <Button
                      variant="sm"
                      disabled={!canSend || busy !== null}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (!sendState?.last) sendOne(pass, false)
                        else if (sendState.live) openPass(pass, true)
                        else sendOne(pass, false)
                      }}
                    >
                      {sendState?.last ? 'Resend' : 'Send'}
                    </Button>
                  </TableCell>
                  <div className="row2">
                    <span className="passes-tier"><span style={tierStyle}>{tierLabel}</span></span>
                    <span className={`pill pill-${sendStatus.tone}`}>{sendStatus.label}{stamp ? ` · ${stamp}` : ''}</span>
                  </div>
                </div>
              )
            })}
          </Table>
          {filteredPasses.length > shown && (
            <div className="passes-more">
              <Button variant="ghost" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, filteredPasses.length - shown)} more</Button>
            </div>
          )}
        </div>
      )}

      <Sheet
        open={selected !== null}
        onClose={closePass}
        title="Pass"
        titleHidden
        className="passes-sheet"
        footer={selected ? (
          confirmResend ? (
            <div className="passes-sheet-confirm">
              <p className="body-sm">Already sent{selectedStamp ? ` ${selectedStamp}` : ''}. Send again?</p>
              <Button variant="sm" onClick={() => sendOne(selected, true)} disabled={busy !== null}>Send again</Button>
              <Button variant="ghost" className="btn-sm" onClick={() => setConfirmResend(false)}>Cancel</Button>
            </div>
          ) : (
            <>
              <Button
                variant={selectedSend?.live ? 'default' : 'primary'}
                onClick={() => selectedSend?.live ? setConfirmResend(true) : sendOne(selected, false)}
                disabled={!canSend || busy !== null}
                icon={<Icon name="paper-plane-tilt" />}
              >
                {selectedSend?.last ? 'Resend' : 'Send'}
              </Button>
              <Button variant="ghost" onClick={() => void copyLink(selected, selectedSend?.phone)}>
                <i className="ph-light ph-copy" aria-hidden="true" />Copy WhatsApp link
              </Button>
              <Button variant="ghost" onClick={() => window.print()}>
                <Icon name="printer" />Print this pass
              </Button>
            </>
          )
        ) : undefined}
      >
        {selected && <div className="passes-ticket"><PassTicket {...selected} variant="sheet" /></div>}
      </Sheet>

      <Sheet
        open={confirmAll}
        onClose={() => setConfirmAll(false)}
        title={unsentLabel}
        className="passes-confirm-sheet"
        footer={(
          <HoldButton
            variant="primary"
            className="btn-block"
            icon={<Icon name="paper-plane-tilt" />}
            onDone={() => { setConfirmAll(false); void send({ mode: 'all' }, 'all') }}
            disabled={!canSend || busy !== null}
          >
            Hold to send {unsent.length}
          </HoldButton>
        )}
      >
        <h3 className="passes-label">Who</h3>
        <ul className="passes-namelist body-sm">
          {unsent.slice(0, 5).map((pass) => <li key={pass.id}>{pass.fullName} <span>· {pass.orgName}</span></li>)}
          {unsent.length > 5 && <li className="passes-more-names">and {unsent.length - 5} more</li>}
        </ul>
        <p className="body-sm passes-foot-note">Sent from the festival&apos;s WhatsApp number. Each message is personalised.</p>
      </Sheet>

      <div className="toasts" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`toast${toast.bad ? ' bad' : ''}`}>
            <i className={`ph ph-light ph-${toast.icon}`} aria-hidden="true" />
            <span>{toast.text}</span>
          </div>
        )}
      </div>
      <style>{`
        .passes-head { display: flex; align-items: end; justify-content: space-between; gap: var(--s-8); margin-bottom: var(--s-8); }
        .passes-head h1 { margin: var(--s-3) 0 var(--s-4); }
        .passes-head .lede { max-width: 62ch; margin: var(--s-3) 0 0; }
        .passes-actions { display: flex; flex-wrap: wrap; justify-content: end; gap: var(--s-3); }
        .passes-note { margin: var(--s-3) 0 0; color: var(--ink-2); font-size: var(--t-body-sm); }
        .passes-filterbar { margin-bottom: var(--s-6); }
        .passes-filterbar .chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); }
        .passes-funnel { font-size: 18px; }
        /* v2.css leaks unscoped .search/.menu/.pop; the add-filter menu therefore uses its own class. */
        .passes-add-wrap { position: relative; }
        .passes-menu { position: absolute; z-index: var(--z-menu); top: calc(100% + var(--s-2)); left: 0; min-width: 260px; max-height: 420px; overflow: auto; padding: var(--s-2); border-radius: var(--r-md); background: var(--glass-fill-strong); box-shadow: inset 0 0 0 1px var(--glass-edge), inset 0 1px 0 var(--glass-hi), var(--glass-shadow); -webkit-backdrop-filter: blur(24px) saturate(160%); backdrop-filter: blur(24px) saturate(160%); transform-origin: top left; animation: passes-menu-in var(--d-quick) var(--e-out); }
        @keyframes passes-menu-in { from { opacity: 0; transform: scale(.96) translateY(-4px); } }
        .passes-menu-title { padding: var(--s-2) var(--s-3); color: var(--ink-3); font: 600 var(--t-label-sm)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .passes-menu button, .passes-menu label { display: flex; align-items: center; gap: var(--s-3); width: 100%; min-height: var(--hit); padding: 0 var(--s-3); border: 0; border-radius: var(--r-sm); background: none; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
        .passes-menu .n { margin-left: auto; color: var(--ink-3); font: 500 var(--t-label-sm)/1 var(--f-mono); }
        .passes-menu input[type="checkbox"] { width: 20px; height: 20px; margin: 0; accent-color: var(--go); }
        .passes-menu button:focus-visible, .passes-menu label:focus-within { outline: 2px solid var(--ink); outline-offset: -2px; }
        .passes-swatch { width: 12px; height: 12px; border-radius: var(--r-xs); background: var(--c, var(--ink-3)); flex: none; }
        .passes-banner { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3) var(--s-4); margin-bottom: var(--s-6); padding: var(--s-4) var(--s-5); border-radius: var(--r-md); background: var(--bad-tint); color: var(--ink); }
        .passes-banner .ph-light { color: var(--bad); font-size: 20px; }
        .passes-banner-btn { margin-left: auto; }
        .r10.passes-page { isolation: auto; }
        /* r10-foundation: the sheet sits inside .r10 .passes-page, which re-declares isolation:isolate on top of
           the DeskChrome wrapper's own .r10 isolation; that nested stacking context capped the sheet's z-index
           and the header avatar painted over its close button (confirmed with elementFromPoint). Cancelling the
           redundant isolation lets the sheet's own z-index compare against the header again. */
        .passes-table { --cols: minmax(220px, 2.4fr) minmax(110px, .9fr) minmax(170px, 1.3fr) 120px; }
        .passes-table-wrap { min-width: 0; }
        .passes-row { cursor: pointer; --c: var(--ink-3); }
        .passes-row:focus-visible { outline: 2px solid var(--ink); outline-offset: -2px; }
        .passes-row .sub { font: 400 var(--t-body-sm)/1.45 var(--f-body); letter-spacing: normal; text-transform: none; }
        .passes-tier { color: var(--ink); font: 600 var(--t-label)/1 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .passes-tier span { display: inline-flex; align-items: center; gap: var(--s-2); }
        .passes-tier span::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--c); transition: transform var(--d-quick) var(--e-out); }
        @media (hover: hover) { .passes-row:hover .passes-tier span::before { transform: scale(1.3); } }
        .passes-wa { display: grid; gap: 2px; justify-items: start; }
        .passes-stamp { color: var(--ink-3); }
        .passes-row .row2 { display: none; }
        .passes-more { display: flex; justify-content: center; padding: var(--s-6) 0 0; }
        .passes-loading { display: grid; gap: var(--s-4); padding: var(--s-6); }
        .passes-loading-line { width: 100%; height: 56px; border-radius: var(--r-sm); }
        .passes-ticket { margin-bottom: var(--s-6); }
        .passes-sheet-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-3); width: 100%; }
        .passes-sheet-confirm p { flex: 1 1 220px; margin: 0; color: var(--ink-2); }
        .passes-label { margin: 0 0 var(--s-3); color: var(--ink-3); font: 600 var(--t-label)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .passes-namelist { display: grid; gap: var(--s-2); margin: 0 0 var(--s-6); padding: 0; list-style: none; }
        .passes-namelist span, .passes-more-names { color: var(--ink-3); }
        .passes-foot-note { color: var(--ink-3); }
        @media (max-width: 700px) {
          .passes-head { display: block; margin-bottom: var(--s-6); }
          .passes-actions { justify-content: start; margin-top: var(--s-5); }
          .passes-filterbar .btn-export { display: none; }
          .passes-table { --cols: 1fr auto; }
          .passes-table .tr { min-height: 72px; }
          .passes-row .row2 { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2) var(--s-3); }
        }
        @media (prefers-reduced-transparency: reduce) {
          .passes-menu { background: var(--surface-solid); -webkit-backdrop-filter: none; backdrop-filter: none; }
        }
        /* Glyphs app/phosphor.css does not carry; codepoints from the mockup's own Phosphor Light table (r8-passes.html icon rules). */
        .passes-page .ph-light.ph-funnel-simple:before { content: '\\e268'; }
        .passes-page .ph-light.ph-warning-circle:before { content: '\\e4e2'; }
        .passes-page .ph-light.ph-caret-right:before { content: '\\e13a'; }
        .passes-page .ph-light.ph-caret-left:before { content: '\\e138'; }
        .passes-page .ph-light.ph-copy:before { content: '\\e1ca'; }
        .passes-page .ph-light.ph-check-circle:before { content: '\\e184'; }
        .passes-page .toast .ph-light { font-size: 20px; }
        /* Print this pass: the ticket alone, on paper. app/ticket.css already turns .tk into ink on white. */
        @media print {
          body * { visibility: hidden !important; }
          .passes-page > *:not(.passes-sheet) { display: none !important; }
          .passes-sheet, .passes-sheet .sheet-body, .passes-sheet .passes-ticket, .passes-sheet .tk, .passes-sheet .tk * { visibility: visible !important; }
          .passes-sheet { position: absolute !important; inset: 0 auto auto 0 !important; width: 100% !important; height: auto !important; max-height: none !important; transform: none !important; opacity: 1 !important; overflow: visible !important; background: none !important; box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
          .passes-sheet .grabber, .passes-sheet .sheet-head, .passes-sheet .sheet-foot { display: none !important; }
          .passes-sheet .sheet-body { overflow: visible !important; padding: 0 !important; }
        }
      `}</style>
    </main>
  )
}
