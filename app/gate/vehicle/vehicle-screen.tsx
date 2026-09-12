'use client'

import { useEffect, useMemo, useState } from 'react'
import { useDomTheme } from '@/lib/use-theme'
import { PROP } from '@/lib/design'
import { gateDb } from '@/gate/db'
import { findActiveWristband, normalizePlate, queueVehicleEvent } from '@/gate/vehicle-flow'

type Result = {
  outcome: 'cleared' | 'turned_away'
  text: string
  colour: string
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
      })
      setReason('')
      setPlate('')
      setPlateVisual(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)', color: 'var(--ink,#F2EFE2)', paddingBottom: '64px' }}>
      <div className="d-shell">
        <header style={{ padding: '40px 18px 24px', borderBottom: `1px solid ${p.rule}` }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.gold, marginBottom: '16px' }}>
            Vehicle gate
          </div>
          <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(42px,7vw,68px)', lineHeight: 0.94, textTransform: 'uppercase', margin: '0 0 14px' }}>
            Check the plate
          </h1>
          <p style={{ fontSize: '14.5px', lineHeight: 1.55, color: p.ink3, margin: 0, maxWidth: '62ch' }}>
            A sticker without a wristband does not enter. A match on the plate is not a match on the vehicle.
          </p>
        </header>

        <section style={{ padding: '24px 18px', borderBottom: `1px solid ${p.rule}` }}>
          <label htmlFor="vehicle-plate" style={{ display: 'block', fontFamily: "'Oswald',sans-serif", fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: p.ink2, marginBottom: '8px' }}>
            Registration
          </label>
          <input
            id="vehicle-plate"
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            placeholder="KA 05 MJ 8871"
            autoCapitalize="characters"
            autoComplete="off"
            style={{ width: '100%', minHeight: '52px', border: '1px solid var(--rule2)', background: 'var(--panel)', color: p.ink, padding: '12px 14px', fontFamily: "'JetBrains Mono',monospace", fontSize: '20px', letterSpacing: '0.1em' }}
          />
          <label style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '18px', fontSize: '14px', color: p.ink2 }}>
            <input type="checkbox" checked={plateVisual} onChange={(event) => setPlateVisual(event.target.checked)} />
            Plate visually matches the vehicle
          </label>
          <label htmlFor="vehicle-reason" style={{ display: 'block', fontFamily: "'Oswald',sans-serif", fontSize: '12px', letterSpacing: '0.12em', textTransform: 'uppercase', color: p.ink2, margin: '22px 0 8px' }}>
            Turn-away reason, when required
          </label>
          <input
            id="vehicle-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="NO ACTIVE STICKER"
            style={{ width: '100%', minHeight: '48px', border: `1px solid ${p.rule}`, background: 'transparent', color: p.ink, padding: '12px 14px' }}
          />
          <button
            type="button"
            onClick={() => void recordEvent()}
            disabled={normalized === null || submitting}
            style={{ width: '100%', minHeight: '54px', marginTop: '20px', border: 0, background: normalized === null ? p.rule : p.gold, color: p.on, fontFamily: "'Oswald',sans-serif", fontSize: '14px', fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', cursor: normalized === null ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Queueing…' : 'Record vehicle event →'}
          </button>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 18px', borderBottom: `1px solid ${p.rule}`, fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase', color: p.ink3 }}>
          <span>Offline</span>
          <span style={{ color: queued > 0 ? p.gold : p.ink3 }}>{queued} queued</span>
        </div>
        {result && (
          <p role="status" style={{ margin: '18px', color: result.colour, fontFamily: "'Oswald',sans-serif", fontSize: '18px', textTransform: 'uppercase' }}>
            {result.text}
          </p>
        )}
      </div>
    </main>
  )
}
