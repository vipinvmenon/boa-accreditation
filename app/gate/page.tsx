'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb, type LedgerRow } from '@/gate/db'
import { resolveScan, type GateResolution, type PendingActionProjection } from '@/gate/resolve'
import { enqueueIssue, pullGate, readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { GATE_PATH, loginHref, redirectIfSignedOut } from '@/gate/session'
import { useOutboxSync } from '@/gate/use-outbox-sync'
import { scanFrame } from '@/gate/scanner'
import { DAY_VALIDITY, tierColour } from '@/lib/design'
import { gateBandCard } from '@/gate/band-card'
import { formatRecentLedgerRow } from '@/lib/format'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { PersonSearch } from './person-search'
import { SyncStatus } from './sync-status'

export default function GatePage() {
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  const [resolution, setResolution] = useState<GateResolution | null>(null)
  const [serial, setSerial] = useState('')
  // The pass token a band was just issued to. Locks "Issue wristband" until
  // "Next person" so a second tap cannot queue a duplicate issue.
  const [issuedTo, setIssuedTo] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  /**
   * What would actually fix the boot error, which is not always "sign in".
   * A genuinely signed-out issuer never reaches this screen — boot redirects
   * to the login page before it renders — so offering "Sign in" for every
   * failure sent a signed-in issuer round a loop, and told an issuer with no
   * signal to do the one thing that needs signal. Each cause gets its own
   * action, and an empty roster gets none, because nothing on this phone can
   * fix it.
   */
  const [bootFix, setBootFix] = useState<'signin' | 'retry' | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scannerInputRef = useRef<HTMLInputElement>(null)

  const loadCache = useCallback(async () => {
    setSnapshot(await readGateSnapshot())
  }, [])

  /**
   * The "Try again" action for a pull that failed on signal, not on session.
   * A session that has lapsed in the meantime still redirects to login, so
   * the issuer is never left retrying something a retry cannot fix.
   */
  const retryPull = useCallback(async () => {
    setRetrying(true)
    try {
      await pullGate()
      await loadCache()
      setBootError(null)
      setBootFix(null)
    } catch (cause: unknown) {
      const reason = cause instanceof Error ? cause.message : ''
      if (reason === 'not_signed_in' || reason === 'not_authorized') {
        window.location.assign(loginHref())
        return
      }
      if (reason === 'empty_roster') {
        setBootError('No one has been approved yet, so there is nothing to check in against. The desk loads the roster first.')
        setBootFix(null)
      } else {
        setBootError('Still could not load the approved list. Check signal and try again.')
      }
    } finally {
      setRetrying(false)
    }
  }, [loadCache])

  /**
   * ACC-150 (ADR-020): the gate is for logged-in issuers. On load, while
   * online, ask the server who is signed in and send an unknown or desk-only
   * session to the login page, which returns here. Offline this never runs:
   * a phone that has already pulled must keep resolving scans with the radio
   * off (non-negotiable #7), and the server checks the session again on
   * every write — until then the outbox simply holds the work.
   *
   * The empty cache is the other half: a gate that has never pulled must not
   * show a scanner that answers "Refuse" to every real pass, so it pulls
   * once here (what /gate/setup used to do with a pasted token) and, failing
   * that, says so instead of scanning.
   */
  useEffect(() => {
    let cancelled = false
    async function boot() {
      const current = await readGateSnapshot()
      if (cancelled) return
      setSnapshot(current)
      const empty = current.roster.length === 0 && current.meta.rosterAsOf === null
      if (!navigator.onLine) {
        if (empty) {
          setBootError('This phone has no approved list yet. Find signal, sign in, and it loads itself.')
          setBootFix('signin')
        }
        return
      }
      // ACC-165: the same redirect-on-signed-out mechanism /gate/vehicle
      // uses via useGateSessionGuard — kept inline here because boot() must
      // know whether it redirected before deciding whether to pull.
      if (await redirectIfSignedOut(GATE_PATH)) return
      if (cancelled) return
      if (!empty) return
      try {
        await pullGate()
        if (!cancelled) await loadCache()
      } catch (cause: unknown) {
        if (cancelled) return
        const reason = cause instanceof Error ? cause.message : ''
        if (reason === 'not_signed_in' || reason === 'not_authorized') {
          window.location.assign(loginHref())
          return
        }
        if (reason === 'empty_roster') {
          // Signed in, reached the server, and nobody is approved yet. No
          // button belongs here: the desk has to approve someone first.
          setBootError('No one has been approved yet, so there is nothing to check in against. The desk loads the roster first.')
          setBootFix(null)
        } else {
          setBootError('Could not load the approved list. Check signal and try again.')
          setBootFix('retry')
        }
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [loadCache])

  const { online, queued, canSync, sync, refresh } = useOutboxSync(loadCache)

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCache(), 0)
    return () => window.clearTimeout(timer)
  }, [loadCache])

  const resolve = useCallback(async (raw: string) => {
    if (!snapshot) return
    const roster = new Map(snapshot.roster.map((row) => [row.passToken, row]))
    const byPerson = new Map<string, LedgerRow[]>()
    for (const row of snapshot.ledger) {
      const rows = byPerson.get(row.personId) ?? []
      rows.push(row)
      byPerson.set(row.personId, rows)
    }
    const pending = new Map<string, PendingActionProjection>()
    const pendingRows = await gateDb.outbox.where('status').anyOf('pending', 'syncing').toArray()
    for (const row of pendingRows) {
      const action = gateIssueSchema.safeParse(row.payload)
      if (!action.success || action.data.kind === 'void') continue
      const person = snapshot.roster.find((candidate) => candidate.passToken === action.data.passToken)
      if (person) {
        pending.set(person.personId, {
          ...action.data,
          occurredAt: action.data.occurredAt ?? undefined,
          bandSerial: action.data.bandSerial ?? undefined,
          stickerNo: action.data.stickerNo ?? undefined,
          gateLabel: snapshot.meta.gateLabel,
          volunteerName: snapshot.meta.volunteerName,
          personId: person.personId,
          kind: action.data.kind,
          isReissue: action.data.isReissue,
        })
      }
    }
    try {
      setResolution(resolveScan(raw, roster, byPerson, pending))
    } catch {
      // resolveScan Zod-parses the cached rows. A malformed cache must not
      // leave the volunteer staring at an unchanged screen: fail closed, say
      // why, and point at the fix.
      setResolution({ status: 'red', reason: 'invalid_token' })
      setMessage('This device’s cached list could not be read. Do not issue — re-run gate setup.')
      setSerial('')
      setIssuedTo(null)
      return
    }
    setSerial('')
    setIssuedTo(null)
    setMessage(null)
  }, [snapshot])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
      setCameraActive(true)
    } catch {
      setCameraActive(false)
      setCameraError('Camera unavailable. Use the scan field below or check browser permission.')
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(video, 0, 0)
      canvas.toBlob((blob) => {
        if (blob) void scanFrame(blob).then((value) => { if (value) void resolve(value) }).catch(() => setCameraError('Scanner could not load its local decoder.'))
      }, 'image/jpeg', 0.8)
    }, 700)
    return () => window.clearInterval(timer)
  }, [resolve])

  const issue = async () => {
    if (!resolution || resolution.status !== 'green' || issuedTo === resolution.person.passToken) return
    const token = resolution.person.passToken
    setIssuedTo(token)
    const action: GateIssue = {
      idempotencyKey: crypto.randomUUID(),
      passToken: token,
      kind: 'wristband',
      bandSerial: serial,
      vehicleReg: resolution.person.vehicleReg,
      isReissue: false,
    }
    await enqueueIssue(action)
    setMessage(
      !canSync
        ? 'Wristband recorded on this device. It cannot sync until you sign in again.'
        : online
          ? 'Wristband recorded. Syncing now.'
          : 'Wristband recorded on this device. It syncs when signal returns.',
    )
    await refresh()
    await sync()
  }

  const nextPerson = () => {
    setResolution(null)
    setIssuedTo(null)
    setSerial('')
    setMessage(null)
  }

  const theme = useDomTheme()
  const colour = resolution?.status === 'green' ? 'var(--grn,#00F5A5)' : resolution?.status === 'amber' ? 'var(--gold,#E3BB72)' : resolution ? 'var(--bad,#FF6B5A)' : 'var(--ink3)'
  const verdict = resolution?.status === 'green' ? 'Approved' : resolution?.status === 'amber' ? 'Collected' : resolution?.status === 'red' ? 'Refuse' : 'Ready'
  const outcome = resolution?.status === 'green' ? 'ok' : resolution?.status === 'amber' ? 'col' : resolution?.status === 'red' ? 'bad' : undefined
  const person = resolution?.status === 'red' ? null : resolution?.person
  const card = person ? gateBandCard(person.typeCode) : null
  const stickerDue = resolution?.status === 'green' ? resolution.stickerDue : false
  const issued = resolution?.status === 'green' && issuedTo === resolution.person.passToken
  const recent = useMemo(() => snapshot?.ledger.slice(-3).reverse() ?? [], [snapshot])
  const personById = useMemo(() => new Map(snapshot?.roster.map((row) => [row.personId, row]) ?? []), [snapshot])

  /**
   * ACC-131: this sr-only input is where a hardware (keyboard-wedge) scanner's
   * keystrokes land — it was never focused, so a real wedge scanner had
   * nowhere to type into. Focused whenever the scanner is actually the thing
   * waiting for input: not mid-result, and not while the name search (which
   * focuses its own input) is open.
   */
  useEffect(() => {
    if (!resolution && !searchOpen) scannerInputRef.current?.focus()
  }, [resolution, searchOpen])

  if (!snapshot) return <div style={{ minHeight: '60vh' }} />

  // No approved list on this phone: never a scanner, which would answer
  // "Refuse" to every real pass. The list loads itself once, with signal,
  // for a signed-in issuer (ACC-150 — this is what /gate/setup used to do).
  if (snapshot.roster.length === 0) {
    return (
      <div className="gate-empty">
        <section className="no-roster" role="status">
          <span className="label gold">Crew check-in</span>
          <h1 className="display-sm">{bootFix === null && bootError ? 'No one approved yet' : 'No list on this phone'}</h1>
          <p className="ink-2">{bootError ?? 'Loading the approved list…'}</p>
          {bootFix === 'signin' && (
            <a href={loginHref()} className="btn btn-primary btn-gate btn-block">
              Sign in and load the list
            </a>
          )}
          {bootFix === 'retry' && (
            <button
              type="button"
              onClick={() => void retryPull()}
              disabled={retrying}
              className="btn btn-primary btn-gate btn-block"
            >
              {retrying ? 'Trying…' : 'Try again'}
            </button>
          )}
        </section>
        <style jsx global>{`
          .r10 .gate-empty { display: grid; place-items: center; padding: var(--s-6) var(--gutter); }
          .r10 .gate-empty .no-roster { display: grid; justify-items: start; gap: var(--s-3); width: 100%; max-width: 560px; padding: var(--s-10) var(--s-6); border-radius: var(--r-lg); background: var(--surface); box-shadow: inset 0 0 0 1px var(--hair); }
          .r10 .gate-empty .no-roster > h1, .r10 .gate-empty .no-roster > p { margin: 0; }
          .r10 .gate-empty .no-roster > .btn { margin-top: var(--s-3); }
        `}</style>
      </div>
    )
  }

  const issuedCount = snapshot.ledger.filter((row) => row.kind === 'wristband').length
  const resultKey = resolution?.status === 'green' ? 'green' : resolution?.status === 'amber' ? 'amber' : resolution ? 'red' : undefined

  return (
    <>
      <div className="gate-screen">
        {/* r8-gate.html opens with this segmented control, not a hero header:
            the nav island above already names the screen. */}
        <nav className="segmented" aria-label="Check in people or vehicles">
          <Link href="/gate" aria-current="page">People</Link>
          <Link href="/gate/vehicle">Vehicles</Link>
        </nav>
        <div className="gate-split" data-resolution={resultKey}>
          <div className="panel panel-scan">
            <div className="viewfinder" data-camera={cameraActive ? 'on' : 'off'}>
              <i className="vf-corner tl" /><i className="vf-corner tr" /><i className="vf-corner bl" /><i className="vf-corner br" />
              <div className="vf-sweep" aria-hidden="true" />
              <video ref={videoRef} muted playsInline aria-label="Gate camera scanner" className="vf-video" />
              {/* getUserMedia needs a user gesture; r8-gate.html draws the same
                  "Start camera" disc inside the viewfinder. */}
              {!cameraActive && (
                <button type="button" onClick={() => void startCamera()} className="vf-start" aria-label="Start camera">
                  <Icon name="scan" />
                </button>
              )}
            </div>
            <canvas ref={canvasRef} hidden />
            {/* inputMode="none" keeps a touchscreen's on-screen keyboard from popping up when
                this gets focused — it exists to catch a hardware (keyboard-wedge) scanner's
                keystrokes, not to be typed into by hand. */}
            <input ref={scannerInputRef} aria-label="Pass-code input for hardware scanner" tabIndex={-1} inputMode="none" onKeyDown={(event) => { if (event.key === 'Enter') void resolve(event.currentTarget.value) }} className="sr-only" />
            <div className="scan-copy">
              <h3 className="label">Scan a pass</h3>
              <p className="body-sm ink-2">{snapshot.roster.length} passes on this phone</p>
              <SyncStatus onSynced={loadCache} />
            </div>
            <div className="scan-meta mono">
              <span>{snapshot.meta.gateLabel}, {snapshot.meta.volunteerName}</span>
              <span className={online ? 'q' : 'q wait'}>{online ? 'Online' : 'Offline'} | {queued} queued{canSync ? '' : ' | not syncing, sign in again'}</span>
            </div>
            <PersonSearch roster={snapshot.roster} onOpen={() => { setCameraError(null); setSearchOpen(true) }} onClose={() => setSearchOpen(false)} onPick={(payload) => void resolve(payload)} />
            {cameraError && <p role="alert" className="g-note bad">{cameraError}</p>}
          </div>

          {/* ACC-130: the mock's Scanning/Approved/Collected/Refuse tabs were rendered as
              buttons with no click handler, so they were removed; the verdict heading and
              aria-live on this panel carry the outcome. */}
          <div className="panel panel-result" id="gres" data-o={outcome} aria-live="polite" aria-atomic="true" style={{ '--c': colour } as CSSProperties}>
            {!resolution && <div className="result-idle"><span className="label-sm">Waiting for a scan</span><h2 className="display-md verdict">Ready</h2><p className="ink-2">Hold the pass code inside the frame. Works with the radio off.</p></div>}
            {resolution && <div className="result-body">
              <div className="g-hero">
                <span className="mark" aria-hidden="true"><svg viewBox="0 0 40 40">{resolution.status === 'green' ? <path d="M10 21l7 7 14-15" /> : resolution.status === 'amber' ? <><path d="M20 9v14" /><path d="M20 30v.5" /></> : <><path d="M12 12l16 16" /><path d="M28 12L12 28" /></>}</svg></span>
                <div>
                  <h2 className="display-md verdict g-verdict">{verdict}</h2>
                  <p className="body-sm g-sub">{issued ? 'Band issued · send them through' : resolution.status === 'green' ? 'Not yet collected · issue a band' : resolution.status === 'amber' ? 'A band was already issued to this person' : 'Unknown, rejected or voided token'}</p>
                </div>
              </div>
              {person && card && <div className="gband" style={{ '--c': tierColour(person.typeCode, theme) } as CSSProperties}><b>{card.label}</b><small>{card.handOver}</small></div>}
              {person && card && <div className="person"><div className="nm display-md g-name">{person.fullName}</div><p className="body-sm g-who">{person.orgName} · {person.roleText} · {person.dayValidity === 'build_show' ? 'Build + show day' : DAY_VALIDITY[person.dayValidity]}</p></div>}
              {person && card && <div className="zones">{card.zones.map((zone) => <span key={zone.zone} className={zone.held ? undefined : 'off'} style={{ '--c': ZONE_COLOUR[zone.zone] } as CSSProperties}>{zone.text}</span>)}</div>}
              {stickerDue && person && <div className="g-vehicle"><span className="label-sm">Sticker due</span><b>{person.vehicleReg}</b></div>}
              {resolution.status === 'amber' && <div className="g-note"><b>Already collected.</b> An issue is already recorded or queued. A reissue needs a supervisor note.</div>}
              {resolution.status === 'red' && <div className="g-note bad"><b>Do not let them in.</b> This token is not on the approved list.</div>}
              <div className="g-dock">
                {resolution.status === 'green' && <>
                  <label className="field g-field"><span className="label-sm">Band serial</span><input className="input input-mono" aria-label="Wristband serial, optional" value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="OPTIONAL" autoComplete="off" /></label>
                  <button type="button" onClick={() => void issue()} disabled={issued} className="btn btn-primary btn-gate"><Icon name="check" />{issued ? 'Wristband issued' : 'Issue wristband'}</button>
                </>}
                <button type="button" onClick={nextPerson} className="btn btn-gate">Next person</button>
                {message && <div role="status" className={`mono g-message${resolution.status === 'red' ? ' bad' : ''}`}>{message}</div>}
              </div>
            </div>}
          </div>
        </div>

        <section className="last-issued">
          <h2 className="label gold">Last issued at this gate</h2>
          <div className="last-list">
            {recent.map((row) => {
              const holder = personById.get(row.personId)
              const rowSerial = row.bandSerial ?? row.stickerNo
              const history = row.kind === 'wristband' || row.kind === 'vehicle_sticker'
                ? formatRecentLedgerRow({
                  kind: row.kind,
                  holderName: holder?.fullName ?? null,
                  holderLabel: holder ? gateBandCard(holder.typeCode).label : null,
                  serial: rowSerial,
                  occurredAt: row.occurredAt,
                })
                : { name: 'Ledger event', detail: `void, ${row.occurredAt}` }
              // ACC-130: the mock's "Void" button here did nothing — no handler, and
              // voiding a check-in is a real desk action (non-negotiable #2, the
              // ledger is append-only), not something to fake at the gate.
              return <div key={row.id} className="last-row"><span className="bar" style={{ '--c': holder ? tierColour(holder.typeCode, theme) : 'var(--ink-3)' } as CSSProperties} /><div><div className="nm">{history.name}</div><div className="sub">{history.detail}</div></div></div>
            })}
          </div>
          <p className="last-meta mono"><span>{issuedCount} issued today</span><span>Ledger append-only</span></p>
        </section>
      </div>
      <style jsx global>{GATE_CSS}</style>
    </>
  )
}

/** The zone squares of the printed map (r8-gate.html's `R8.ZONES`), by zone code. */
const ZONE_COLOUR: Record<string, string> = {
  festival_area: 'var(--zone-green)',
  eddies_lounge: 'var(--zone-red)',
  promoters_lounge: 'var(--zone-blue)',
  photo_pit: 'var(--zone-yellow)',
  backstage: 'var(--zone-purple)',
  main_stage: 'var(--zone-orange)',
}

const GATE_CSS = `
  .r10 .gate-screen { padding-block: var(--s-4) var(--s-10); }
  .r10 .segmented { display: inline-flex; gap: 2px; padding: 3px; border-radius: var(--r-pill); background: var(--raised); box-shadow: inset 0 0 0 1px var(--hair); margin-bottom: var(--s-5); }
  .r10 .segmented a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--s-5); border-radius: var(--r-pill); text-decoration: none; color: var(--ink-2); font: 600 var(--t-label)/1 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
  .r10 .segmented a[aria-current="page"] { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--hair); }

  .r10 .gate-split { display: grid; gap: var(--s-5); grid-template-columns: 1fr; align-items: start; }
  /* Gate surfaces are always solid: no backdrop-filter, on any viewport. */
  .r10 .gate-screen .panel { position: relative; border-radius: var(--r-lg); background: var(--surface); box-shadow: inset 0 0 0 1px var(--hair); padding: calc(6px + 28px); overflow: hidden; -webkit-backdrop-filter: none; backdrop-filter: none; }
  .r10 .gate-screen .panel::before, .r10 .gate-screen .panel::after { content: none; }

  /* Phone: one panel, two states (scan or result), in place. The scan panel is
     clipped, not display:none, so the camera keeps decoding behind a result. */
  .r10 .gate-split[data-resolution] .panel-scan { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .r10 .panel-result { display: none; }
  .r10 .gate-split[data-resolution] .panel-result { display: block; }
  .r10 .result-idle { display: none; }

  .r10 .viewfinder { position: relative; aspect-ratio: 1 / 1; max-height: 46vh; margin-inline: auto; border-radius: var(--r-md); background: #000; overflow: hidden; display: grid; place-items: center; }
  .r10 .vf-video { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; }
  .r10 .vf-corner { position: absolute; z-index: 1; width: 26px; height: 26px; }
  .r10 .vf-corner.tl { top: var(--s-4); left: var(--s-4); border-top: 3px solid var(--gold); border-left: 3px solid var(--gold); border-radius: var(--r-xs) 0 0 0; }
  .r10 .vf-corner.tr { top: var(--s-4); right: var(--s-4); border-top: 3px solid var(--gold); border-right: 3px solid var(--gold); border-radius: 0 var(--r-xs) 0 0; }
  .r10 .vf-corner.bl { bottom: var(--s-4); left: var(--s-4); border-bottom: 3px solid var(--gold); border-left: 3px solid var(--gold); border-radius: 0 0 0 var(--r-xs); }
  .r10 .vf-corner.br { bottom: var(--s-4); right: var(--s-4); border-bottom: 3px solid var(--gold); border-right: 3px solid var(--gold); border-radius: 0 0 var(--r-xs) 0; }
  .r10 .vf-sweep { position: absolute; z-index: 1; left: 0; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--go), transparent); opacity: 0; }
  .r10 .viewfinder[data-camera="on"] .vf-sweep { opacity: 1; animation: gate-sweep 2.4s linear infinite; }
  @keyframes gate-sweep { 0% { top: 4%; } 50% { top: 94%; } 100% { top: 4%; } }
  @media (prefers-reduced-motion: reduce) { .r10 .viewfinder[data-camera="on"] .vf-sweep { animation: none; top: 50%; opacity: .5; } }
  /* app/v2.css's bare .vf-start is inset:0 with a transparent ink3 glyph. */
  .r10 .vf-start { position: absolute; inset: 0; z-index: 2; width: 88px; height: 88px; margin: auto; padding: 0; border-radius: 50%; border: 0; background: var(--go); color: var(--on-go); display: grid; place-items: center; font-size: 30px; line-height: 1; cursor: pointer; transition: transform var(--d-instant) var(--e-out); }
  .r10 .vf-start:active { transform: scale(.95); }

  .r10 .scan-copy { margin-top: var(--s-4); text-align: center; }
  .r10 .scan-copy h3 { margin: 0 0 4px; }
  .r10 .scan-copy p { margin: 0; }
  .r10 .scan-copy .mono { margin-top: var(--s-2); color: var(--ink-3); font-size: var(--t-label-sm); text-align: center; }
  .r10 .scan-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--s-3); margin-top: var(--s-3); color: var(--ink-3); font-size: var(--t-label-sm); text-transform: uppercase; }
  .r10 .scan-meta .q.wait { color: var(--gold); }
  .r10 .panel-scan > .btn { margin-top: var(--s-5); }
  .r10 .panel-scan .btn { padding-inline: var(--s-3); }
  @media (max-width: 400px) { .r10 .panel-scan .btn { font-size: 14px; letter-spacing: .04em; } }

  .r10 .name-search { display: grid; gap: var(--s-3); margin-top: var(--s-4); }
  .r10 .name-search .field { display: grid; gap: var(--s-2); }
  .r10 .name-search .field > span { color: var(--ink-2); font: 600 var(--t-label-sm)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
  .r10 .name-search input[type="search"] { width: 100%; min-height: var(--h-control); padding: 0 var(--s-4); border: 0; border-radius: var(--r-md); background: var(--raised); color: var(--ink); box-shadow: inset 0 0 0 1px var(--hair); font: 400 var(--t-body)/1.2 var(--f-body); }
  .r10 .name-search input[type="search"]:focus { outline: 0; box-shadow: inset 0 0 0 2px var(--ink); }
  .r10 .name-search .mono { margin: 0; color: var(--ink-3); }
  .r10 .name-search-results { display: grid; gap: var(--s-2); }
  .r10 .name-search-result { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 56px; padding: var(--s-2) var(--s-4); border-radius: var(--r-md); background: var(--raised); box-shadow: inset 0 0 0 1px var(--hair); cursor: pointer; }
  .r10 .name-search-result[aria-selected="true"] { box-shadow: inset 0 0 0 2px var(--ink); }
  .r10 .name-search-result b { display: block; font-weight: 600; }
  .r10 .name-search-result small { display: block; color: var(--ink-3); font-size: var(--t-body-sm); }
  .r10 .name-search .btn.wide { width: 100%; min-height: var(--h-control-gate); }

  .r10 .g-hero { display: grid; justify-items: center; gap: var(--s-3); padding-bottom: var(--s-4); text-align: center; }
  .r10 .mark { flex: none; width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 18%, transparent); box-shadow: inset 0 0 0 2px var(--c); }
  .r10 .mark svg { width: 40px; height: 40px; stroke: var(--c); stroke-width: 3; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .r10 .g-verdict, .r10 .result-idle .verdict { margin: 0; color: var(--ink); }
  .r10 .g-sub { margin: 2px 0 0; color: var(--ink-2); }
  .r10 .gband { display: grid; gap: 2px; padding: var(--s-3) var(--s-4); border-radius: var(--r-sm); background: color-mix(in srgb, var(--c) 30%, var(--surface)); box-shadow: inset 0 0 0 1px var(--gold-hair), inset 4px 0 0 var(--c); }
  .r10 .gband b { font: 400 var(--t-display-sm)/1 var(--f-display); text-transform: uppercase; letter-spacing: 0; }
  .r10 .gband small { color: var(--ink-2); font-size: var(--t-body-sm); }
  .r10 .person { margin-top: var(--s-4); }
  .r10 .person .nm { margin: 0; font-family: var(--f-display); font-weight: 400; letter-spacing: normal; text-transform: uppercase; color: var(--ink); }
  .r10 .g-who { margin: 4px 0 0; color: var(--ink-2); }
  .r10 .zones { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin: var(--s-3) 0 0; font-size: var(--t-body-sm); }
  .r10 .zones span { display: inline-flex; align-items: center; gap: var(--s-2); }
  .r10 .zones span::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
  .r10 .zones span.off { color: var(--ink-3); }
  .r10 .zones span.off::before { background: var(--hair-strong); }
  .r10 .g-vehicle { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); margin-top: var(--s-4); padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--wait-tint); }
  .r10 .g-vehicle b { font: 500 var(--t-mono)/1 var(--f-mono); letter-spacing: .04em; }
  .r10 .g-note { margin: var(--s-4) 0 0; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--raised); color: var(--ink-2); }
  .r10 .g-note.bad { background: var(--bad-tint); color: var(--ink); }
  .r10 .panel-scan > .g-note { margin-top: var(--s-4); }
  .r10 .g-field { margin-top: 0; }
  .r10 .g-dock { display: grid; gap: var(--s-3); margin-top: var(--s-4); }
  .r10 .g-dock .btn { width: 100%; }
  .r10 .g-message { color: var(--go); }
  .r10 .g-message.bad { color: var(--bad); }

  .r10 .last-issued { margin-top: var(--s-8); }
  .r10 .last-issued h2 { margin: 0 0 var(--s-2); }
  .r10 .last-row { display: grid; grid-template-columns: 3px 1fr; align-items: center; gap: var(--s-4); min-height: 56px; padding: var(--s-2) 0; }
  .r10 .last-row .bar { align-self: stretch; border-radius: var(--r-pill); background: var(--c, var(--ink-3)); }
  .r10 .last-row .nm { font-family: var(--f-body); font-weight: 600; font-size: var(--t-body); letter-spacing: normal; text-transform: none; color: var(--ink); }
  .r10 .last-row .sub { color: var(--ink-3); font-size: var(--t-body-sm); }
  .r10 .last-meta { display: flex; justify-content: space-between; gap: var(--s-3); margin: var(--s-3) 0 0; color: var(--ink-3); font-size: var(--t-label-sm); text-transform: uppercase; }

  /* app/v2.css's unscoped .zones/.person/.gband/.sub/.name-search* leak into this markup. */
  .r10 .gate-screen .zones span { padding: 0; border-radius: 0; background: none; box-shadow: none; font: inherit; font-size: var(--t-body-sm); letter-spacing: normal; text-transform: none; color: var(--ink); text-decoration: none; }
  .r10 .gate-screen .zones span.off { color: var(--ink-3); text-decoration: none; background: none; box-shadow: none; }
  .r10 .gate-screen .person { padding-top: 0; box-shadow: none; }
  .r10 .gate-screen .person .nm { font-size: var(--t-display-md); line-height: .95; }
  .r10 .gate-screen .gband small { font-family: var(--f-body); font-size: var(--t-body-sm); font-weight: 400; letter-spacing: normal; text-transform: none; color: var(--ink-2); }
  .r10 .gate-screen .gband b { display: block; margin: 0; font-size: var(--t-display-sm); color: var(--ink); }
  .r10 .gate-screen .last-row .sub { margin: 0; font-family: var(--f-body); font-size: var(--t-body-sm); letter-spacing: normal; color: var(--ink-3); }
  .r10 .gate-screen .name-search { margin-top: var(--s-4); padding: 0; border-radius: 0; background: none; box-shadow: none; }
  .r10 .gate-screen .name-search-results { gap: var(--s-2); background: none; }
  .r10 .gate-screen .name-search-results[hidden] { display: none; }
  .r10 .gate-screen .name-search-result { border: 0; color: var(--ink); text-align: left; background: var(--raised); }
  .r10 .gate-screen .name-search-result b { font-family: var(--f-body); font-size: var(--t-body); text-transform: none; }
  .r10 .gate-screen .name-search-result small { margin-top: 0; font-family: var(--f-body); font-size: var(--t-body-sm); letter-spacing: normal; }
  .r10 .gate-screen .name-search .field input { min-height: var(--h-control); }

  @container app (min-width: 1000px) {
    .r10 .gate-split { grid-template-columns: 1fr 1fr; }
    .r10 .gate-split .panel-scan, .r10 .gate-split[data-resolution] .panel-scan { position: relative; width: auto; height: auto; padding: calc(6px + 28px); overflow: hidden; clip: auto; white-space: normal; }
    .r10 .gate-split .panel-result { display: block; }
    .r10 .gate-split:not([data-resolution]) .result-idle { display: grid; place-items: center; gap: var(--s-3); padding: var(--s-14) 0; text-align: center; color: var(--ink-3); }
    .r10 .viewfinder { max-height: none; }
  }
`
