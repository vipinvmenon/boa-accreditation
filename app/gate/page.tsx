'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { gateIssueSchema, type GateIssue } from '@/lib/schemas/gate'
import { gateDb, type LedgerRow } from '@/gate/db'
import { resolveScan, type GateResolution, type PendingActionProjection } from '@/gate/resolve'
import { drainOutbox, enqueueIssue, queuedCount, readGateSnapshot, type GateSnapshot } from '@/gate/client'
import { scanFrame } from '@/gate/scanner'
import { ALL_ZONES, DAY_VALIDITY, passType, typeColour, type PassTypeCode } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'
import { GateChrome } from './gate-chrome'

function zonesFor(typeCode: PassTypeCode) {
  const held = new Set(passType(typeCode).zones)
  return ALL_ZONES.map((zone) => ({ held: held.has(zone), text: held.has(zone) ? zone : `—— ${zone}` }))
}

function presentationTypeLabel(typeCode: PassTypeCode) {
  return typeCode === 'crew' ? 'Working crew' : passType(typeCode).label
}

export default function GatePage() {
  const [snapshot, setSnapshot] = useState<GateSnapshot | null>(null)
  const [resolution, setResolution] = useState<GateResolution | null>(null)
  const [serial, setSerial] = useState('')
  const [queued, setQueued] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
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
    if (!resolution || resolution.status !== 'green') return
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

  const theme = useDomTheme()
  const colour = resolution?.status === 'green' ? 'var(--grn,#00F5A5)' : resolution?.status === 'amber' ? 'var(--gold,#E3BB72)' : resolution ? 'var(--bad,#FF6B5A)' : 'var(--ink3)'
  const verdict = resolution?.status === 'green' ? 'Approved' : resolution?.status === 'amber' ? 'Collected' : resolution?.status === 'red' ? 'Refuse' : 'Ready'
  const outcome = resolution?.status === 'green' ? 'ok' : resolution?.status === 'amber' ? 'col' : resolution?.status === 'red' ? 'bad' : undefined
  const person = resolution?.status === 'red' ? null : resolution?.person
  const type = person ? passType(person.typeCode) : null
  const stickerDue = resolution?.status === 'green' ? resolution.stickerDue : false
  const recent = useMemo(() => snapshot?.ledger.slice(-3).reverse() ?? [], [snapshot])
  const personById = useMemo(() => new Map(snapshot?.roster.map((row) => [row.personId, row]) ?? []), [snapshot])
  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase()
    if (!snapshot || term.length < 2) return []
    return snapshot.roster
      .filter((row) => `${row.fullName} ${row.roleText} ${row.orgName} ${row.vehicleReg ?? ''}`.toLowerCase().includes(term))
      .slice(0, 8)
  }, [snapshot, searchQuery])

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
            <div className="meta"><span>{snapshot.meta.gateLabel}, {snapshot.meta.volunteerName}</span><span className="q">{online ? 'Online' : 'Offline'} | {queued} queued</span></div>
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
            <button type="button" onClick={() => { setSearchOpen(true); setCameraError(null) }} className="btn wide hov-outline-grn">Can&apos;t scan? Search by name<span className="ic"><Icon name="magnifying-glass" /></span></button>
            {searchOpen && (
              <div className="name-search">
                <label className="field">
                  <span>Search approved roster</span>
                  <input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Name, phone or organisation" />
                </label>
                {searchQuery.trim().length >= 2 && searchResults.length === 0 && <p className="mono">No approved person matches that search.</p>}
                {searchResults.length > 0 && (
                  <div className="name-search-results">
                    {searchResults.map((row) => (
                      <button key={row.personId} type="button" className="name-search-result" onClick={() => { setSearchOpen(false); setSearchQuery(''); void resolve(row.passToken) }}>
                        <span><b>{row.fullName}</b><small>{row.orgName} · {row.roleText}</small></span>
                        <Icon name="arrow-right" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {cameraError && <div role="alert" className="note" style={{ '--oc': 'var(--bad)' } as CSSProperties}>{cameraError}</div>}
            <div style={{ marginTop: 26 }}><span className="mono">Last issued at this gate</span><div className="last" style={{ marginTop: 8 }}>
              {recent.map((row) => {
                const holder = personById.get(row.personId)
                const time = new Date(row.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
                const serial = row.bandSerial ?? row.stickerNo
                return <div key={row.id} className="li"><span className="bar" style={{ '--c': typeColour(holder?.typeCode ?? 'crew', theme) } as CSSProperties} /><div><div className="nm">{holder?.fullName ?? row.kind}</div><div className="sub">{holder ? presentationTypeLabel(holder.typeCode) : row.kind}, {serial ? `band ${serial.replace(/^#/, '')}` : 'no serial'}, {time}</div></div><button type="button" className="void hov-text-bad">Void</button></div>
              })}
            </div><div className="foot-meta mono"><span>{snapshot.ledger.filter((row) => row.kind === 'wristband').length} issued today</span><span>Ledger append-only</span></div></div>
          </div></div>
          <div className="bz result rv" id="gres" data-o={outcome} aria-live="polite" aria-atomic="true" style={{ '--d': 2, '--oc': colour } as CSSProperties}><div className="pl">
            <div className="flood" /><div className="r-top"><div className="seg" data-seg><span className="thumb" /><button type="button" data-o="idle" aria-pressed={!outcome}>Scanning</button><button type="button" data-o="ok" aria-pressed={outcome === 'ok'}>Approved</button><button type="button" data-o="col" aria-pressed={outcome === 'col'}>Collected</button><button type="button" data-o="bad" aria-pressed={outcome === 'bad'}>Refuse</button></div></div>
            <div className="r-body">{!resolution && <div className="idle"><span className="mono">Waiting for a scan</span><h2 className="verdict stag" style={{ '--i': 0, color: 'var(--ink)' } as CSSProperties}>Ready</h2><p className="stag" style={{ '--i': 1 } as CSSProperties}>Hold the pass code inside the frame. Works with the radio off.</p></div>}{resolution && <><h2 className="g-verdict verdict stag" style={{ '--i': 0 } as CSSProperties}>{verdict}</h2><p className="vsub stag" style={{ '--i': 1 } as CSSProperties}>{resolution.status === 'green' ? 'Not yet collected · issue a band' : resolution.status === 'amber' ? 'A band was already issued to this person' : 'Unknown, rejected or voided token'}</p></>}
              {person && type && <div className="person"><div className="nm">{person.fullName}</div><div className="org">{person.orgName}<br /><span>{person.roleText} · {person.dayValidity === 'build_show' ? 'Build + show day' : DAY_VALIDITY[person.dayValidity]}</span></div></div>}
              {person && type && <><div className="gband" style={{ '--c': typeColour(type.code, theme) } as CSSProperties}><b>{presentationTypeLabel(type.code)}</b><small>Hand over a {type.band.toLowerCase()} band</small></div><div className="zones">{zonesFor(type.code).map((zone) => <span key={zone.text} className={zone.held ? undefined : 'off'}>{zone.text}</span>)}</div>{stickerDue && <div className="vehbox"><span className="mono">Sticker due</span><b>{person.vehicleReg}</b></div>}</>}
              {resolution?.status === 'amber' && <div className="note"><b>Already collected.</b> An issue is already recorded or queued. A reissue needs a supervisor note.</div>}
              {resolution?.status === 'red' && <div className="note" style={{ '--oc': 'var(--bad)' } as CSSProperties}><b>Do not let them in.</b> This token is not on the approved list.</div>}
              {resolution && <div className="dock">{resolution.status === 'green' && <><label className="serial"><span>Band serial</span><input aria-label="Wristband serial, optional" value={serial} onChange={(event) => setSerial(event.target.value)} placeholder="optional" /></label><button type="button" onClick={() => void issue()} className="btn go big hov-invert-grn">Issue wristband<span className="ic"><Icon name="check" /></span></button></>}<button type="button" onClick={() => { setResolution(null); setMessage(null) }} className="btn wide">Next person</button>{message && <div role="status" className="mono" style={{ color: 'var(--grn)' }}>{message}</div>}</div>}
            </div>
          </div></div>
      </div>
    </GateChrome>
  )
}
