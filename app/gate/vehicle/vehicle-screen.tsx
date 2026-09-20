'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useDomTheme } from '@/lib/use-theme'
import { PROP, passType } from '@/lib/design'
import { gateDb } from '@/gate/db'
import { readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { findActiveWristband, normalizePlate, queueVehicleEvent } from '@/gate/vehicle-flow'
import { GateChrome } from '../gate-chrome'

type Result = {
  outcome: 'cleared' | 'turned_away'
  text: string
  colour: string
  stickerNo?: string
  plate?: string
  wristbandDetail?: string
  occurredAt?: string
}

function formatIssuedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

export function VehicleScreen() {
  const theme = useDomTheme()
  const p = PROP[theme]
  const [plate, setPlate] = useState('')
  const [reason, setReason] = useState('')
  const [plateVisual, setPlateVisual] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [queued, setQueued] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)

  useEffect(() => {
    void gateDb.outbox.where('status').equals('pending').count().then(setQueued)
  }, [result])

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

  async function recordEvent() {
    if (normalized === null || submitting) return
    setSubmitting(true)
    try {
      const sticker = await gateDb.sticker.get(normalized)
      const ledger = await gateDb.ledger.where('personId').equals(sticker?.personId ?? '').toArray()
      const stickerIssue = ledger.find(
        (row) => row.kind === 'vehicle_sticker' && row.stickerNo === sticker?.stickerNo,
      )
      const wristband = sticker ? findActiveWristband(ledger, sticker.personId) : undefined
      const holder = sticker ? await gateDb.roster.where('personId').equals(sticker.personId).first() : undefined
      const cleared = Boolean(sticker && stickerIssue && wristband && plateVisual)
      const selectedReason = reason.trim()

      if (!cleared && selectedReason.length === 0) {
        setResult({ outcome: 'turned_away', text: 'Enter a reason to turn this vehicle away.', colour: p.bad })
        return
      }

      await queueVehicleEvent(gateDb, {
        plate: normalized,
        personId: sticker?.personId ?? null,
        stickerCheckinId: stickerIssue?.id ?? null,
        outcome: cleared ? 'cleared' : 'turned_away',
        reason: cleared ? null : selectedReason,
        checks: {
          sticker: Boolean(sticker && stickerIssue),
          wristband: Boolean(wristband),
          plateVisual,
        },
      })
      setQueued((value) => value + 1)
      setResult({
        outcome: cleared ? 'cleared' : 'turned_away',
        text: cleared ? 'Cleared — event queued.' : 'Turned away — event queued.',
        colour: cleared ? p.grn : p.bad,
        plate: plate.trim().toUpperCase(),
        ...(stickerIssue?.stickerNo ? { stickerNo: stickerIssue.stickerNo } : {}),
        ...(stickerIssue?.occurredAt ? { occurredAt: stickerIssue.occurredAt } : {}),
        ...(holder && wristband
          ? { wristbandDetail: `${passType(holder.typeCode).label} · ${passType(holder.typeCode).band} · Band ${wristband.bandSerial ?? 'blank serial'}` }
          : {}),
      })
      setReason('')
      setPlate('')
      setPlateVisual(false)
    } finally {
      setSubmitting(false)
    }
  }

  const cleared = result?.outcome === 'cleared'
  return (
    <GateChrome bandsIssued={snapshot?.ledger.filter((row) => row.kind === 'wristband').length ?? 0} approved={snapshot?.roster.length ?? 0} bmsPending={0}>
      <section className="head rv">
        <div><span className="tag gold">Vehicle entrance</span><h1 className="h1">Sticker and band. Both.</h1><p className="lede">Security&apos;s own screen. A sticker without a wristband does not enter. A wristband without a sticker parks outside. Stickers are bound to one registration and are not transferable.</p></div>
      </section>
      <div className="split">
        <div className="bz rv" style={{ '--d': 1 } as CSSProperties}><div className="pl pad">
          <span className="mono">Enter registration</span>
          <input className="plate-in" id="vehicle-plate" aria-label="Vehicle registration" value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="KA 05 MJ 8871" autoCapitalize="characters" autoComplete="off" />
          <div className="note" style={{ '--oc': 'var(--gold)' } as CSSProperties}><span className="mono" style={{ color: p.gold }}>Both or neither</span><br />A match on the plate is not a match on the vehicle. The officer checks the sticker against the plate in front of them.</div>
        </div></div>
        <div className="bz result rv" id="vres" style={{ '--d': 2, '--oc': cleared ? p.grn : result ? p.bad : p.grn } as CSSProperties}><div className="pl">
          <div className="flood" />
          <div className="r-body">
            <div className="g-verdict verdict">{cleared ? 'Cleared' : result ? 'Turned away' : 'Ready'}</div>
            <div className="vsub">{cleared && result?.stickerNo && result.occurredAt ? `Sticker ${result.stickerNo} · Issued ${formatIssuedAt(result.occurredAt)}` : result ? 'Event queued offline' : `${queued} queued · offline`}</div>
            <div className="checks">{[
              ['Vehicle sticker', cleared && result?.stickerNo && result.plate ? `${result.stickerNo} · Bound to ${result.plate}` : 'Sticker is bound to this registration'],
              ['Crew wristband', cleared && result?.wristbandDetail ? result.wristbandDetail : 'Active wristband required'],
              ['Plate matches sticker', 'Visual check by the officer at the barrier'],
            ].map(([label, detail]) => <div key={label} className="li"><span className={`ok${cleared ? '' : ' x'}`}>{cleared ? '✓' : '×'}</span><div><div className="nm">{label}</div><div className="sub">{detail}</div></div></div>)}</div>
            {result?.outcome === 'turned_away' && <div className="field"><label htmlFor="vehicle-reason" className="sr-only">Turn-away reason</label><input id="vehicle-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" /></div>}
            <div className="dock"><button type="button" onClick={() => { setPlateVisual(true); void recordEvent() }} disabled={normalized === null || submitting} className="btn go big hov-invert-grn">{submitting ? 'Queueing…' : 'Log entry & open gate'}<span className="ic">→</span></button><button type="button" onClick={() => { setPlateVisual(false); void recordEvent() }} disabled={normalized === null || submitting} className="btn bad wide hov-fill-bad">Turn away — log reason</button></div>
          </div>
        </div>
        </div>
      </div>
    </GateChrome>
  )
}
