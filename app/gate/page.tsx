'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb, type LedgerRow } from '@/gate/db'
import { resolveScan, type GateResolution, type PendingActionProjection } from '@/gate/resolve'
import { drainOutbox, enqueueIssue, queuedCount, readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { scanFrame } from '@/gate/scanner'
import { GateChrome } from './gate-chrome'

export const dynamic = 'force-static'

const emptyResolution: GateResolution = { status: 'red', reason: 'invalid_token' }

export default function GatePage() {
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  const [resolution, setResolution] = useState<GateResolution>(emptyResolution)
  const [serial, setSerial] = useState('')
  const [queued, setQueued] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [online, setOnline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const loadCache = useCallback(async () => {
    const current = await readGateSnapshot()
    setSnapshot(current)
    setQueued(await queuedCount())
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCache(), 0)
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
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
    setResolution(resolveScan(raw, roster, byPerson, pending))
    setSerial('')
    setMessage(null)
  }, [snapshot])

  const startCamera = useCallback(async () => {
    setCameraError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      if (!videoRef.current) return
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    } catch {
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
    if (resolution.status !== 'green') return
    const token = resolution.person.passToken
    const action: GateIssue = {
      idempotencyKey: crypto.randomUUID(),
      passToken: token,
      kind: 'wristband',
      bandSerial: serial,
      vehicleReg: resolution.person.vehicleReg,
      isReissue: false,
    }
    await enqueueIssue(action)
    setQueued(await queuedCount())
    setMessage('Wristband queued locally. The ledger will update when the outbox drains.')
    const deviceToken = sessionStorage.getItem('boa-gate-device-token')
    if (deviceToken && navigator.onLine) {
      await drainOutbox(deviceToken)
      setQueued(await queuedCount())
      await loadCache()
    }
  }

  const colour = resolution.status === 'green' ? 'var(--grn,#00F5A5)' : resolution.status === 'amber' ? 'var(--gold,#E3BB72)' : 'var(--bad,#FF6B5A)'
  const verdict = resolution.status === 'green' ? 'Approved' : resolution.status === 'amber' ? 'Collected' : resolution.status === 'red' ? 'Refuse' : 'Ready'
  const person = resolution.status === 'red' ? null : resolution.person
  const recent = useMemo(() => snapshot?.ledger.slice(-3).reverse() ?? [], [snapshot])

  if (!snapshot) return <main style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)' }} />

  return (
    <GateChrome bandsIssued={snapshot.ledger.filter((row) => row.kind === 'wristband').length} approved={snapshot.roster.length} bmsPending={0}>
      <section className="g-pad-sec" style={{ borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--grn,#00F5A5)', marginBottom: 16 }}>Crew check-in</div>
        <h1 className="g-h1" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 0.94, textTransform: 'uppercase', color: 'var(--ink,#F2EFE2)', margin: '0 0 14px' }}>Three outcomes. No fourth.</h1>
        <p style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--ink3,rgba(242,239,226,0.42))', margin: 0, maxWidth: '62ch' }}>The approved list is held on the device, so a scan resolves with the radio off and writes flush when signal returns. There is no ambiguous state and no discretion at the gate.</p>
      </section>
      <div style={{ display: 'flex', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))', overflowX: 'auto' }}>
        {(['Scanning', 'Approved', 'Collected', 'Refuse'] as const).map((label) => <button key={label} type="button" style={{ cursor: 'pointer', border: 0, borderRight: '1px solid var(--rule,rgba(242,239,226,0.16))', background: label === 'Approved' ? 'var(--grn,#00F5A5)' : 'transparent', color: label === 'Approved' ? 'var(--on,#0A0A0A)' : 'var(--ink3,rgba(242,239,226,0.42))', padding: '13px 18px', fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</button>)}
      </div>
      <section className="g-grid" style={{ display: 'grid', gap: 1, background: 'var(--rule,rgba(242,239,226,0.16))' }}>
        <div style={{ background: 'var(--bg,#0A0A0A)', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>
            <span>{snapshot.meta.gateLabel} | {snapshot.meta.volunteerName}</span><span style={{ color: 'var(--gold,#E3BB72)' }}>{online ? 'Online' : 'Offline'} | {queued} queued</span>
          </div>
          <div style={{ width: '100%', maxWidth: 280, margin: '0 auto', aspectRatio: '1', position: 'relative', border: '1px solid var(--rule,rgba(242,239,226,0.16))', background: 'var(--panel,#101012)', overflow: 'hidden' }}>
            <video ref={videoRef} muted playsInline aria-label="Gate camera scanner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 14, border: '2px solid var(--grn,#00F5A5)', opacity: 0.9 }} />
            <div style={{ position: 'absolute', left: 14, right: 14, top: '50%', height: 2, background: 'var(--grn,#00F5A5)' }} />
          </div>
          <canvas ref={canvasRef} hidden />
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 17, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink,#F2EFE2)' }}>Point at the pass code<div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 400, letterSpacing: '0.08em', color: 'var(--ink3,rgba(242,239,226,0.42))', marginTop: 7 }}>{snapshot.roster.length} approved passes held on this device</div></div>
          <button type="button" onClick={() => void startCamera()} style={{ cursor: 'pointer', border: '1px solid var(--rule2,rgba(242,239,226,0.32))', background: 'transparent', color: 'var(--ink2,rgba(242,239,226,0.72))', padding: 15, fontFamily: "'Oswald',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', minHeight: 50 }}>Can&apos;t scan — search by name</button>
          {cameraError && <div role="alert" style={{ color: 'var(--bad,#FF6B5A)', fontSize: 13 }}>{cameraError}</div>}
          <div style={{ borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))', paddingTop: 16 }}>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))', marginBottom: 10 }}>Last issued at this gate</div>
            {recent.map((row) => <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))', fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}><span style={{ width: 7, height: 16, background: 'var(--grn,#00F5A5)' }} /><span style={{ flex: 1 }}>{row.kind} · {row.bandSerial ?? row.stickerNo ?? 'blank serial'}</span><button type="button" style={{ border: 0, background: 'transparent', color: 'var(--ink3)', fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase' }}>Void</button></div>)}
          </div>
          <div style={{ marginTop: 'auto', borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))', paddingTop: 14, display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))' }}><span>{snapshot.ledger.filter((row) => row.kind === 'wristband').length} issued today</span><span>Ledger append-only</span></div>
        </div>
        <div style={{ background: 'var(--panel,#101012)', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20, borderTop: `4px solid ${colour}` }}>
          <div>
            <div className="g-verdict" style={{ fontFamily: "'Anton',sans-serif", lineHeight: 0.92, textTransform: 'uppercase', color: colour }}>{verdict}</div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: colour, marginTop: 10 }}>{resolution.status === 'green' ? 'Not yet collected · issue a band' : resolution.status === 'amber' ? 'A band was already issued to this person' : 'Unknown, rejected or voided token'}</div>
          </div>
          {person && <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ borderTop: '1px solid var(--rule2,rgba(242,239,226,0.32))', paddingTop: 18 }}>
              <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 34, lineHeight: 1, textTransform: 'uppercase' }}>{person.personId.slice(0, 8)}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink2,rgba(242,239,226,0.72))' }}>Approved pass · {person.vehicleReg ?? 'no vehicle registered'}</div>
            </div>
            <div style={{ border: '1px solid var(--grn,#00F5A5)' }}><div style={{ height: 12, background: 'var(--grn,#00F5A5)' }} /><div style={{ padding: 16 }}><div style={{ fontFamily: "'Anton',sans-serif", fontSize: 30, textTransform: 'uppercase', color: 'var(--grn,#00F5A5)' }}>Approved</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>HAND OVER THE APPROVED BAND</div></div></div>
          </div>}
          {resolution.status === 'amber' && <div style={{ border: '1px solid var(--gold,#E3BB72)', padding: 16 }}><div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--gold,#E3BB72)', marginBottom: 10 }}>Already collected</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 16, textTransform: 'uppercase' }}>An issue is already recorded or queued.</div><div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink2,rgba(242,239,226,0.72))', marginTop: 9 }}>A reissue needs a supervisor note. It adds a ledger row; it does not replace the first.</div></div>}
          {resolution.status === 'red' && <div style={{ border: '1px solid var(--bad,#FF6B5A)', padding: 16, fontSize: 14.5, lineHeight: 1.55 }}>This token is not on the approved list. Do not issue a wristband.</div>}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
            {resolution.status === 'green' && <><input aria-label="Wristband serial, optional" value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="WRISTBAND SERIAL — OPTIONAL" style={{ border: '1px solid var(--rule2,rgba(242,239,226,0.32))', background: 'transparent', color: 'var(--ink,#F2EFE2)', padding: '15px 16px', fontFamily: "'JetBrains Mono',monospace", minHeight: 52, width: '100%' }} /><button type="button" onClick={() => void issue()} style={{ cursor: 'pointer', border: '1px solid var(--grn,#00F5A5)', background: 'var(--grn,#00F5A5)', color: 'var(--on,#0A0A0A)', padding: 20, fontFamily: "'Anton',sans-serif", fontSize: 19, letterSpacing: '0.1em', textTransform: 'uppercase', minHeight: 62 }}>Issue wristband</button></>}
            <button type="button" onClick={() => { setResolution(emptyResolution); setMessage(null) }} style={{ cursor: 'pointer', border: '1px solid var(--rule2,rgba(242,239,226,0.32))', background: 'transparent', color: 'var(--ink2,rgba(242,239,226,0.72))', padding: 16, fontFamily: "'Oswald',sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', minHeight: 52 }}>Next person</button>
            {message && <div role="status" style={{ color: 'var(--grn,#00F5A5)', fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>{message}</div>}
          </div>
        </div>
      </section>
    </GateChrome>
  )
}
