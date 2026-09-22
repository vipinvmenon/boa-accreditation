'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb, type LedgerRow } from '@/gate/db'
import { resolveScan, type GateResolution, type PendingActionProjection } from '@/gate/resolve'
import { enqueueIssue, readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { useOutboxSync } from '@/gate/use-outbox-sync'
import { readDeviceToken } from '@/gate/device-token'
import { scanFrame } from '@/gate/scanner'
import { DAY_VALIDITY, tierColour } from '@/lib/design'
import { gateBandCard } from '@/gate/band-card'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { GateChrome } from './gate-chrome'
import { PersonSearch } from './person-search'

export default function GatePage() {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  const [resolution, setResolution] = useState<GateResolution | null>(null)
  const [serial, setSerial] = useState('')
  // The pass token a band was just issued to. Locks "Issue wristband" until
  // "Next person" so a second tap cannot queue a duplicate issue.
  const [issuedTo, setIssuedTo] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const loadCache = useCallback(async () => {
    const current = await readGateSnapshot()
    // A device that has never pulled has no roster and no rosterAsOf. It
    // must not show a scanner that answers "Refuse" to every real pass —
    // /gate/setup's own copy promises exactly that.
    if (current.roster.length === 0 && current.meta.rosterAsOf === null) {
      router.replace('/gate/setup')
      return
    }
    setSnapshot(current)
  }, [router])

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
      readDeviceToken() === null
        ? 'Wristband recorded on this device. It cannot sync until gate setup is run again.'
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const segment = document.querySelector<HTMLElement>('#gres [data-seg]')
      const active = segment?.querySelector<HTMLElement>('button[aria-pressed="true"]')
      const thumb = segment?.querySelector<HTMLElement>('.thumb')
      if (active && thumb) {
        thumb.style.width = `${active.offsetWidth}px`
        thumb.style.transform = `translateX(${active.offsetLeft}px)`
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [snapshot, resolution])

  if (!snapshot) return <main style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)' }} />

  return (
    <GateChrome bandsIssued={snapshot.ledger.filter((row) => row.kind === 'wristband').length} approved={snapshot.roster.length} bmsPending={14}>
      <section className="head rv">
        <div><span className="tag">Crew check-in</span><h1 className="h1">Three outcomes. No fourth.</h1><p className="lede">The approved list lives on this device, so a scan resolves with the radio off and uploads when signal returns.</p></div>
      </section>
      <div className="split">
          <div className="bz rv" style={{ '--d': 1 } as CSSProperties}><div className="pl pad">
            <div className="meta"><span>{snapshot.meta.gateLabel}, {snapshot.meta.volunteerName}</span><span className="q">{online ? 'Online' : 'Offline'} | {queued} queued{canSync ? '' : ' | not syncing, run setup'}</span></div>
            <div className="vf">
              <i className="c" /><i className="c" /><i className="c" /><i className="c" />
              <div className="sweep"><i /></div>
              <video ref={videoRef} muted playsInline aria-label="Gate camera scanner" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              {/* getUserMedia needs a user gesture; the contract's mock has no real
                  camera to start, so it has no equivalent control. Rather than add a
                  second button the contract doesn't have (that cost 60px on every
                  gate variant — see docs/CURRENT-STATE.md), the gesture lives inside
                  the .vf frame itself, which already occupies this exact footprint. */}
              {!cameraActive && (
                <button type="button" onClick={() => void startCamera()} className="vf-start hov-text-grn" aria-label="Start camera">
                  <Icon name="scan" />
                </button>
              )}
            </div>
            <canvas ref={canvasRef} hidden />
            <input aria-label="Manual scanner input" onKeyDown={(event) => { if (event.key === 'Enter') void resolve(event.currentTarget.value) }} className="sr-only" />
            <div className="scan-copy"><h3>Point at the pass code</h3><p>{snapshot.roster.length} approved passes held on this device</p></div>
            <PersonSearch roster={snapshot.roster} onOpen={() => setCameraError(null)} onPick={(payload) => void resolve(payload)} />
            {cameraError && <div role="alert" className="note" style={{ '--oc': 'var(--bad)' } as CSSProperties}>{cameraError}</div>}
            <div style={{ marginTop: 26 }}><span className="mono">Last issued at this gate</span><div className="last" style={{ marginTop: 8 }}>
              {recent.map((row) => {
                const holder = personById.get(row.personId)
                const time = new Date(row.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
                const serial = row.bandSerial ?? row.stickerNo
                return <div key={row.id} className="li"><span className="bar" style={{ '--c': holder ? tierColour(holder.typeCode, theme) : 'var(--ink3)' } as CSSProperties} /><div><div className="nm">{holder?.fullName ?? row.kind}</div><div className="sub">{holder ? gateBandCard(holder.typeCode).label : row.kind}, {serial ? `band ${serial.replace(/^#/, '')}` : 'no serial'}, {time}</div></div><button type="button" className="void hov-text-bad">Void</button></div>
              })}
            </div><div className="foot-meta mono"><span>{snapshot.ledger.filter((row) => row.kind === 'wristband').length} issued today</span><span>Ledger append-only</span></div></div>
          </div></div>
          <div className="bz result rv" id="gres" data-o={outcome} aria-live="polite" aria-atomic="true" style={{ '--d': 2, '--oc': colour } as CSSProperties}><div className="pl">
            <div className="flood" /><div className="r-top"><div className="seg" data-seg><span className="thumb" /><button type="button" data-o="idle" aria-pressed={!outcome}>Scanning</button><button type="button" data-o="ok" aria-pressed={outcome === 'ok'}>Approved</button><button type="button" data-o="col" aria-pressed={outcome === 'col'}>Collected</button><button type="button" data-o="bad" aria-pressed={outcome === 'bad'}>Refuse</button></div></div>
            <div className="r-body">{!resolution && <div className="idle"><span className="mono">Waiting for a scan</span><h2 className="verdict stag" style={{ '--i': 0, color: 'var(--ink)' } as CSSProperties}>Ready</h2><p className="stag" style={{ '--i': 1 } as CSSProperties}>Hold the pass code inside the frame. Works with the radio off.</p></div>}{resolution && <><h2 className="g-verdict verdict stag" style={{ '--i': 0 } as CSSProperties}>{verdict}</h2><p className="vsub stag" style={{ '--i': 1 } as CSSProperties}>{issued ? 'Band issued · send them through' : resolution.status === 'green' ? 'Not yet collected · issue a band' : resolution.status === 'amber' ? 'A band was already issued to this person' : 'Unknown, rejected or voided token'}</p></>}
              {person && card && <div className="person"><div className="nm">{person.fullName}</div><div className="org">{person.orgName}<br /><span>{person.roleText} · {person.dayValidity === 'build_show' ? 'Build + show day' : DAY_VALIDITY[person.dayValidity]}</span></div></div>}
              {person && card && <><div className="gband" style={{ '--c': tierColour(person.typeCode, theme) } as CSSProperties}><b>{card.label}</b><small>{card.handOver}</small></div><div className="zones">{card.zones.map((zone) => <span key={zone.zone} className={zone.held ? undefined : 'off'}>{zone.text}</span>)}</div>{stickerDue && <div className="vehbox"><span className="mono">Sticker due</span><b>{person.vehicleReg}</b></div>}</>}
              {resolution?.status === 'amber' && <div className="note"><b>Already collected.</b> An issue is already recorded or queued. A reissue needs a supervisor note.</div>}
              {resolution?.status === 'red' && <div className="note" style={{ '--oc': 'var(--bad)' } as CSSProperties}><b>Do not let them in.</b> This token is not on the approved list.</div>}
              {resolution && <div className="dock">{resolution.status === 'green' && <><label className="serial"><span>Band serial</span><input aria-label="Wristband serial, optional" value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="optional" /></label><button type="button" onClick={() => void issue()} disabled={issued} className="btn go big hov-invert-grn">{issued ? 'Wristband issued' : 'Issue wristband'}<span className="ic"><Icon name="check" /></span></button></>}<button type="button" onClick={nextPerson} className="btn wide">Next person</button>{message && <div role="status" className="mono" style={{ color: resolution.status === 'red' ? 'var(--bad)' : 'var(--grn)' }}>{message}</div>}</div>}
            </div>
          </div></div>
      </div>
    </GateChrome>
  )
}
