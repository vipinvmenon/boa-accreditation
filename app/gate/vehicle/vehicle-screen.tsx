'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDomTheme } from '@/lib/use-theme'
import { PROP, passType } from '@/lib/design'
import { gateDb } from '@/gate/db'
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

  useEffect(() => {
    void gateDb.outbox.where('status').equals('pending').count().then(setQueued)
  }, [result])

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
    <GateChrome>
      <section className="g-pad-sec" style={{ borderBottom: `1px solid ${p.rule}` }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.gold, marginBottom: 16 }}>Vehicle entrance</div>
        <h1 className="g-h1" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 0.94, textTransform: 'uppercase', color: p.ink, margin: '0 0 14px' }}>Sticker and band. Both.</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: p.ink3, margin: 0, maxWidth: '62ch' }}>Security&apos;s own screen. A sticker without a wristband does not enter. A wristband without a sticker parks outside. Stickers are bound to one registration and are not transferable.</p>
      </section>
      <section className="g-vehicle-grid" style={{ display: 'grid', gap: 1, background: p.rule }}>
        <div style={{ background: 'var(--bg,#0A0A0A)', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.ink3 }}>Enter registration</div>
          <input id="vehicle-plate" aria-label="Vehicle registration" value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="KA 05 MJ 8871" autoCapitalize="characters" autoComplete="off" style={{ border: `1px solid ${p.gold}`, background: 'transparent', color: p.ink, padding: '20px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 24, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', textAlign: 'center', outline: 'none', width: '100%', minHeight: 68 }} />
          <div style={{ border: `1px solid ${p.rule}`, padding: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: p.gold, marginBottom: 10 }}>Both or neither</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: p.ink2 }}>A match on the plate is not a match on the vehicle. The officer checks the sticker against the plate in front of them.</div>
          </div>
        </div>
        <div style={{ background: 'var(--panel,#101012)', borderTop: `4px solid ${cleared ? p.grn : result ? p.bad : p.grn}`, padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div><div className="g-verdict" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 0.92, textTransform: 'uppercase', color: cleared || !result ? p.grn : p.bad }}>{cleared ? 'Cleared' : result ? 'Turned away' : 'Ready'}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: p.ink2, marginTop: 10 }}>{cleared && result?.stickerNo && result.occurredAt ? `Sticker ${result.stickerNo} · Issued ${formatIssuedAt(result.occurredAt)}` : result ? 'Event queued offline' : `${queued} queued · offline`}</div></div>
          <div style={{ borderTop: '1px solid var(--rule2,rgba(242,239,226,0.32))' }}>
            {[
              ['Vehicle sticker', cleared && result?.stickerNo && result.plate ? `${result.stickerNo} · Bound to ${result.plate}` : 'Sticker is bound to this registration'],
              ['Crew wristband', cleared && result?.wristbandDetail ? result.wristbandDetail : 'Active wristband required'],
              ['Plate matches sticker', 'Visual check by the officer at the barrier'],
            ].map(([label, detail]) => <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 0', borderBottom: `1px solid ${p.rule}` }}><span style={{ width: 22, height: 22, background: cleared ? p.grn : 'transparent', border: `1px solid ${cleared ? p.grn : 'rgba(242,239,226,0.32)'}`, color: p.on, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flex: '0 0 auto' }}>{cleared ? '✓' : ''}</span><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: p.ink }}>{label}</div><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, letterSpacing: '0.07em', textTransform: 'uppercase', color: p.ink3, marginTop: 3 }}>{detail}</div></div></div>)}
          </div>
          {result?.outcome === 'turned_away' && <><label htmlFor="vehicle-reason" className="sr-only">Turn-away reason</label><input id="vehicle-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="TURN-AWAY REASON" style={{ border: '1px solid var(--rule2,rgba(242,239,226,0.32))', background: 'transparent', color: p.ink, padding: '15px 16px', fontFamily: "'JetBrains Mono',monospace", minHeight: 52, width: '100%' }} /></>}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
            <button type="button" onClick={() => { setPlateVisual(true); void recordEvent() }} disabled={normalized === null || submitting} className="hov-invert-grn" style={{ cursor: 'pointer', border: `1px solid ${p.grn}`, background: p.grn, color: p.on, padding: 20, fontFamily: "'Anton',sans-serif", fontSize: 18, letterSpacing: '0.1em', textTransform: 'uppercase', minHeight: 60 }}>{submitting ? 'Queueing…' : 'Log entry & open gate'}</button>
            <button type="button" onClick={() => { setPlateVisual(false); void recordEvent() }} disabled={normalized === null || submitting} className="hov-fill-bad" style={{ cursor: 'pointer', border: `1px solid ${p.bad}`, background: 'transparent', color: p.bad, padding: 16, fontFamily: "'Oswald',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', minHeight: 52 }}>Turn away — log reason</button>
          </div>
        </div>
      </section>
    </GateChrome>
  )
}
