'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb, type LedgerRow } from '@/gate/db'
import { resolveScan, type GateResolution, type PendingActionProjection } from '@/gate/resolve'
import { enqueueIssue, pullGate, readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { readOtherBands } from '@/gate/other-bands'
import { queueTshirtGiven } from '@/gate/tshirt-flow'
import { GATE_PATH, loginHref, redirectIfSignedOut } from '@/gate/session'
import { useOutboxSync } from '@/gate/use-outbox-sync'
import { scanFrame } from '@/gate/scanner'
import { passPayload } from '@/gate/search'
import { gateBandCard } from '@/gate/band-card'
import { acceptCameraRead, type LastRead, type ScanShowing } from '@/gate/scan-guard'
import { signalVerdict, unlockFeedback } from '@/gate/feedback'
import { formatBandSerial, formatLedgerTime } from '@/lib/format'
import { Icon } from '@/components/icon'
import { GateTicket } from '@/components/pass-ticket'
import { SkeletonText } from '@/components/r10'
import { PersonSearch } from './person-search'
import { GateStatus } from './gate-status'
import { PeopleFolds } from './gate-lists'

export default function GatePage() {
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  const [resolution, setResolution] = useState<GateResolution | null>(null)
  const [serial, setSerial] = useState('')
  // The pass token a band was just issued to. Locks "Issue wristband" until
  // "Next person" so a second tap cannot queue a duplicate issue.
  const [issuedTo, setIssuedTo] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // Set when the server says this person already held a band from another
  // phone. Online it arrives with the issue; offline, when the queue drains.
  const [doubleWarning, setDoubleWarning] = useState<string | null>(null)
  const issuedKeyRef = useRef<string | null>(null)
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
  const splitRef = useRef<HTMLDivElement>(null)
  const scanPanelRef = useRef<HTMLDivElement>(null)
  // The camera's last read and what is on screen, for acceptCameraRead: the
  // decode loop runs on a timer and must see the current values, not the
  // ones from the render that started it.
  const lastReadRef = useRef<LastRead>(null)
  const showingRef = useRef<ScanShowing>('none')
  // Bumped on every resolved scan, so the result re-enters even when two
  // passes in a row get the same verdict.
  const [scanSeq, setScanSeq] = useState(0)
  // The scanner card's height while idle: the result card keeps it, so the
  // screen does not jump from a tall camera to a short Refuse.
  const [scanHeight, setScanHeight] = useState<number | null>(null)

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

  const { online, queued, failed, canSync, sync, refresh } = useOutboxSync(loadCache)

  // Wristbands queued on this phone and not yet in the ledger: the folds
  // count them as handed over, as the scanner does (gate/resolve.ts).
  // 'failed' too: the server refused the write, but the band is on a wrist,
  // and dropping it here showed that person green again on this phone.
  const [pending, setPending] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    if (!snapshot) return
    let live = true
    void gateDb.outbox.where('status').anyOf('pending', 'syncing', 'failed').toArray().then((rows) => {
      if (!live) return
      const byToken = new Map(snapshot.roster.map((row) => [row.passToken, row.personId]))
      const queuedAt = new Map<string, string>()
      for (const row of rows) {
        const action = gateIssueSchema.safeParse(row.payload)
        if (!action.success || action.data.kind !== 'wristband') continue
        const personId = byToken.get(action.data.passToken)
        if (personId) queuedAt.set(personId, action.data.occurredAt ?? new Date(row.createdAt).toISOString())
      }
      setPending(queuedAt)
    })
    return () => { live = false }
  }, [snapshot, queued])

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
    // A refused ('failed') band is still on a wrist: amber, as in the folds.
    const pendingRows = await gateDb.outbox.where('status').anyOf('pending', 'syncing', 'failed').toArray()
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
      const next = resolveScan(raw, roster, byPerson, pending)
      setResolution(next)
      setScanSeq((n) => n + 1)
      signalVerdict(next.status)
    } catch {
      // resolveScan Zod-parses the cached rows. A malformed cache must not
      // leave the volunteer staring at an unchanged screen: fail closed, say
      // why, and point at the fix.
      setResolution({ status: 'red', reason: 'invalid_token' })
      setScanSeq((n) => n + 1)
      signalVerdict('red')
      setMessage('This phone’s saved list could not be read. Do not issue. Reload this page with signal to fetch it again.')
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
      setCameraError('The camera did not start. Allow camera access for this site, or search by name.')
    }
  }, [])

  // The camera used to need a tap on every visit. Once this site has camera
  // permission, getUserMedia needs no gesture, so start it straight away;
  // before that, the "Start camera" button asks (1 Oct review, item 4).
  const hasRoster = (snapshot?.roster.length ?? 0) > 0
  const autoStarted = useRef(false)
  useEffect(() => {
    if (!hasRoster || autoStarted.current) return
    autoStarted.current = true
    void navigator.permissions?.query({ name: 'camera' as PermissionName })
      .then((permission) => { if (permission.state === 'granted') void startCamera() })
      .catch(() => { /* Not queryable here (older Safari): the button stays. */ })
  }, [hasRoster, startCamera])

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
        if (blob) void scanFrame(blob).then((value) => {
          if (!value) return
          const read = acceptCameraRead(value, showingRef.current, lastReadRef.current, Date.now())
          lastReadRef.current = read.last
          if (read.accept) void resolve(value)
        }).catch(() => setCameraError('Scanner could not load its local decoder.'))
      }, 'image/jpeg', 0.8)
    }, 700)
    return () => window.clearInterval(timer)
  }, [resolve])

  const issue = async () => {
    if (!resolution || resolution.status !== 'green' || issuedTo === resolution.person.passToken) return
    const token = resolution.person.passToken
    setIssuedTo(token)
    const idempotencyKey = crypto.randomUUID()
    issuedKeyRef.current = idempotencyKey
    setDoubleWarning(null)
    const action: GateIssue = {
      idempotencyKey,
      passToken: token,
      kind: 'wristband',
      bandSerial: serial,
      vehicleReg: resolution.person.vehicleReg,
      isReissue: false,
    }
    await enqueueIssue(action)
    // Online, the verdict's own "Band issued" line is the confirmation; a
    // second green line saying "Syncing now" repeated it (1 Oct review). Only
    // the cases where it has not left the phone get a word.
    setMessage(
      !canSync
        ? 'Saved on this phone. It cannot send until you sign in again.'
        : online
          ? null
          : 'Saved on this phone. It sends when signal returns.',
    )
    await refresh()
    await sync()
    await checkDouble()
  }

  const checkDouble = useCallback(async () => {
    const key = issuedKeyRef.current
    if (!key) return
    const warning = await readOtherBands(key)
    if (warning && issuedKeyRef.current === key) setDoubleWarning(warning)
  }, [])
  // An issue made offline reaches the server later; look again as the queue drains.
  useEffect(() => { void checkDouble() }, [queued, checkDouble])

  // ACC-197b: hand-over state comes from the live cache, not the scan-time copy,
  // so the tap is reflected at once (and survives a pull before the server acks).
  const giveTshirt = async () => {
    const target = resolution && resolution.status !== 'red' ? resolution.person : null
    if (!target || !target.tshirtSize) return
    await queueTshirtGiven(gateDb, target.personId)
    await loadCache() // offline nothing else reloads it
    await sync()
  }

  const nextPerson = () => {
    setResolution(null)
    setIssuedTo(null)
    issuedKeyRef.current = null
    setDoubleWarning(null)
    setSerial('')
    setMessage(null)
  }

  // The theme's own verdict colours, so the banner holds its contrast in light.
  const colour = resolution?.status === 'green' ? 'var(--go)' : resolution?.status === 'amber' ? 'var(--gold)' : resolution ? 'var(--bad)' : 'var(--ink-3)'
  const verdict = resolution?.status === 'green' ? 'Approved' : resolution?.status === 'amber' ? 'Collected' : resolution?.status === 'red' ? 'Refuse' : 'Ready'
  const outcome = resolution?.status === 'green' ? 'ok' : resolution?.status === 'amber' ? 'col' : resolution?.status === 'red' ? 'bad' : undefined
  const person = resolution?.status === 'red' ? null : resolution?.person
  const stickerDue = resolution?.status === 'green' ? resolution.stickerDue : false
  const issued = resolution?.status === 'green' && issuedTo === resolution.person.passToken
  // gate/scan-guard.ts: Approved with no band yet is locked against the next
  // pass in view; anything else gives way to it.
  useEffect(() => {
    showingRef.current = !resolution ? 'none' : resolution.status === 'green' && !issued ? 'locked' : 'open'
  }, [resolution, issued])
  useEffect(() => {
    const panel = scanPanelRef.current
    if (!panel || resolution || searchOpen) return
    const observer = new ResizeObserver(() => setScanHeight(panel.offsetHeight))
    observer.observe(panel)
    return () => observer.disconnect()
  }, [resolution, searchOpen, snapshot])
  // One sentence under the verdict, and the only place it is said: the note
  // boxes that repeated it are gone (1 Oct review, items 13 and 14).
  const sub = !resolution
    ? ''
    : resolution.status === 'green'
      ? issued ? 'Band issued. Send them through.' : `${gateBandCard(resolution.person.typeCode).handOver}.`
      : resolution.status === 'amber'
        ? resolution.source === 'outbox'
          ? `Band issued on this phone${resolution.issue.occurredAt ? ` at ${formatLedgerTime(resolution.issue.occurredAt)}` : ''}, not sent yet.`
          : `Band issued ${resolution.issue.occurredAt ? `${formatLedgerTime(resolution.issue.occurredAt)} ` : ''}at ${resolution.issue.gateLabel}${resolution.issue.bandSerial ? `, serial ${formatBandSerial(resolution.issue.bandSerial)}` : ''}.`
        : resolution.reason === 'invalid_token'
          ? 'This is not a BOA pass code. Ask for the pass on their phone and scan that.'
          : 'This pass is not on the approved list. Send them to the accreditation desk.'

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

  // While this phone's list is read from Dexie (a few frames), draw the
  // gate itself: the tabs, the viewfinder, the idle result panel, with
  // skeletons only where the phone's own data goes. It had been an empty
  // 60vh box, so the whole screen popped in after arriving (Vipin, 29 Sep).
  if (!snapshot) {
    return (
      <>
        <div className="gate-screen" aria-busy="true">
          <div className="gate-split">
            <div className="panel panel-scan">
              <div className="scan-head"><h2 className="display-sm verdict">Scan a pass</h2></div>
              <div className="viewfinder" data-camera="off">
                <i className="vf-corner tl" /><i className="vf-corner tr" /><i className="vf-corner bl" /><i className="vf-corner br" />
                {/* The loaded screen's own disc, waiting: it is not live until the list is read. */}
                <button type="button" className="btn btn-primary btn-gate vf-start vf-disc" aria-label="Start camera" disabled>
                  <Icon name="scan" />
                </button>
              </div>
              {/* The status line's own <p>, its text held as a skeleton (.sk draws it
                  transparent), so the row is its loaded height and nothing under it moves. */}
              <div className="gate-status mono" aria-hidden="true">
                <p><span className="sk">Last synced 00:00</span></p>
              </div>
              <button type="button" className="btn btn-gate btn-block" disabled>
                <Icon name="magnifying-glass" />Can&apos;t scan? Search by name
              </button>
            </div>
            <div className="panel panel-result">
            </div>
          </div>
          {/* The folds' headers, so they are there before the list is, not
              popped in under the card a moment later. */}
          <div className="gate-folds" aria-hidden="true">
            <section className="gate-fold" data-open="">
              <h2 className="gate-fold-h"><button type="button" disabled><span>Just now</span><span className="gate-fold-n"><SkeletonText w="1ch" /><Icon name="caret-down" /></span></button></h2>
              <div className="gate-fold-body"><div className="gate-fold-inner"><p className="gate-fold-empty"><span className="sk">Bands handed over today show here. Tap one to see that person again.</span></p></div></div>
            </section>
            <section className="gate-fold">
              <h2 className="gate-fold-h"><button type="button" disabled><span>Still to collect</span><span className="gate-fold-n"><SkeletonText w="2ch" /><Icon name="caret-down" /></span></button></h2>
            </section>
          </div>
        </div>
        <style jsx global>{GATE_CSS}</style>
      </>
    )
  }

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
          .r10 .gate-empty .no-roster { display: grid; justify-items: start; gap: var(--s-3); width: 100%; max-width: 560px; padding: var(--s-10) var(--s-6); border-radius: var(--r-lg); background: var(--surface); box-shadow: var(--edge); }
          .r10 .gate-empty .no-roster > h1, .r10 .gate-empty .no-roster > p { margin: 0; }
          .r10 .gate-empty .no-roster > .btn { margin-top: var(--s-3); }
        `}</style>
      </div>
    )
  }

  const resultKey = resolution?.status === 'green' ? 'green' : resolution?.status === 'amber' ? 'amber' : resolution ? 'red' : undefined

  return (
    <>
      {/* The first tap on the gate lets it make sound (gate/feedback.ts). */}
      <div className="gate-screen" onPointerDown={unlockFeedback}>
        <div ref={splitRef} className="gate-split" data-resolution={resultKey} data-search={searchOpen ? 'open' : undefined}>
          <div ref={scanPanelRef} className="panel panel-scan">
            {/* An instruction, in ink, not a green verdict-sized "Ready": green
                is kept for "let them in" (1 Oct review, items 1 to 3). */}
            <div className="scan-head"><h2 className="display-sm verdict">Scan a pass</h2></div>
            <div className="viewfinder" data-camera={cameraActive ? 'on' : 'off'}>
              <i className="vf-corner tl" /><i className="vf-corner tr" /><i className="vf-corner bl" /><i className="vf-corner br" />
              <div className="vf-sweep" aria-hidden="true" />
              <video ref={videoRef} muted playsInline aria-label="Gate camera scanner" className="vf-video" />
              {/* getUserMedia needs a user gesture; r8-gate.html draws the same
                  "Start camera" disc inside the viewfinder: the icon alone, its
                  name for screen readers (2 Oct, Vipin; a little larger than
                  the mock's 88px). */}
              {!cameraActive && (
                <button type="button" onClick={() => void startCamera()} className="btn btn-primary btn-gate vf-start vf-disc" aria-label="Start camera">
                  <Icon name="scan" />
                </button>
              )}
            </div>
            <canvas ref={canvasRef} hidden />
            {/* inputMode="none" keeps a touchscreen's on-screen keyboard from popping up when
                this gets focused — it exists to catch a hardware (keyboard-wedge) scanner's
                keystrokes, not to be typed into by hand. */}
            <input ref={scannerInputRef} aria-label="Pass-code input for hardware scanner" tabIndex={-1} inputMode="none" onKeyDown={(event) => { if (event.key === 'Enter') void resolve(event.currentTarget.value) }} className="sr-only" />
            <GateStatus online={online} queued={queued} failed={failed} canSync={canSync} onSynced={loadCache} />
            <PersonSearch roster={snapshot.roster} onOpen={() => { setCameraError(null); setSearchOpen(true) }} onClose={() => setSearchOpen(false)} onPick={(payload) => void resolve(payload)} />
            {cameraError && <p role="alert" className="g-note bad">{cameraError}</p>}
          </div>

          {/* ACC-130: the mock's Scanning/Approved/Collected/Refuse tabs were rendered as
              buttons with no click handler, so they were removed; the verdict heading and
              aria-live on this panel carry the outcome. */}
          <div className="panel panel-result" id="gres" data-o={outcome} aria-live="polite" aria-atomic="true" style={{ '--c': colour, minHeight: scanHeight ?? undefined } as CSSProperties}>
            {resolution && <div key={scanSeq} className="result-body">
              <div className="g-hero">
                <span className="mark" aria-hidden="true"><svg viewBox="0 0 40 40">{resolution.status === 'green' ? <path d="M10 21l7 7 14-15" /> : resolution.status === 'amber' ? <><path d="M20 9v14" /><path d="M20 30v.5" /></> : <><path d="M12 12l16 16" /><path d="M28 12L12 28" /></>}</svg></span>
                <div>
                  <h2 className="display-md verdict g-verdict">{verdict}</h2>
                  <p className="body-sm g-sub">{sub}</p>
                </div>
              </div>
              {/* The person as their pass shows them: band, name, tier and
                  days, and only the zones they may enter (Vipin, 29 Sep). */}
              {person && <GateTicket fullName={person.fullName} orgName={person.orgName} role={person.roleText} typeCode={person.typeCode} dayValidity={person.dayValidity} vehicleReg={person.vehicleReg ?? null} stickerDue={stickerDue} tshirtSize={person.tshirtSize ?? null} tshirtGivenAt={snapshot.roster.find((row) => row.personId === person.personId)?.tshirtGivenAt ?? person.tshirtGivenAt ?? null} onTshirtGiven={() => void giveTshirt()} />}
              {/* What to do, which the verdict cannot say on its own. Reissue
                  at the gate is ACC-189b; until it lands, a lead handles it. */}
              {resolution.status === 'amber' && <div className="g-note">Do not hand over a second band. If theirs is lost or broken, call a lead.</div>}
              {doubleWarning && issued && <div className="g-note" role="alert"><b>Second band.</b> {doubleWarning}</div>}
              <div className="g-dock">
                {resolution.status === 'green' && <>
                  {/* Typed as the band is handed over, or left blank
                      (non-negotiable #6). A compact field, so it does not
                      push "Issue wristband" down the screen. */}
                  {!issued && <label className="field g-field"><span className="label-sm">Band serial <span className="ink-3">(optional)</span></span><input className="input input-mono" aria-label="Wristband serial, optional" value={serial} onChange={(event) => setSerial(event.target.value)} autoComplete="off" inputMode="text" /></label>}
                  <button type="button" onClick={() => void issue()} disabled={issued} className="btn btn-primary btn-gate"><Icon name="check-circle" />{issued ? 'Wristband issued' : 'Issue wristband'}</button>
                </>}
                {/* Before a band is issued this button abandons the scan;
                    after, it moves on. Different jobs, different words. */}
                <button type="button" onClick={nextPerson} className="btn btn-gate">{resolution.status === 'green' && !issued ? 'Cancel' : 'Next person'}</button>
                {message && <div role="status" className={`mono g-message${resolution.status === 'red' ? ' bad' : ''}`}>{message}</div>}
              </div>
            </div>}
          </div>
        </div>

        {/* Under the scanner, while it is waiting (Vipin, 1 Oct, prototype
            option A): today's bands and who is still to come, by team. Out
            of the way while a result or the name search has the card. */}
        {!resolution && !searchOpen && <PeopleFolds roster={snapshot.roster} ledger={snapshot.ledger} pending={pending} onOpen={(token) => {
          void resolve(passPayload(token))
          // A row far down the list: bring the result card, at the top, into view.
          splitRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
        }} />}
      </div>
      <style jsx global>{GATE_CSS}</style>
    </>
  )
}

const GATE_CSS = `
  /* Equal-width tabs, and the desk's own .page top space (40px, 24px on a
     phone): the nav is sticky at top 12px, so it overlaps its slot by 12px
     and the old 16px left the tabs 4px under it (Vipin, 29 Sep). The two
     tabs share one grid, columns the width of the wider label. */
  .r10 .gate-screen { padding-block: 0 var(--s-10); }

  /* One widget (Vipin, 30 Sep): the camera, the result and the name search
     take turns in the same card, so the eye never has to find where the
     answer went. Same 600px column, centred, on a phone and on a desk. */
  .r10 .gate-screen { max-width: 600px; margin-inline: auto; }
  .r10 .gate-split { display: grid; gap: var(--s-5); grid-template-columns: 1fr; align-items: start; }
  /* --pad is the tray's padding, so the verdict banner can bleed to the
     plate's edge (the plate is inset 6px inside it, base.css). */
  .r10 .gate-screen .panel { --pad: calc(6px + 28px); padding: var(--pad); }
  @media (max-width: 520px) { .r10 .gate-screen .panel { --pad: 18px; } }
  /* The gate's panels are the shared .panel (base.css): the tray and glass
     plate the vehicle screen and the desk cards draw. A flat box with its own
     hairline here read as a different component (Vipin, 29 Sep). */
  .r10 .gate-screen .panel { overflow: clip; }

  /* Phone: one panel, two states (scan or result), in place. The scan panel is
     clipped, not display:none, so the camera keeps decoding behind a result. */
  .r10 .gate-split[data-resolution] .panel-scan { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .r10 .panel-result { display: none; }
  .r10 .scan-head { padding-bottom: var(--s-4); text-align: center; }
  .r10 .scan-head > * { margin: 0; }
  .r10 .scan-head .verdict { color: var(--ink); }
  /* Searching by name: the list is the widget. The camera, its copy and the
     opener step aside so the matches are not pushed below the keyboard. */
  .r10 .gate-split[data-search] .scan-head,
  .r10 .gate-split[data-search] .viewfinder,
  .r10 .gate-split[data-search] .gate-status,
  .r10 .gate-split[data-search] .panel-scan > .btn[aria-expanded="true"] { display: none; }
  .r10 .gate-split[data-search] .name-search { margin-top: 0; }

  /* Not the mockup's #000 (Vipin, 29 Sep): a dark see-through well that
     belongs to the glass panel around it. The camera feed covers it once on. */
  .r10 .viewfinder { position: relative; aspect-ratio: 1 / 1; max-height: 46vh; margin-inline: auto; border-radius: var(--r-md); background: color-mix(in srgb, var(--bg) 55%, transparent); box-shadow: inset 0 0 0 1px var(--edge-line); overflow: hidden; display: grid; place-items: center; }
  .r10 .vf-video { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; }
  .r10 .vf-corner { position: absolute; z-index: 1; width: 26px; height: 26px; }
  /* The top-right corner's class is "tr", which the table-row primitive
     (.r10 .tr) also matches: 64px min-height, padding and a hairline, so that
     corner drew longer than the other three with a stray line under it. */
  .r10 .viewfinder .vf-corner.vf-corner { display: block; min-height: 0; padding: 0; background: none; box-shadow: none; }
  .r10 .vf-corner.tl { top: var(--s-4); left: var(--s-4); border-top: 3px solid var(--gold); border-left: 3px solid var(--gold); border-radius: var(--r-xs) 0 0 0; }
  .r10 .vf-corner.tr { top: var(--s-4); right: var(--s-4); border-top: 3px solid var(--gold); border-right: 3px solid var(--gold); border-radius: 0 var(--r-xs) 0 0; }
  .r10 .vf-corner.bl { bottom: var(--s-4); left: var(--s-4); border-bottom: 3px solid var(--gold); border-left: 3px solid var(--gold); border-radius: 0 0 0 var(--r-xs); }
  .r10 .vf-corner.br { bottom: var(--s-4); right: var(--s-4); border-bottom: 3px solid var(--gold); border-right: 3px solid var(--gold); border-radius: 0 0 var(--r-xs) 0; }
  .r10 .vf-sweep { position: absolute; z-index: 1; left: 0; right: 0; top: 0; height: 2px; background: linear-gradient(90deg, transparent, var(--go), transparent); opacity: 0; }
  .r10 .viewfinder[data-camera="on"] .vf-sweep { opacity: 1; animation: gate-sweep 2.4s linear infinite; }
  @keyframes gate-sweep { 0% { top: 4%; } 50% { top: 94%; } 100% { top: 4%; } }
  @media (prefers-reduced-motion: reduce) { .r10 .viewfinder[data-camera="on"] .vf-sweep { animation: none; top: 50%; opacity: .5; } }
  /* app/v2.css's bare .vf-start is inset:0 with a transparent ink3 glyph. */
  /* A labelled button, not a bare green disc: it is the screen's first action. */
  .r10 .viewfinder .vf-start { position: relative; inset: auto; z-index: 2; width: auto; margin: 0; padding-inline: var(--s-6); }

  .r10 .panel-scan > .btn { margin-top: var(--s-5); }
  .r10 .panel-scan .btn { padding-inline: var(--s-3); }
  @media (max-width: 400px) { .r10 .panel-scan .btn { font-size: 14px; letter-spacing: .04em; } }

  .r10 .name-search { display: grid; gap: var(--s-3); margin-top: var(--s-4); }
  .r10 .name-search .field { display: grid; gap: var(--s-2); }
  .r10 .name-search .field > span { color: var(--ink-2); font: 600 var(--t-label-sm)/1.2 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
  .r10 .name-search input[type="search"] { width: 100%; min-height: var(--h-control); padding: 0 var(--s-5); border: 0; border-radius: var(--r-pill); background: var(--raised); color: var(--ink); box-shadow: var(--edge); font: 400 var(--t-body)/1.2 var(--f-body); }
  .r10 .name-search input[type="search"]:focus { outline: 0; box-shadow: var(--edge-focus); }
  .r10 .name-search .mono { margin: 0; color: var(--ink-3); }
  .r10 .name-search-results { display: grid; gap: var(--s-2); }
  .r10 .name-search-result { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); min-height: 56px; padding: var(--s-2) var(--s-4); border-radius: var(--r-md); background: var(--raised); box-shadow: var(--edge); cursor: pointer; }
  .r10 .name-search-result[aria-selected="true"] { box-shadow: inset 0 0 0 2px var(--ink); }
  .r10 .name-search-result b { display: block; font-weight: 600; }
  .r10 .name-search-result small { display: block; color: var(--ink-3); font-size: var(--t-body-sm); }
  .r10 .name-search .btn.wide { width: 100%; min-height: var(--h-control-gate); }

  /* The verdict banner (Vipin, 1 Oct, prototype option B): the top of the
     card fills with the verdict colour, so it reads from arm's length in
     sun. Refuse has no ticket to show, so the whole card turns red. */
  .r10 .gate-screen .panel-result { flex-direction: column; }
  .r10 .gate-split[data-resolution] .panel-result { display: flex; }
  .r10 .result-body { flex: 1; display: flex; flex-direction: column; }
  .r10 .g-hero { display: flex; align-items: center; gap: var(--s-4); margin: calc(6px - var(--pad)) calc(6px - var(--pad)) var(--s-4); padding: calc(var(--pad) - 6px + var(--s-2)) calc(var(--pad) - 6px) calc(var(--pad) - 6px); border-radius: var(--r-lg) var(--r-lg) 0 0; background: var(--c); color: var(--bg); text-align: left; }
  .r10 .g-hero > div { min-width: 0; }
  .r10 .mark { flex: none; width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--bg) 14%, transparent); box-shadow: inset 0 0 0 2px var(--bg); }
  .r10 .mark svg { width: 30px; height: 30px; stroke: var(--bg); stroke-width: 3.5; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .r10 .panel-result .g-verdict { margin: 0; color: var(--bg); font-size: clamp(44px, 12vw, 60px); line-height: .95; }
  .r10 .g-sub { margin: var(--s-2) 0 0; color: var(--bg); font: 600 var(--t-body)/1.3 var(--f-body); }

  .r10 .gate-screen .panel-result[data-o="bad"]::before { background: var(--bad); background-image: none; }
  .r10 .panel-result[data-o="bad"] .g-hero { flex-direction: column; align-items: flex-start; margin-bottom: 0; background: none; }
  .r10 .panel-result[data-o="bad"] .g-sub { font-size: 18px; }
  .r10 .panel-result[data-o="bad"] .g-dock { position: static; margin-inline: 0; padding: 0; background: none; }
  .r10 .gate-screen .panel-result[data-o="bad"] .g-dock .btn.btn { --btn-fill: color-mix(in srgb, var(--bg) 80%, var(--ink)); background: var(--bg); color: var(--ink); box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; }
  .r10 .panel-result[data-o="bad"] .g-message.bad { color: var(--bg); }

  /* A new verdict arrives, it does not just appear: a short rise on the
     card's own easing, re-run per scan (keyed on scanSeq). */
  .r10 .result-body { animation: gate-verdict-in .34s var(--e-out) both; }
  .r10 .g-hero .mark { animation: gate-mark-in .42s var(--e-out) both; }
  .r10 .gate-screen .panel-result::before { transition: background-color var(--d-base) var(--e-out); }
  @keyframes gate-verdict-in { from { opacity: 0; transform: translateY(10px) scale(.985); } }
  @keyframes gate-mark-in { from { transform: scale(.6); } }
  @media (prefers-reduced-motion: reduce) {
    .r10 .result-body, .r10 .g-hero .mark { animation: none; }
    .r10 .gate-screen .panel-result::before { transition: none; }
  }
  .r10 .g-note { margin: var(--s-4) 0 0; padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--raised); color: var(--ink-2); }
  .r10 .g-note.bad { background: var(--bad-tint); color: var(--ink); }
  .r10 .panel-scan > .g-note { margin-top: var(--s-4); }
  .r10 .g-field { margin-top: 0; }
  .r10 .g-field .label-sm .ink-3 { text-transform: none; letter-spacing: normal; font-weight: 400; }
  .r10 .g-field .input { min-height: var(--h-control); }
  .r10 .g-dock { display: grid; gap: var(--s-3); margin-top: auto; padding-top: var(--s-4); }
  .r10 .g-dock .btn { width: 100%; }
  /* Phone: the buttons stay in thumb reach however tall the ticket is. */
  @media (max-width: 700px) {
    .r10 .g-dock { position: sticky; bottom: var(--s-3); z-index: 2; margin-inline: calc(var(--s-2) * -1); padding: var(--s-3) var(--s-2) 0; border-radius: var(--r-md); background: color-mix(in srgb, var(--surface) 94%, transparent); }
  }
  .r10 .g-message { color: var(--go); }
  .r10 .g-message.bad { color: var(--bad); }


  /* app/v2.css's unscoped .sub/.name-search* leak into this markup. */
  .r10 .gate-screen .name-search { margin-top: var(--s-4); padding: 0; border-radius: 0; background: none; box-shadow: none; }
  .r10 .gate-screen .name-search-results { gap: var(--s-2); background: none; }
  .r10 .gate-screen .name-search-results[hidden] { display: none; }
  .r10 .gate-screen .name-search-result { border: 0; color: var(--ink); text-align: left; background: var(--raised); }
  .r10 .gate-screen .name-search-result b { font-family: var(--f-body); font-size: var(--t-body); text-transform: none; }
  .r10 .gate-screen .name-search-result small { margin-top: 0; font-family: var(--f-body); font-size: var(--t-body-sm); letter-spacing: normal; }
  .r10 .gate-screen .name-search-result small.ns-tags { display: flex; flex-wrap: wrap; gap: 0 var(--s-3); margin-top: 2px; color: var(--ink-2); }
  .r10 .gate-screen .name-search .field input { min-height: var(--h-control); }
`
