'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDomTheme } from '@/lib/use-theme'
import { PROP } from '@/lib/design'
import { gateDb } from '@/gate/db'
import { readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { normalizePlate, queueVehicleEvent, resolvePlate, type PlateResolution } from '@/gate/vehicle-flow'
import { Icon } from '@/components/icon'
import { useOutboxSync } from '@/gate/use-outbox-sync'
import { useGateSessionGuard } from '@/gate/use-session-guard'
import { GateChrome } from '../gate-chrome'
import { SyncStatus } from '../sync-status'

/**
 * 'blocked' = "Log entry" was pressed but a system check failed. Nothing is
 * logged; the officer either fixes it or turns the vehicle away with a reason.
 */
type Result = {
  outcome: 'cleared' | 'turned_away' | 'blocked'
  text: string
  colour: string
  stickerNo?: string
  plate?: string
  wristbandDetail?: string
  occurredAt?: string
}

function formatIssuedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).replace(',', '')
}

export function VehicleScreen() {
  // ACC-165: same mechanism as /gate — signed out, this sends the visitor
  // to /desk/login?next=/gate/vehicle instead of rendering the vehicle
  // screen and letting every write fail 401, silently.
  useGateSessionGuard('/gate/vehicle')
  const theme = useDomTheme()
  const p = PROP[theme]
  const [plate, setPlate] = useState('')
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  /**
   * ACC-159: what the plate resolves to, read as soon as it parses — not when
   * the officer presses. `null` means "nothing to say yet" (no valid plate);
   * a resolution means the three checks below are showing the real cache.
   */
  const [resolved, setResolved] = useState<PlateResolution | null>(null)
  const reasonRef = useRef<HTMLInputElement>(null)
  const { online, queued, sync, refresh } = useOutboxSync()

  useEffect(() => {
    void readGateSnapshot().then(setSnapshot)
  }, [])

  const normalized = useMemo(() => {
    try {
      return normalizePlate(plate)
    } catch {
      return null
    }
  }, [plate])

  /**
   * ACC-159 / ADR-022 — resolve on input, not on press.
   *
   * `live` guards the race: the officer types continuously at a barrier, so a
   * slower earlier lookup must not overwrite a newer plate's answer.
   */
  useEffect(() => {
    if (normalized === null) return
    let live = true
    void resolvePlate(gateDb, normalized).then((next) => {
      if (live) setResolved(next)
    })
    return () => {
      live = false
    }
  }, [normalized])

  /**
   * Only ever show facts that belong to the plate currently on screen. Keying
   * the resolution to its own plate rather than clearing it in the effect does
   * two jobs: no synchronous setState in an effect, and no window in which the
   * previous vehicle's sticker is displayed under a newly typed registration.
   */
  const plateFacts = resolved !== null && resolved.plate === normalized ? resolved : null

  /**
   * The button pressed IS the officer's decision, passed in explicitly.
   * Until ACC-109 both buttons did `setPlateVisual(x); recordEvent()` in one
   * click, so recordEvent read the previous render's value: the first
   * "Log entry" reported "Turned away" without logging, and a reason plus
   * "Turn away" could log a valid vehicle as CLEARED.
   *   enter     — the officer has looked at the plate and it matches the
   *               sticker (plateVisual: true). Clears only if the sticker
   *               and an active wristband also check out; otherwise nothing
   *               is logged and the screen says which check failed.
   *   turn_away — always logs turned_away, and needs a reason first.
   */
  async function recordEvent(intent: 'enter' | 'turn_away') {
    if (normalized === null || submitting) return
    const selectedReason = reason.trim()
    if (intent === 'turn_away' && selectedReason.length === 0) {
      setAskReason(true)
      setResult({ outcome: 'blocked', text: 'Type the reason, then press Turn away again.', colour: p.bad })
      window.setTimeout(() => reasonRef.current?.focus(), 0)
      return
    }
    setSubmitting(true)
    try {
      // ACC-159: the same resolver the panel above is already showing, so the
      // press can only confirm what the officer was told, never contradict it.
      const facts = await resolvePlate(gateDb, normalized)
      setResolved(facts)
      const { stickerOk, wristbandOk } = facts

      if (intent === 'enter' && !(stickerOk && wristbandOk)) {
        setAskReason(true)
        setResult({
          outcome: 'blocked',
          text: !stickerOk ? 'No sticker is issued to this plate. Not logged.' : 'The sticker holder has no active wristband. Not logged.',
          colour: p.bad,
        })
        return
      }

      const outcome = intent === 'enter' ? 'cleared' : 'turned_away'
      await queueVehicleEvent(gateDb, {
        plate: normalized,
        personId: facts.personId,
        stickerCheckinId: facts.stickerCheckinId,
        outcome,
        reason: outcome === 'cleared' ? null : selectedReason,
        checks: {
          sticker: stickerOk,
          wristband: wristbandOk,
          plateVisual: intent === 'enter',
        },
      })
      setResult({
        outcome,
        text: outcome === 'cleared' ? 'Cleared — entry logged.' : `Turned away — ${selectedReason}`,
        colour: outcome === 'cleared' ? p.grn : p.bad,
        plate: plate.trim().toUpperCase(),
        ...(facts.stickerNo ? { stickerNo: facts.stickerNo } : {}),
        ...(facts.stickerIssuedAt ? { occurredAt: facts.stickerIssuedAt } : {}),
        ...(facts.wristbandDetail ? { wristbandDetail: facts.wristbandDetail } : {}),
      })
      // The plate stays on show beside the verdict, as designed; editing it
      // clears the verdict and starts the next vehicle.
      setReason('')
      setAskReason(false)
      await refresh()
      await sync()
    } finally {
      setSubmitting(false)
    }
  }

  const cleared = result?.outcome === 'cleared'
  const outcome = cleared ? 'ok' : result ? 'bad' : undefined
  return (
    <GateChrome bandsIssued={snapshot?.ledger.filter((row) => row.kind === 'wristband').length ?? 0} approved={snapshot?.roster.length ?? 0} bmsPending={14}>
      <section className="head rv">
        <div><span className="tag gold">Vehicle entrance</span><h1 className="h1">Sticker and band. Both.</h1><p className="lede">Security&apos;s own screen. A sticker without a wristband does not enter. A wristband without a sticker parks outside.</p></div>
      </section>
      <div className="split">
        <div className="bz rv" style={{ '--d': 1 } as CSSProperties}><div className="pl pad">
          <span className="mono">Enter registration</span>
          <input className="plate-in" id="vehicle-plate" aria-label="Vehicle registration" value={plate} onChange={(event) => { setPlate(event.target.value); setResult(null); setAskReason(false); setReason('') }} placeholder="KA01AB1234" autoCapitalize="characters" autoComplete="off" style={{ margin: '14px 0 18px' }} />
          <div className="note" style={{ '--oc': 'var(--gold)' } as CSSProperties}><span className="mono" style={{ color: p.gold }}>Both or neither</span><br />A match on the plate is not a match on the vehicle. The officer checks the sticker against the plate in front of them.</div>
          <SyncStatus onSynced={() => readGateSnapshot().then(setSnapshot)} top={4} />
        </div></div>
        {/* ACC-130: the mock's Cleared/Band missing/Not registered tabs were rendered as
            buttons with no click handler — they only ever reflected the recorded outcome,
            which the verdict heading right below already states in words. Removed rather
            than kept as fake tabs; the `.r-body` verdict + aria-live on this card carry it. */}
        <div className="bz result rv" id="vres" data-o={outcome} aria-live="polite" aria-atomic="true" style={{ '--d': 2, '--oc': cleared ? p.grn : result ? p.bad : p.grn } as CSSProperties}><div className="pl" style={{ minHeight: 560 }}>
          <div className="flood" />
          <div className="r-body">
            {result && <>
            <h2 className="g-verdict verdict stag" style={{ '--i': 0 } as CSSProperties}>{cleared ? 'Cleared' : result.outcome === 'blocked' ? 'Not cleared' : 'Turned away'}</h2>
            <p className="vsub stag" style={{ '--i': 1 } as CSSProperties}>{cleared && result?.stickerNo && result.occurredAt ? `Sticker ${result.stickerNo} · Issued ${formatIssuedAt(result.occurredAt)}` : result.outcome === 'blocked' ? result.text : `${result.text} ${online ? 'Syncing.' : `Queued offline (${queued}).`}`}</p>
            <div className="checks stag" style={{ '--i': 2 } as CSSProperties}>{[
              ['Vehicle sticker', cleared && result?.stickerNo && result.plate ? `${result.stickerNo}, bound to ${result.plate}` : 'Sticker is bound to this registration'],
              ['Crew wristband', cleared && result?.wristbandDetail ? result.wristbandDetail.replaceAll(' · ', ', ') : 'Active wristband required'],
              ['Plate matches sticker', 'Visual check by the officer at the barrier'],
            ].map(([label, detail]) => <div key={label} className="li"><span aria-hidden="true" className={`ok${cleared ? '' : ' x'}`}><Icon name={cleared ? 'check' : 'x'} /></span><div><div className="nm">{label}</div><div className="sub">{detail}</div></div></div>)}</div>
            {askReason && <div className="field"><label htmlFor="vehicle-reason" className="sr-only">Turn-away reason</label><input ref={reasonRef} id="vehicle-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" /></div>}
            </>}
            {/* ACC-159 / ADR-022 — the officer is told before deciding.
                Deliberate, ADR'd deviation: the frozen contract draws this panel
                blank until a verdict exists. It is not pixel-gated, because the
                vehicle reference is captured on the settled `Cleared` result
                (scripts/visual-check.mjs, GATE_CAPTURE_STATE.vehicle), and the
                post-press branch above is left untouched so that shot cannot
                move. Both facts come from `resolved`, which is the same
                `resolvePlate` that `recordEvent` gates on. */}
            {!result && plateFacts && <>
            <h2 className="g-verdict verdict stag" style={{ '--i': 0 } as CSSProperties}>{plateFacts.stickerOk && plateFacts.wristbandOk ? 'Ready to clear' : 'Will not clear'}</h2>
            <p className="vsub stag" style={{ '--i': 1 } as CSSProperties}>{plateFacts.holderName
              ? `${plateFacts.holderName}${plateFacts.stickerNo ? ` · sticker ${plateFacts.stickerNo}` : ''} · check the sticker against the plate, then decide.`
              : 'Nothing is issued to this registration. Check the plate, or park it outside.'}</p>
            <div className="checks stag" style={{ '--i': 2 } as CSSProperties}>{([
              ['Vehicle sticker', plateFacts.stickerOk, plateFacts.stickerOk && plateFacts.stickerNo ? `${plateFacts.stickerNo}, bound to ${plateFacts.plate}` : 'No sticker is issued to this registration'],
              ['Crew wristband', plateFacts.wristbandOk, plateFacts.wristbandOk && plateFacts.wristbandDetail ? plateFacts.wristbandDetail.replaceAll(' · ', ', ') : plateFacts.stickerOk ? 'The sticker holder has no active wristband' : 'Needs a sticker holder first'],
              ['Plate matches sticker', false, 'Yours to check at the barrier — the app cannot see the vehicle'],
            ] as [string, boolean, string][]).map(([label, ok, detail]) => <div key={label} className="li"><span aria-hidden="true" className={`ok${ok ? '' : ' x'}`}><Icon name={ok ? 'check' : 'x'} /></span><div><div className="nm">{label}</div><div className="sub">{detail}</div></div></div>)}</div>
            </>}
            {!result && askReason && <div className="field"><label htmlFor="vehicle-reason-first" className="sr-only">Turn-away reason</label><input ref={reasonRef} id="vehicle-reason-first" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" /></div>}
            {/* ACC-131: a disabled button with no explanation just looks broken to the
                officer at the barrier — title covers pointer users, the note text
                below covers everyone else (title has no touch/keyboard equivalent). */}
            <div className="dock stag" style={{ '--i': result ? 3 : 0 } as CSSProperties}><button type="button" onClick={() => void recordEvent('enter')} disabled={normalized === null || submitting} title={normalized === null ? 'Enter a valid registration first' : undefined} className="btn go big hov-invert-grn">{submitting ? 'Queueing…' : 'Log entry and open gate'}<span className="ic"><Icon name="arrow-right" /></span></button><button type="button" onClick={() => void recordEvent('turn_away')} disabled={normalized === null || submitting} title={normalized === null ? 'Enter a valid registration first' : undefined} className="btn bad wide hov-fill-bad">Turn away and log reason</button></div>
            {/* ACC-159: the disabled buttons' reason as visible text. `title` is a
                hover affordance with no touch or keyboard equivalent, and this
                screen is used on a phone at a barrier, so it cannot be the only
                explanation. It stays for pointer users; these lines are the real one. */}
            {normalized === null && plate.trim().length > 0 && <p role="status" className="mono" style={{ color: p.bad }}>Not a valid registration format.</p>}
            {normalized === null && plate.trim().length === 0 && <p role="status" className="mono" style={{ color: p.ink2 }}>Type the registration. The sticker and the wristband show here before you decide.</p>}
          </div>
        </div>
        </div>
      </div>
    </GateChrome>
  )
}
