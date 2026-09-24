'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { passesResponseSchema, type Pass } from '@/lib/schemas/pass'
import { tier, tierColour } from '@/lib/design'
import { zoneChips } from '@/lib/desk-tiers'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { PassesSkeleton } from '@/components/loading-skeleton'
import { EmptyState, InlineConfirm, InlineError } from '@/components/states'
import { copyForError } from '@/lib/error-copy'
import {
  passSendsResponseSchema,
  sendResponseSchema,
  type PassSendsResponse,
  type PersonSend,
  type SendRequest,
  type SendResult,
} from './send-schema'

export type RenderedPass = Pass & { qrSvg: string }

// The fallback when the Cloud API is down or the template is rejected
// (ACC-140f): a one-tap chat to the person's own number, text prefilled.
function waMeLink(phone: string, fullName: string, passToken: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? ''
  const text = `Hi ${first}, here is your Bangalore Open Air crew pass. Show this QR at the accreditation desk with a photo ID: ${window.location.origin}/p/${passToken}`
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
}

const STATUS_COPY: Record<string, { label: string; tone: 'ok' | 'wait' | 'no' | 'mute' }> = {
  none: { label: 'Not sent', tone: 'mute' },
  queued: { label: 'Queued', tone: 'wait' },
  sent: { label: 'Sent', tone: 'wait' },
  delivered: { label: 'Delivered', tone: 'ok' },
  read: { label: 'Read', tone: 'ok' },
  failed: { label: 'Failed', tone: 'no' },
}

const OUTCOME_COPY: Record<SendResult['outcome'], string> = {
  queued: 'accepted by WhatsApp',
  failed: 'failed',
  already_sent: 'already sent — use Resend',
  not_approved: 'not approved',
  not_found: 'not found',
  error: 'error',
}

// ACC-122: shared with every other desk screen via lib/error-copy.ts; this
// screen's `not_authorized` and `not_authenticated` wording differ from the
// default ("send passes" instead of "do this" / "ended" instead of "expired").
const SEND_ERROR_OVERRIDES = {
  not_authorized: 'Only a lead or admin can send passes.',
  not_authenticated: 'Your session has ended. Log in again.',
}

function dayCopy(dayValidity: Pass['dayValidity']): string {
  return dayValidity === 'build_show' ? 'build and show' : dayValidity === 'build' ? 'build day' : 'show day'
}

export function PassesScreen() {
  const router = useRouter()
  const theme = useDomTheme()
  const [passes, setPasses] = useState<RenderedPass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [sends, setSends] = useState<PassSendsResponse | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [lastResults, setLastResults] = useState<SendResult[]>([])
  // ACC-125: a resend/send-all is not destructive in the ledger sense (it
  // never voids anything), but it does re-message someone, so it gets the
  // same inline confirm — never a browser confirm() — as Deactivate.
  const [confirmAll, setConfirmAll] = useState(false)
  const [confirmResendId, setConfirmResendId] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const rootRef = useRef<HTMLElement>(null)

  const loadSends = useCallback(async () => {
    try {
      const response = await fetch('/api/desk/passes/send')
      if (!response.ok) return
      const parsed = passSendsResponseSchema.safeParse(await response.json())
      if (parsed.success) setSends(parsed.data)
    } catch {
      /* the pass sheet still works without send state */
    }
  }, [])

  useEffect(() => {
    // Deferred a tick so no setState runs synchronously in the effect body.
    const id = window.setTimeout(() => void loadSends(), 0)
    return () => window.clearTimeout(id)
  }, [loadSends])

  const sendByPerson = new Map<string, PersonSend>((sends?.people ?? []).map((p) => [p.personId, p]))
  const unsentCount = (sends?.people ?? []).filter((p) => !p.live).length
  const failures = (sends?.people ?? []).filter((p) => !p.live && p.last?.status === 'failed')
  const nameOf = (personId: string) => passes.find((p) => p.id === personId)?.fullName ?? 'Unknown'
  const canSend = Boolean(sends?.canSend && sends.configured)

  async function send(request: SendRequest, key: string) {
    setBusy(key)
    setNotice(null)
    const collected: SendResult[] = []
    try {
      // "Send all" is time-boxed server-side; keep going while it makes progress.
      for (let round = 0; round < 20; round += 1) {
        const response = await fetch('/api/desk/passes/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        })
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null)
          setNotice(copyForError(body, { ...SEND_ERROR_OVERRIDES, internal: 'Sending failed. Try again, or use the one-tap links.' }))
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
        const ok = collected.filter((r) => r.outcome === 'queued').length
        setNotice(`${ok} of ${collected.length} accepted by WhatsApp.`)
      }
    } catch {
      setNotice('Network error. Nothing more was sent.')
    } finally {
      setLastResults(collected.filter((r) => r.outcome !== 'queued'))
      setBusy(null)
      await loadSends()
    }
  }

  function requestSendOne(personId: string, live: boolean) {
    if (live) {
      setConfirmResendId(personId)
      return
    }
    void send({ mode: 'one', personId, resend: false }, personId)
  }

  function confirmSendOne(personId: string) {
    setConfirmResendId(null)
    void send({ mode: 'one', personId, resend: true }, personId)
  }

  function requestSendAll() {
    if (unsentCount === 0) return
    setConfirmAll(true)
  }

  function confirmSendAll() {
    setConfirmAll(false)
    void send({ mode: 'all' }, 'all')
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const response = await fetch('/api/desk/passes')
        if (response.status === 401) {
          router.replace('/desk/login')
          return
        }
        if (!response.ok) throw new Error('request_failed')
        const parsed = passesResponseSchema.safeParse(await response.json())
        if (!parsed.success) throw new Error('invalid_response')
        if (!cancelled) {
          setPasses(parsed.data.passes)
          setError(false)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router, reloadKey])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const revealables = root.querySelectorAll<HTMLElement>('.rv')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealables.forEach((element) => element.classList.add('in'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }),
      { threshold: 0.12 },
    )
    revealables.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [passes.length, loading, error])

  return (
    <main id="main-content" tabIndex={-1} ref={rootRef} className="passes-screen">
      <section className="head rv">
        <div>
          <span className="tag">The pass</span>
          <h1 className="h1 passes-title">Pass sheet</h1>
          <p className="lede">One card per approved person. Print and cut, or forward the per-person link. Zones are printed so the desk never has to look up what a band covers.</p>
          {sends && !sends.configured && <p className="mono send-note">WhatsApp is not configured yet — use each pass&rsquo;s one-tap link.</p>}
          {notice && <p role="status" className="mono send-note">{notice}</p>}
        </div>
        <div className="row passes-actions">
          {confirmAll ? (
            <InlineConfirm
              prompt={`Send ${unsentCount} ${unsentCount === 1 ? 'pass' : 'passes'} on WhatsApp now?`}
              confirmLabel="Send"
              tone="grn"
              busy={busy === 'all'}
              busyLabel="Sending…"
              onConfirm={confirmSendAll}
              onCancel={() => setConfirmAll(false)}
            />
          ) : (
            /* Always drawn — the design has a WhatsApp action here — but it only
               works for a lead/admin with WhatsApp configured and N > 0. */
            <button type="button" onClick={requestSendAll} className="btn" disabled={!canSend || unsentCount === 0 || busy !== null}
              title={sends && !sends.canSend ? 'Only a lead or admin can send passes' : undefined}>
              {busy === 'all' ? 'Sending…' : 'Send all unsent'}{sends && <span className="n">{unsentCount}</span>}<span className="ic"><Icon name="paper-plane-tilt" /></span>
            </button>
          )}
          {passes.length > 0 && <button type="button" onClick={() => window.print()} className="btn go">
            Print {passes.length} passes<span className="ic"><Icon name="printer" /></span>
          </button>}
        </div>
      </section>

      {(failures.length > 0 || lastResults.length > 0) && <section className="send-failures" aria-label="WhatsApp failures">
        <span className="tag gold">Not delivered</span>
        <ul>
          {failures.map((f) => <li key={f.personId}><b>{nameOf(f.personId)}</b><span className="mono">{f.last?.failureReason ?? 'failed'}</span></li>)}
          {lastResults.filter((r) => !failures.some((f) => f.personId === r.personId)).map((r) => (
            <li key={`r-${r.personId}`}><b>{nameOf(r.personId)}</b><span className="mono">{r.reason ?? OUTCOME_COPY[r.outcome]}</span></li>
          ))}
        </ul>
      </section>}

      <div className="passes">
        {loading && (
          <PassesSkeleton />
        )}
        {!loading && error && (
          <InlineError
            className="passes-state passes-state-error"
            message="Unable to load passes."
            onRetry={() => { setError(false); setReloadKey((k) => k + 1) }}
          />
        )}
        {!loading && !error && passes.length === 0 && (
          <EmptyState className="passes-state" message="No approved passes yet — approve in the queue →" />
        )}
        {passes.map((pass, i) => {
          const type = tier(pass.typeCode)
          const zones = zoneChips(pass.typeCode)
          const send = sendByPerson.get(pass.id)
          const status = STATUS_COPY[send?.last?.status ?? 'none'] ?? { label: 'Not sent', tone: 'mute' as const }
          return (
            <article className="pass bz rv" key={pass.id} style={{ '--c': tierColour(type.code, theme), '--d': i % 3 } as React.CSSProperties}>
              <div className="pl">
                <div className="ph">
                  <img src="/assets/boa-logo.png" alt="BOA" />
                  <span className="mono">{pass.passRef}</span>
                </div>
                <div className="who">
                  <div className="nm">{pass.fullName}</div>
                  <div className="sub" style={{ marginTop: '8px' }}>{pass.orgName}<br />{pass.role}, {dayCopy(pass.dayValidity)}</div>
                </div>
                <div className="bandbox">
                  <b>{type.label}</b>
                  <small>{type.band} band</small>
                </div>
                <div className="zones">
                  {zones.map((zone) => <span key={zone.zone} className={zone.held ? undefined : 'off'}>{zone.text}</span>)}
                </div>
                <div className="qr qr-wrap" role="img" aria-label={`QR code for ${pass.fullName}`} dangerouslySetInnerHTML={{ __html: pass.qrSvg }} />
                {pass.vehicleReg && <div className="vehbox">
                  <span className="mono">Vehicle</span>
                  <b>{pass.vehicleReg}</b>
                </div>}
                <p className="fine">Bring this and a valid photo ID. Non-transferable. One person, one pass, one check-in, one wristband.</p>
              </div>
              {send && confirmResendId === pass.id ? (
                <div className="send-row">
                  <InlineConfirm
                    prompt="Already sent — send again?"
                    confirmLabel="Resend"
                    tone="grn"
                    busy={busy === pass.id}
                    busyLabel="Sending…"
                    onConfirm={() => confirmSendOne(pass.id)}
                    onCancel={() => setConfirmResendId(null)}
                  />
                </div>
              ) : send && <div className="send-row">
                <span className={`st ${status.tone}`} title={send.last?.failureReason ?? undefined}>{status.label}</span>
                {sends?.canSend && <button type="button" className="btn solo" disabled={!canSend || busy !== null} onClick={() => requestSendOne(pass.id, send.live)}>
                  {busy === pass.id ? 'Sending…' : send.live ? 'Resend' : 'Send'}
                </button>}
                <a className="btn solo" href={waMeLink(send.phone, pass.fullName, pass.passToken)} target="_blank" rel="noopener noreferrer">
                  One-tap<span className="sr-only"> WhatsApp link for {pass.fullName}</span>
                </a>
              </div>}
            </article>
          )
        })}
      </div>
      <style>{`
        .passes-actions { justify-content: flex-end; align-items: center; }
        .passes-state { grid-column: 1 / -1; margin: 0; padding: 18px 22px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); }
        .passes-state-error { color: var(--bad); }
        .qr-wrap svg { display: block; width: 128px; height: 128px; }
        .send-note { margin: 12px 0 0; }
        .send-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 14px 4px 0; }
        .send-row .btn { min-height: 44px; }
        .send-failures { margin: 0 0 16px; padding: 18px 22px; border-radius: 18px; box-shadow: inset 0 0 0 1px var(--rule); }
        .send-failures ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 8px; }
        .send-failures li { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
        .send-failures li .mono { color: var(--bad); text-transform: none; letter-spacing: .02em; }
        @container app (max-width: 700px) {
          .passes-actions { justify-content: flex-start; }
        }
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; }
          .nav-wrap, .status, .menu, footer, .head, .passes-state, .send-row, .send-failures { display: none !important; }
          .passes { display: block !important; }
          .pass { min-height: 270mm; break-after: page; background: white !important; color: var(--on) !important; }
          .pass:last-child { break-after: auto; }
          .pass > .pl { box-shadow: none; background: white !important; padding: 0; }
          .pass > .pl > * { break-inside: avoid; }
          .qr-wrap { margin-top: 8mm; }
          .qr-wrap svg { width: 35mm; height: 35mm; }
        }
      `}</style>
    </main>
  )
}
