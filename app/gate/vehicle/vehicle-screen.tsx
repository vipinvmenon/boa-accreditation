'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDomTheme } from '@/lib/use-theme'
import { PROP } from '@/lib/design'
import { gateBandCard } from '@/gate/band-card'
import { gateDb } from '@/gate/db'
import { readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { findActiveWristband, normalizePlate, queueVehicleEvent } from '@/gate/vehicle-flow'
import { Icon } from '@/components/icon'
import { useOutboxSync } from '@/gate/use-outbox-sync'
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
  const theme = useDomTheme()
  const p = PROP[theme]
  const [plate, setPlate] = useState('')
  const [reason, setReason] = useState('')
  const [askReason, setAskReason] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  const reasonRef = useRef<HTMLInputElement>(null)
  const { online, queued, sync, refresh } = useOutboxSync()

  useEffect(() => {
    void readGateSnapshot().then(setSnapshot)
  }, [])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const segment = document.querySelector<HTMLElement>('#vres [data-seg]')
      const active = segment?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      const thumb = segment?.querySelector<HTMLElement>('.thumb')
      if (active && thumb) {
        thumb.style.width = `${active.offsetWidth}px`
        thumb.style.transform = `translateX(${active.offsetLeft}px)`
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [snapshot, result])

  const normalized = useMemo(() => {
    try {
      return normalizePlate(plate)
    } catch {
      return null
    }
  }, [plate])

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
      const sticker = await gateDb.sticker.get(normalized)
      const ledger = await gateDb.ledger.where('personId').equals(sticker?.personId ?? '').toArray()
      const stickerIssue = ledger.find(
        (row) => row.kind === 'vehicle_sticker' && row.stickerNo === sticker?.stickerNo,
      )
      const wristband = sticker ? findActiveWristband(ledger, sticker.personId) : undefined
      const holder = sticker ? await gateDb.roster.where('personId').equals(sticker.personId).first() : undefined
      const holderCard = holder ? gateBandCard(holder.typeCode) : undefined
      const stickerOk = Boolean(sticker && stickerIssue)
      const wristbandOk = Boolean(wristband)

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
        personId: sticker?.personId ?? null,
        stickerCheckinId: stickerIssue?.id ?? null,
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
        ...(stickerIssue?.stickerNo ? { stickerNo: stickerIssue.stickerNo } : {}),
        ...(stickerIssue?.occurredAt ? { occurredAt: stickerIssue.occurredAt } : {}),
        ...(holderCard && wristband
          ? { wristbandDetail: `${holderCard.label} · ${holderCard.band} · band ${wristband.bandSerial ?? 'blank serial'}` }
          : {}),
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
          <input className="plate-in" id="vehicle-plate" aria-label="Vehicle registration" value={plate} onChange={(event) => { setPlate(event.target.value); setResult(null) }} placeholder="KA 05 MJ 8871" autoCapitalize="characters" autoComplete="off" style={{ margin: '14px 0 18px' }} />
          <div className="note" style={{ '--oc': 'var(--gold)' } as CSSProperties}><span className="mono" style={{ color: p.gold }}>Both or neither</span><br />A match on the plate is not a match on the vehicle. The officer checks the sticker against the plate in front of them.</div>
          <SyncStatus onSynced={() => readGateSnapshot().then(setSnapshot)} top={4} />
        </div></div>
        <div className="bz result rv" id="vres" data-o={outcome} aria-live="polite" aria-atomic="true" style={{ '--d': 2, '--oc': cleared ? p.grn : result ? p.bad : p.grn } as CSSProperties}><div className="pl" style={{ minHeight: 560 }}>
          <div className="flood" />
          <div className="r-top"><div className="seg" data-seg><span className="thumb" /><button type="button" data-o="ok" aria-pressed={cleared}>Cleared</button><button type="button" data-o="half" aria-pressed={false}>Band missing</button><button type="button" data-o="bad" aria-pressed={result?.outcome === 'turned_away'}>Not registered</button></div></div>
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
            {!result && askReason && <div className="field"><label htmlFor="vehicle-reason-first" className="sr-only">Turn-away reason</label><input ref={reasonRef} id="vehicle-reason-first" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" /></div>}
            <div className="dock stag" style={{ '--i': result ? 3 : 0 } as CSSProperties}><button type="button" onClick={() => void recordEvent('enter')} disabled={normalized === null || submitting} className="btn go big hov-invert-grn">{submitting ? 'Queueing…' : 'Log entry and open gate'}<span className="ic"><Icon name="arrow-right" /></span></button><button type="button" onClick={() => void recordEvent('turn_away')} disabled={normalized === null || submitting} className="btn bad wide hov-fill-bad">Turn away and log reason</button></div>
          </div>
        </div>
        </div>
      </div>
    </GateChrome>
  )
}
