'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
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
      setResult({ outcome: 'blocked', text: 'Type the reason, then press Turn away again.' })
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
    // ACC-190: bmsPending has no Dexie source (the gate is Dexie/outbox only,
    // no new network path) — D7 forbids hardcoding a proposal number, so the
    // "N not in BMS" pill is left off this screen rather than faked.
    <GateChrome bandsIssued={snapshot?.ledger.filter((row) => row.kind === 'wristband').length ?? 0} approved={snapshot?.roster.length ?? 0}>
      <div className="r10 vehicle-screen">
        {/* r8-vehicle.html opens with this segmented control, not a v2-style
            hero header (no "Vehicle entrance" tag, no h1, no lede) — the
            gate's own nav island already names the screen. */}
        <nav className="segmented" aria-label="Check in people or vehicles">
          <Link href="/gate">People</Link>
          <Link href="/gate/vehicle" aria-current="page">Vehicles</Link>
        </nav>

        <div className="veh-stack">
          <section className="veh-panel veh-entry">
            <label className="field" htmlFor="vehicle-plate">
              <span className="label-sm">Vehicle registration</span>
              <input
                id="vehicle-plate"
                className="input input-mono"
                aria-label="Vehicle registration"
                value={plate}
                onChange={(event) => { setPlate(event.target.value); setResult(null); setAskReason(false); setReason('') }}
                placeholder="KA01AB1234"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </label>
            <div className="veh-note">
              <span className="mono gold">Both or neither</span>
              <p>A match on the plate is not a match on the vehicle. The officer checks the sticker against the plate in front of them.</p>
            </div>
            <SyncStatus onSynced={() => readGateSnapshot().then(setSnapshot)} top={4} />
          </section>

          {/* ACC-130: the mock's Cleared/Band missing/Not registered tabs were rendered as
              buttons with no click handler — they only ever reflected the recorded outcome,
              which the verdict heading right below already states in words. Removed rather
              than kept as fake tabs; this card's `aria-live` carries it. */}
          <section className="veh-panel veh-result" id="vres" data-o={outcome} aria-live="polite" aria-atomic="true">
            {result && <>
            <h2 className="display-md verdict">{cleared ? 'Cleared' : result.outcome === 'blocked' ? 'Not cleared' : 'Turned away'}</h2>
            <p className="veh-sub">{cleared && result?.stickerNo && result.occurredAt ? `Sticker ${result.stickerNo} · Issued ${formatIssuedAt(result.occurredAt)}` : result.outcome === 'blocked' ? result.text : `${result.text} ${online ? 'Syncing.' : `Queued offline (${queued}).`}`}</p>
            <ul className="veh-checks">{[
              ['Vehicle sticker', cleared && result?.stickerNo && result.plate ? `${result.stickerNo}, bound to ${result.plate}` : 'Sticker is bound to this registration'],
              ['Crew wristband', cleared && result?.wristbandDetail ? result.wristbandDetail.replaceAll(' · ', ', ') : 'Active wristband required'],
              ['Plate matches sticker', 'Visual check by the officer at the barrier'],
            ].map(([label, detail]) => <li key={label}><span aria-hidden="true" className={`veh-mark ${cleared ? 'ok' : 'bad'}`}><Icon name={cleared ? 'check' : 'x'} /></span><div><div className="nm">{label}</div><div className="veh-check-detail">{detail}</div></div></li>)}</ul>
            {askReason && <div className="field veh-reason"><label htmlFor="vehicle-reason" className="sr-only">Turn-away reason</label><input ref={reasonRef} id="vehicle-reason" className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" /></div>}
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
            <h2 className="display-md verdict">{plateFacts.stickerOk && plateFacts.wristbandOk ? 'Ready to clear' : 'Will not clear'}</h2>
            <p className="veh-sub">{plateFacts.holderName
              ? `${plateFacts.holderName}${plateFacts.stickerNo ? ` · sticker ${plateFacts.stickerNo}` : ''} · check the sticker against the plate, then decide.`
              : 'Nothing is issued to this registration. Check the plate, or park it outside.'}</p>
            <ul className="veh-checks">{([
              ['Vehicle sticker', plateFacts.stickerOk, plateFacts.stickerOk && plateFacts.stickerNo ? `${plateFacts.stickerNo}, bound to ${plateFacts.plate}` : 'No sticker is issued to this registration'],
              ['Crew wristband', plateFacts.wristbandOk, plateFacts.wristbandOk && plateFacts.wristbandDetail ? plateFacts.wristbandDetail.replaceAll(' · ', ', ') : plateFacts.stickerOk ? 'The sticker holder has no active wristband' : 'Needs a sticker holder first'],
              ['Plate matches sticker', false, 'Yours to check at the barrier — the app cannot see the vehicle'],
            ] as [string, boolean, string][]).map(([label, ok, detail]) => <li key={label}><span aria-hidden="true" className={`veh-mark ${ok ? 'ok' : 'bad'}`}><Icon name={ok ? 'check' : 'x'} /></span><div><div className="nm">{label}</div><div className="veh-check-detail">{detail}</div></div></li>)}</ul>
            </>}
            {!result && askReason && <div className="field veh-reason"><label htmlFor="vehicle-reason-first" className="sr-only">Turn-away reason</label><input ref={reasonRef} id="vehicle-reason-first" className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" /></div>}
            {/* ACC-131: a disabled button with no explanation just looks broken to the
                officer at the barrier — title covers pointer users, the note text
                below covers everyone else (title has no touch/keyboard equivalent). */}
            <div className="veh-dock">
              <button type="button" onClick={() => void recordEvent('enter')} disabled={normalized === null || submitting} title={normalized === null ? 'Enter a valid registration first' : undefined} className="btn btn-primary btn-gate btn-block">{submitting ? 'Queueing…' : 'Log entry and open gate'}<Icon name="arrow-right" /></button>
              <button type="button" onClick={() => void recordEvent('turn_away')} disabled={normalized === null || submitting} title={normalized === null ? 'Enter a valid registration first' : undefined} className="btn btn-danger btn-gate btn-block">Turn away and log reason</button>
            </div>
            {/* ACC-159: the disabled buttons' reason as visible text. `title` is a
                hover affordance with no touch or keyboard equivalent, and this
                screen is used on a phone at a barrier, so it cannot be the only
                explanation. It stays for pointer users; these lines are the real one. */}
            {normalized === null && plate.trim().length > 0 && <p role="status" className="mono veh-status-bad">Not a valid registration format.</p>}
            {normalized === null && plate.trim().length === 0 && <p role="status" className="mono ink-2">Type the registration. The sticker and the wristband show here before you decide.</p>}
          </section>
        </div>
      </div>

      <style jsx global>{`
        /* Compound, not descendant: .r10 and .vehicle-screen sit on the same
           root element, so ".r10 .vehicle-screen" (a space) never matches. */
        .r10.vehicle-screen { padding-block: var(--s-6) var(--s-10); }
        .r10 .segmented { display: inline-flex; gap: 2px; padding: 3px; border-radius: var(--r-pill); background: var(--raised); box-shadow: inset 0 0 0 1px var(--hair); margin-bottom: var(--s-5); }
        .r10 .segmented a { display: inline-flex; align-items: center; min-height: 40px; padding: 0 var(--s-5); border-radius: var(--r-pill); text-decoration: none; color: var(--ink-2); font: 600 var(--t-label)/1 var(--f-label); letter-spacing: var(--track-label); text-transform: uppercase; }
        .r10 .segmented a[aria-current="page"] { background: var(--surface); color: var(--ink); box-shadow: inset 0 0 0 1px var(--hair); }
        .r10 .veh-stack { display: grid; gap: var(--s-5); max-width: 640px; }

        /* Gate surfaces are always solid: no backdrop-filter, on any viewport
           or input mode. Deliberately not the shared .card/.table/.empty/
           .panel group in app/r10/base.css, which gates its glass overlay to
           (hover: hover) and (min-width: 900px) rather than dropping it
           altogether — the gate drops it altogether (DESIGN.md Do's). */
        .r10 .veh-panel {
          border-radius: var(--r-lg);
          background: var(--surface);
          box-shadow: inset 0 0 0 1px var(--hair);
          padding: var(--s-6);
        }
        .r10 .veh-entry .field { margin-bottom: var(--s-4); }
        .r10 .veh-note { display: grid; gap: var(--s-1); margin-top: var(--s-4); padding: var(--s-3) var(--s-4); border-radius: var(--r-md); background: var(--wait-tint); }
        .r10 .veh-note p { margin: 0; color: var(--ink-2); font-size: var(--t-body-sm); }
        /* SyncStatus draws itself into existing whitespace below whatever it is
           mounted after (own comment, app/gate/sync-status.tsx) rather than
           taking layout space, so the panel reserves the room itself. */
        .r10.vehicle-screen .veh-entry { padding-bottom: calc(var(--s-6) + var(--s-5)); }

        .r10 .veh-result { position: relative; min-height: 420px; }
        .r10 .veh-result .verdict { margin: 0; color: var(--ink); }
        .r10 .veh-sub { margin: var(--s-2) 0 0; color: var(--ink-2); }
        .r10 .veh-checks { list-style: none; margin: var(--s-6) 0 0; padding: 0; display: grid; gap: var(--s-4); }
        .r10 .veh-checks li { display: flex; align-items: flex-start; gap: var(--s-3); }
        .r10 .veh-mark { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: 50%; }
        .r10 .veh-mark.ok { background: var(--ok-tint); color: var(--go); }
        .r10 .veh-mark.bad { background: var(--bad-tint); color: var(--bad); }
        .r10 .veh-checks .nm { font-family: var(--f-body); font-weight: 600; font-size: var(--t-body); letter-spacing: normal; text-transform: none; color: var(--ink); }
        .r10 .veh-check-detail { margin-top: 2px; color: var(--ink-3); font-size: var(--t-body-sm); }
        .r10 .veh-reason { margin-top: var(--s-4); }
        .r10 .veh-status-bad { color: var(--bad); }
        .r10 .veh-dock { margin-top: var(--s-6); display: grid; gap: var(--s-3); }
        .r10 .veh-dock + p { margin-top: var(--s-3); }

        @media (min-width: 560px) {
          .r10 .veh-dock { grid-auto-flow: column; grid-auto-columns: 1fr; }
        }

        @media (max-width: 700px) {
          .r10 .veh-panel { padding: var(--s-5); }
          .r10 .veh-result { min-height: 0; }
        }
      `}</style>
    </GateChrome>
  )
}
