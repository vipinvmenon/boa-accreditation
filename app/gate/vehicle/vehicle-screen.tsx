'use client'

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { gateDb } from '@/gate/db'
import { normalizePlate, queueVehicleEvent, resolvePlate, type PlateResolution } from '@/gate/vehicle-flow'
import { Icon, type IconName } from '@/components/icon'
import { useOutboxSync } from '@/gate/use-outbox-sync'
import { useGateSessionGuard } from '@/gate/use-session-guard'
import { GateStatus } from '../gate-status'
import { VehicleFolds } from '../gate-lists'

/** What was logged for the plate on screen. Nothing is logged without one. */
type Result = {
  outcome: 'cleared' | 'turned_away'
  reason?: string
  stickerNo?: string
  plate?: string
  holder?: string
  occurredAt?: string
}

/**
 * The turn-away reasons an officer picks with one tap (1 Oct review, item
 * 21): typing at a barrier was slow, and the three checks below are the
 * three reasons a vehicle is refused. "Other" still takes free text. Stored
 * as the same text column as before (lib/schemas/vehicle.ts, max 240).
 * ADR-031: no wristband reason; a vehicle is not refused for one.
 */
const NOT_REGISTERED = 'Not registered'
const NO_STICKER = 'No sticker'
const PLATE_MISMATCH = 'Plate does not match sticker'

type CheckState = 'ok' | 'bad' | 'todo'
type Check = { label: string; state: CheckState; detail: string }

const MARK_ICON: Record<CheckState, IconName> = { ok: 'check', bad: 'x', todo: 'eye' }

function formatIssuedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).replace(',', '')
}

/**
 * The checks as the officer needs them before deciding (ADR-031, 7 Oct): the
 * app says whether the plate is registered and to whom; the sticker and the
 * plate are the officer's to check, so they are drawn as steps, not crosses.
 * An unregistered plate shows only that, not three red rows for one fact.
 */
function checksFor(facts: PlateResolution): Check[] {
  if (!facts.registered) {
    return [{ label: 'Registered', state: 'bad', detail: 'This registration is not on the list' }]
  }
  return [
    { label: 'Registered', state: 'ok', detail: [facts.holderName, facts.holderDetail].filter(Boolean).join(', ') || 'On the list' },
    { label: 'Vehicle sticker', state: 'todo', detail: facts.stickerNo ? `Look for sticker ${facts.stickerNo} on the windscreen.` : 'Look for the vehicle sticker on the windscreen.' },
    { label: 'Plate matches sticker', state: 'todo', detail: 'Look at the plate yourself before you open the gate.' },
  ]
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="veh-checks">
      {checks.map((check) => (
        <li key={check.label}>
          <span aria-hidden="true" className={`veh-mark ${check.state}`}><Icon name={MARK_ICON[check.state]} /></span>
          <div><div className="nm">{check.label}</div><div className="veh-check-detail">{check.detail}</div></div>
        </li>
      ))}
    </ul>
  )
}

export function VehicleScreen() {
  // ACC-165: same mechanism as /gate — signed out, this sends the visitor
  // to /desk/login?next=/gate/vehicle instead of rendering the vehicle
  // screen and letting every write fail 401, silently.
  useGateSessionGuard('/gate/vehicle')
  const [plate, setPlate] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  /** Set when a press was refused by the checks; nothing was logged. */
  const [notice, setNotice] = useState<string | null>(null)
  /** "Turn away" on a vehicle that would clear opens the reasons. */
  const [reasonsOpen, setReasonsOpen] = useState(false)
  const [otherOpen, setOtherOpen] = useState(false)
  const [otherReason, setOtherReason] = useState('')
  /**
   * What the plate resolved to when the officer last pressed Check (or Enter,
   * or tapped a plate in the folds). `null` means "nothing to say yet"; a
   * resolution means the checks below are showing the real cache.
   */
  const [resolved, setResolved] = useState<PlateResolution | null>(null)
  /** Check was pressed for the plate as typed: an invalid one says so only then. */
  const [tried, setTried] = useState(false)
  const plateRef = useRef<HTMLInputElement>(null)
  const otherRef = useRef<HTMLInputElement>(null)
  /** Bumped after each logged decision so the folds re-read the outbox. */
  const [logged, setLogged] = useState(0)
  const { online, queued, failed, canSync, sync, refresh } = useOutboxSync()

  const normalized = useMemo(() => {
    try {
      return normalizePlate(plate)
    } catch {
      return null
    }
  }, [plate])

  /**
   * Only ever show facts that belong to the plate currently on screen: keyed
   * to its own plate, so there is no window in which the previous vehicle's
   * sticker is displayed under a newly typed registration.
   */
  const plateFacts = resolved !== null && resolved.plate === normalized ? resolved : null

  function resetDecision() {
    setResult(null)
    setNotice(null)
    setReasonsOpen(false)
    setOtherOpen(false)
    setOtherReason('')
  }

  /**
   * The button pressed IS the officer's decision, passed in explicitly
   * (ACC-109: reading it from state logged the previous render's choice).
   *   enter     — the officer has seen the sticker and the plate matches
   *               it (sticker and plateVisual: true). Clears only if the
   *               plate is registered (ADR-031); otherwise nothing is logged
   *               and the screen says so.
   *   turn_away — always logs turned_away, with the reason tapped or typed.
   */
  async function recordEvent(intent: 'enter' | 'turn_away', reasonText?: string) {
    if (normalized === null || submitting) return
    const reason = (reasonText ?? '').trim()
    if (intent === 'turn_away' && reason.length === 0) {
      otherRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      // ACC-159: the same resolver the panel is already showing, so the press
      // can only confirm what the officer was told, never contradict it.
      const facts = await resolvePlate(gateDb, normalized)
      setResolved(facts)
      if (intent === 'enter' && !facts.registered) {
        setNotice('This registration is not on the list. Nothing was logged.')
        return
      }

      const outcome = intent === 'enter' ? 'cleared' : 'turned_away'
      await queueVehicleEvent(gateDb, {
        plate: normalized,
        personId: facts.personId,
        stickerCheckinId: facts.stickerCheckinId,
        outcome,
        reason: outcome === 'cleared' ? null : reason,
        checks: {
          sticker: intent === 'enter',
          wristband: facts.wristbandOk,
          plateVisual: intent === 'enter',
        },
      })
      setNotice(null)
      setReasonsOpen(false)
      setOtherOpen(false)
      setOtherReason('')
      setResult({
        outcome,
        ...(outcome === 'turned_away' ? { reason } : {}),
        plate: plate.trim().toUpperCase(),
        ...(facts.stickerNo ? { stickerNo: facts.stickerNo } : {}),
        ...(facts.stickerIssuedAt ? { occurredAt: facts.stickerIssuedAt } : {}),
        ...(facts.holderName ? { holder: [facts.holderName, facts.holderDetail].filter(Boolean).join(', ') } : {}),
      })
      setLogged((n) => n + 1)
      await refresh()
      await sync()
    } finally {
      setSubmitting(false)
    }
  }

  /**
   * ADR-022, amended 2 Oct: the plate is looked up when the officer asks
   * (Check, Enter, or a plate tapped in the folds), not on every keystroke.
   * Still before any decision, so the officer is still told first. The facts
   * are keyed to their plate, so a slow lookup for an edited plate is never
   * shown under the new one.
   */
  async function check(value: string) {
    setTried(true)
    let next: string
    try {
      next = normalizePlate(value)
    } catch {
      return
    }
    setResolved(await resolvePlate(gateDb, next))
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }

  function lookUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void check(plate)
  }

  function editPlate(value: string) {
    setPlate(value)
    setResolved(null)
    setTried(false)
    resetDecision()
  }

  /** The vehicle is dealt with: an empty field, focused, for the next one. */
  function nextVehicle() {
    editPlate('')
    plateRef.current?.focus()
  }

  function openOther() {
    setOtherOpen(true)
    window.setTimeout(() => otherRef.current?.focus(), 0)
  }

  const cleared = result?.outcome === 'cleared'
  const clears = plateFacts !== null && plateFacts.registered
  // Before the officer decides, the verdict takes the colour of what the cache
  // says: green when both checks pass, red when the vehicle will not clear.
  const tone = result ? (cleared ? 'ok' : 'bad') : plateFacts ? (clears ? 'ok' : 'bad') : undefined
  const willNotClear = !result && plateFacts !== null && !clears
  // Only the reasons that can apply to this vehicle, the likely one first and
  // filled: an unregistered plate has no sticker to fault, and a registered
  // one fails only on what the officer sees.
  const reasons = !plateFacts ? [] : !plateFacts.registered ? [NOT_REGISTERED] : [NO_STICKER, PLATE_MISMATCH]
  const suggested = reasons[0] ?? null
  const showReasons = !result && plateFacts !== null && (willNotClear || reasonsOpen)
  const savedOffline = online ? null : 'Saved on this phone. It sends when signal returns.'

  return (
    <>
      <div className="vehicle-screen">

        <div className="veh-split">
          <section className="panel veh-card">
            {/* The lookup runs only on Check (or Enter): it reads the cache and
                drops the phone keyboard so the answer under it is not hidden
                behind it. It is a quiet button: it is not a decision (1 Oct
                review, item 19). */}
            <form className="field veh-lookup" onSubmit={(event) => void lookUp(event)}>
              <label className="display-sm veh-title" htmlFor="vehicle-plate">Vehicle registration</label>
              <div className="veh-lookup-row">
                <input
                  ref={plateRef}
                  id="vehicle-plate"
                  className="input input-mono"
                  aria-label="Vehicle registration"
                  value={plate}
                  onChange={(event) => editPlate(event.target.value)}
                  placeholder="KA 01 AB 1234"
                  autoCapitalize="characters"
                  autoComplete="off"
                  enterKeyHint="search"
                />
                <button type="submit" className="btn btn-gate veh-lookup-btn" disabled={plate.trim().length === 0}>
                  <Icon name="magnifying-glass" />Check
                </button>
              </div>
            </form>

            <div className="veh-result" id="vres" data-o={tone} aria-live="polite" aria-atomic="true">
              {/* After the decision: what was logged, and the way to the next vehicle. */}
              {result && <>
                <h2 className="display-md verdict">{cleared ? 'Cleared' : 'Turned away'}</h2>
                <p className="veh-sub">{cleared
                  ? `${result.stickerNo ? `Sticker ${result.stickerNo}${result.occurredAt ? `, issued ${formatIssuedAt(result.occurredAt)}` : ''}. ` : ''}Entry logged. Open the gate.`
                  : `Reason: ${result.reason ?? ''}.`}</p>
                {savedOffline && <p className="veh-sub ink-3">{savedOffline}</p>}
                {cleared && <CheckList checks={[
                  { label: 'Registered', state: 'ok', detail: result.holder ?? 'On the list' },
                  { label: 'Vehicle sticker', state: 'ok', detail: result.stickerNo ? `${result.stickerNo}, seen by you at the barrier` : 'Seen by you at the barrier' },
                  { label: 'Plate matches sticker', state: 'ok', detail: 'Checked by you at the barrier' },
                ]} />}
                <div className="veh-dock">
                  <button type="button" onClick={nextVehicle} className="btn btn-gate btn-block">Next vehicle</button>
                </div>
              </>}

              {/* ACC-159 / ADR-022 — the officer is told before deciding.
                  Deliberate, ADR'd deviation: the frozen contract draws this
                  panel blank until a verdict exists. Both facts come from
                  `resolved`, the same `resolvePlate` that `recordEvent` gates on. */}
              {!result && plateFacts && <>
                <h2 className="display-md verdict">{clears ? 'Ready to clear' : 'Will not clear'}</h2>
                <p className="veh-sub">{plateFacts.registered && plateFacts.holderName
                  ? `${plateFacts.holderName}${plateFacts.stickerNo ? `, sticker ${plateFacts.stickerNo}` : ''}.`
                  : 'This registration is not on the list.'}</p>
                {notice && <p role="status" className="veh-sub veh-status-bad">{notice}</p>}
                <CheckList checks={checksFor(plateFacts)} />
              </>}

              {/* ACC-131: an empty or unparseable plate says why in visible text.
                  No decision buttons until there is a plate to decide on. */}
              {!result && !plateFacts && <div className="veh-idle">
                {tried && normalized === null
                  ? <p role="status" className="veh-status-bad">Not a valid registration format.</p>
                  : <p role="status">Press Check to see who the vehicle is registered to before you decide.</p>}
              </div>}

              {/* The decision. A vehicle that clears gets the green button and a
                  quiet "Turn away"; one that will not clear gets the reasons
                  straight away, the likely one first and filled, and no dead
                  "Entry not possible" button (1 Oct review, items 20 and 21). */}
              {!result && plateFacts && <div className="veh-dock">
                {clears && <button type="button" onClick={() => void recordEvent('enter')} disabled={submitting} className="btn btn-primary btn-gate btn-block veh-enter"><Icon name="check-circle" />{submitting ? 'Logging…' : 'Log entry and open gate'}</button>}
                {clears && !reasonsOpen && <button type="button" onClick={() => setReasonsOpen(true)} disabled={submitting} className="btn btn-gate btn-block">Turn away</button>}
                {showReasons && <div className="veh-reasons" role="group" aria-labelledby="veh-reasons-label">
                  <p id="veh-reasons-label" className="label-sm">Turn away because</p>
                  <div className="veh-reason-grid">
                    {reasons.map((reason) => (
                      <button key={reason} type="button" disabled={submitting} onClick={() => void recordEvent('turn_away', reason)} className={`btn ${reason === suggested ? 'btn-danger veh-reason-lead' : ''}`}>{reason}</button>
                    ))}
                    {!otherOpen && <button type="button" disabled={submitting} onClick={openOther} className="btn">Other</button>}
                  </div>
                  {otherOpen && <form className="veh-other" onSubmit={(event) => { event.preventDefault(); void recordEvent('turn_away', otherReason) }}>
                    <label htmlFor="vehicle-reason" className="label-sm">Turn-away reason</label>
                    <div className="veh-lookup-row">
                      <input ref={otherRef} id="vehicle-reason" className="input" value={otherReason} onChange={(event) => setOtherReason(event.target.value)} maxLength={240} autoComplete="off" />
                      <button type="submit" disabled={submitting || otherReason.trim().length === 0} className="btn btn-danger veh-lookup-btn">Turn away</button>
                    </div>
                  </form>}
                </div>}
                {/* No decision yet and nothing logged: back to an empty plate field. */}
                <button type="button" onClick={nextVehicle} disabled={submitting} className="btn btn-block veh-cancel">Cancel</button>
              </div>}
            </div>
            <GateStatus online={online} queued={queued} failed={failed} canSync={canSync} />
          </section>
        </div>
        {/* With the plate field empty (Vipin, 1 Oct, prototype option A):
            today's cleared and turned-away vehicles, and the plates with a
            sticker still to come. A row fills the plate field. */}
        {plate.trim().length === 0 && !result && <VehicleFolds version={logged + queued} onOpen={(next) => { editPlate(next); void check(next) }} />}
      </div>

      <style jsx global>{`
        /* Compound, not descendant: .r10 and .vehicle-screen sit on the same
           root element, so ".r10 .vehicle-screen" (a space) never matches. */
        /* Same top space, column and status row as /gate (app/gate/page.tsx). */
        .r10 .vehicle-screen { padding-block: 0 var(--s-10); }
        .r10 .vehicle-screen { max-width: 600px; margin-inline: auto; }
        .r10 .veh-split { display: grid; gap: var(--s-5); grid-template-columns: 1fr; }
        @media (max-width: 520px) { .r10 .vehicle-screen .panel { padding: 18px; } }
        .r10 .vehicle-screen .panel { overflow: clip; }
        .r10 .veh-lookup { display: grid; gap: var(--s-2); }
        /* Set like the gate's "Scan a pass" heading, centred over the plate field. */
        .r10 .veh-title { padding-bottom: var(--s-2); color: var(--ink); text-align: center; }
        .r10 .veh-lookup-row { display: flex; gap: var(--s-3); align-items: stretch; }
        /* The plate field takes the full width; Check sits under it. */
        .r10 .veh-lookup .veh-lookup-row { flex-direction: column; }
        .r10 .veh-lookup .veh-lookup-btn { width: 100%; }
        .r10 .veh-lookup-btn i { transition: transform var(--d-base) var(--e-spring); }
        @media (hover: hover) {
          .r10 .veh-lookup .veh-lookup-btn:not([disabled]):hover { --btn-ring: var(--ink-3); transform: translateY(-2px); box-shadow: inset 0 0 0 1px var(--btn-ring), inset 0 1px 0 var(--btn-hi), 0 10px 22px -14px rgb(0 0 0 / 70%); }
          .r10 .veh-lookup .veh-lookup-btn:not([disabled]):hover i { transform: scale(1.18) rotate(-12deg); }
        }
        .r10 .veh-lookup .veh-lookup-btn:not([disabled]):active { transform: scale(.98); }
        .r10 .veh-lookup-row .input { flex: 1; min-width: 0; }
        .r10 .veh-lookup-btn { flex: none; width: auto; min-width: 112px; }
        @media (max-width: 520px) {
          .r10 .veh-lookup-row .input { font-size: 17px; letter-spacing: .02em; padding-inline: var(--s-3); }
          .r10 .veh-lookup-btn { min-width: 0; padding-inline: var(--s-4); font-size: 14px; }
        }


        .r10 .veh-result { --c: var(--ink); display: flex; flex-direction: column; }
        .r10 .veh-result[data-o="ok"] { --c: var(--go); }
        .r10 .veh-result[data-o="bad"] { --c: var(--bad); }
        .r10 .veh-result:has(> .verdict) { margin-top: var(--s-5); padding-top: var(--s-5); border-top: 1px solid var(--edge-line); }
        .r10 .veh-idle { text-align: left; color: var(--ink-3); padding: var(--s-4) 0 0; margin: auto 0; }
        .r10 .veh-idle p { margin: 0; font-size: var(--t-body-sm); line-height: 1.4; }
        .r10 .veh-result .verdict { margin: 0; color: var(--c); }
        .r10 .veh-sub { margin: var(--s-2) 0 0; color: var(--ink-2); }
        .r10 .veh-sub.ink-3 { color: var(--ink-3); }
        .r10 .veh-checks { list-style: none; margin: var(--s-5) 0 0; padding: 0; display: grid; gap: var(--s-3); }
        .r10 .veh-checks li { display: flex; align-items: center; gap: var(--s-3); }
        .r10 .veh-mark { --c: var(--go); display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%; background: color-mix(in srgb, var(--c) 18%, transparent); box-shadow: inset 0 0 0 2px var(--c); color: var(--c); font-size: 18px; }
        .r10 .veh-mark.bad { --c: var(--bad); }
        /* The officer's own step: neutral, not a pass or a fail. */
        .r10 .veh-mark.todo { --c: var(--ink-3); background: none; color: var(--ink-2); }
        .r10 .veh-checks .nm { font-family: var(--f-body); font-weight: 600; font-size: var(--t-body); letter-spacing: normal; text-transform: none; color: var(--ink); }
        .r10 .veh-check-detail { color: var(--ink-3); font-size: var(--t-body-sm); }
        .r10 .veh-status-bad { color: var(--bad); }
        .r10 .veh-dock { margin-top: var(--s-5); display: grid; gap: var(--s-3); }
        .r10 .veh-reasons { display: grid; gap: var(--s-2); }
        .r10 .veh-reasons > .label-sm { margin: 0; color: var(--ink-2); }
        /* Wrapping, not a fixed two-column grid: the lead reason takes the
           row, and whatever follows shares the next one or fills it alone. */
        .r10 .veh-reason-grid { display: flex; flex-wrap: wrap; gap: var(--s-2); }
        .r10 .veh-reason-grid .btn { flex: 1 1 140px; min-height: var(--h-control-gate); padding-inline: var(--s-3); white-space: normal; line-height: 1.15; }
        .r10 .veh-reason-grid .veh-reason-lead { flex-basis: 100%; }
        /* Specific enough to beat glass.css's see-through .btn fill. */
        .r10 .veh-reason-grid .btn.btn-danger.veh-reason-lead.veh-reason-lead { --btn-fg: var(--bg); color: var(--bg); background: var(--bad); }
        .r10 .veh-other { display: grid; gap: var(--s-2); margin-top: var(--s-1); }
        /* Phone: the decision stays in thumb reach however tall the checks are. */
        @media (max-width: 700px) {
          .r10 .veh-dock { position: sticky; bottom: var(--s-3); z-index: 2; margin-inline: calc(var(--s-2) * -1); padding: var(--s-3) var(--s-2) 0; border-radius: var(--r-md); background: color-mix(in srgb, var(--surface) 94%, transparent); }
        }
      `}</style>
    </>
  )
}
