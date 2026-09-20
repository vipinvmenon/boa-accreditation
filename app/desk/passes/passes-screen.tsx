'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { passesResponseSchema, type Pass } from '@/lib/schemas/pass'
import { ALL_ZONES, passType, type PassTypeCode } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'
import { Icon } from '@/components/icon'

export type RenderedPass = Pass & { qrSvg: string }

function share(url: string, text: string): void {
  const message = `${text}\n${url.startsWith('/') ? `${window.location.origin}${url}` : url}`
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

function zonesFor(typeCode: PassTypeCode) {
  const held = new Set(passType(typeCode).zones)
  return ALL_ZONES.map((label) => ({ label: held.has(label), text: held.has(label) ? label : `—— ${label}` }))
}

function dayCopy(dayValidity: Pass['dayValidity']): string {
  return dayValidity === 'build_show' ? 'build and show' : dayValidity === 'build' ? 'build day' : 'show day'
}

export function PassesScreen() {
  const router = useRouter()
  const theme = useDomTheme()
  const [passes, setPasses] = useState<RenderedPass[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/desk/passes')
        if (response.status === 401) {
          router.replace('/desk/login')
          return
        }
        if (!response.ok) throw new Error('request_failed')
        const parsed = passesResponseSchema.safeParse(await response.json())
        if (!parsed.success) throw new Error('invalid_response')
        if (!cancelled) {
          setPasses(parsed.data.passes)
          setError(false)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const revealables = root.querySelectorAll<HTMLElement>('.rv')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion || !('IntersectionObserver' in window)) {
      revealables.forEach((element) => element.classList.add('in'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('in')
        observer.unobserve(entry.target)
      }),
      { threshold: 0.12 },
    )
    revealables.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [passes.length, loading, error])

  function shareAll() {
    const links = passes.map((pass) => `${pass.fullName}: ${window.location.origin}/p/${pass.passToken}`)
    share(window.location.href, `BOA accreditation passes\n${links.join('\n')}`)
  }

  return (
    <main ref={rootRef} className="passes-screen">
      <section className="head rv">
        <div>
          <span className="tag">The pass</span>
          <h1 className="h1 passes-title">
            <span className="passes-title-desktop">Pass sheet</span>
            <span className="passes-title-mobile">One person, one pass</span>
          </h1>
          <p className="lede passes-blurb-desktop">One card per approved person. Print and cut, or forward the per-person link. Zones are printed so the desk never has to look up what a band covers.</p>
          <p className="lede passes-blurb-mobile">The code carries a pass token, not a name. Bring it and a valid photo ID to the crew check-in desk — a wristband cannot be collected on anyone else’s behalf.</p>
        </div>
        <div className="row passes-actions">
          <button type="button" onClick={shareAll} className="btn">
            Send on WhatsApp<span className="ic"><Icon name="paper-plane-tilt" /></span>
          </button>
          {passes.length > 0 && <button type="button" onClick={() => window.print()} className="btn go">
            Print {passes.length} passes<span className="ic"><Icon name="printer" /></span>
          </button>}
        </div>
      </section>

      <div className="passes">
        {loading && <p className="passes-state">Loading passes…</p>}
        {!loading && error && <p className="passes-state passes-state-error">Unable to load passes.</p>}
        {!loading && !error && passes.length === 0 && <p className="passes-state">No approved passes yet — approve in the queue →</p>}
        {passes.map((pass, i) => {
          const type = passType(pass.typeCode)
          const zones = zonesFor(pass.typeCode)
          return (
            <article className="pass bz rv" key={pass.id} style={{ '--c': typeColour(type.code, theme), '--d': i % 3 } as React.CSSProperties}>
              <div className="pl">
                <div className="ph">
                  <img src="/assets/boa-logo.png" alt="BOA" />
                  <span className="mono">{pass.passRef}</span>
                </div>
                <div className="who">
                  <div className="nm">{pass.fullName}</div>
                  <div className="sub" style={{ marginTop: '8px' }}>{pass.orgName}<br />{pass.role}, {dayCopy(pass.dayValidity)}</div>
                </div>
                <div className="bandbox">
                  <b>{type.label}</b>
                  <small>{type.band} band</small>
                </div>
                <div className="zones">
                  {zones.map((zone) => <span key={zone.text} className={zone.label ? undefined : 'off'}>{zone.text}</span>)}
                </div>
                <div className="qr qr-wrap" aria-label={`QR code for ${pass.fullName}`} dangerouslySetInnerHTML={{ __html: pass.qrSvg }} />
                {pass.vehicleReg && <div className="vehbox">
                  <span className="mono">Vehicle</span>
                  <b>{pass.vehicleReg}</b>
                </div>}
                <p className="fine">Bring this and a valid photo ID. Non-transferable. One person, one pass, one check-in, one wristband.</p>
              </div>
            </article>
          )
        })}
      </div>
      <style>{`
        .passes-title-mobile, .passes-blurb-mobile { display: none; }
        .passes-actions { justify-content: flex-end; align-items: center; }
        .passes-state { grid-column: 1 / -1; margin: 0; padding: 18px 22px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); }
        .passes-state-error { color: var(--bad); }
        .qr-wrap svg { display: block; width: 128px; height: 128px; }
        @container app (max-width: 700px) {
          .passes-title-desktop, .passes-blurb-desktop { display: none; }
          .passes-title-mobile, .passes-blurb-mobile { display: inline; }
          .passes-actions { justify-content: flex-start; }
        }
        @media print {
          @page { size: A4; margin: 12mm; }
          html, body { background: white !important; }
          .nav-wrap, .status, .menu, footer, .head, .passes-state { display: none !important; }
          .passes { display: block !important; }
          .pass { min-height: 270mm; break-after: page; background: white !important; color: var(--on) !important; }
          .pass:last-child { break-after: auto; }
          .pass > .pl { box-shadow: none; background: white !important; padding: 0; }
          .pass > .pl > * { break-inside: avoid; }
          .qr-wrap { margin-top: 8mm; }
          .qr-wrap svg { width: 35mm; height: 35mm; }
        }
      `}</style>
    </main>
  )
}

function typeColour(code: PassTypeCode, theme: 'dark' | 'light'): string {
  const type = passType(code)
  return theme === 'dark' ? type.colour : type.colourLight
}
