'use client'

import { type Pass } from '@/lib/schemas/pass'
import { DAY_VALIDITY, PROP, ALL_ZONES, passType, type PassTypeCode } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'

export type RenderedPass = Pass & { qrSvg: string }

const buttonStyle: React.CSSProperties = {
  cursor: 'pointer',
  border: '1px solid var(--grn,#00F5A5)',
  background: 'var(--grn,#00F5A5)',
  color: 'var(--on,#0A0A0A)',
  padding: '13px 20px',
  fontFamily: "'Oswald',sans-serif",
  fontSize: '12.5px',
  fontWeight: 600,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  minHeight: '44px',
}

const ghostButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  borderColor: 'var(--rule2,rgba(242,239,226,0.32))',
  background: 'transparent',
  color: 'var(--ink2,rgba(242,239,226,0.72))',
}

function share(url: string, text: string): void {
  const message = `${text}\n${url.startsWith('/') ? `${window.location.origin}${url}` : url}`
  window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
}

function zonesFor(typeCode: PassTypeCode) {
  const held = new Set(passType(typeCode).zones)
  return ALL_ZONES.map((label) => ({ label: held.has(label), text: held.has(label) ? label : `—— ${label}` }))
}

export function PassesScreen({ passes }: { passes: RenderedPass[] }) {
  const theme = useDomTheme()
  const p = PROP[theme]

  function shareAll() {
    const links = passes.map((pass) => `${pass.fullName}: ${window.location.origin}/p/${pass.passToken}`)
    share(window.location.href, `BOA accreditation passes\n${links.join('\n')}`)
  }

  return (
    <main className="passes-screen" style={{ background: 'var(--bg,#0A0A0A)', minHeight: '100%' }}>
      <header className="passes-header" style={{ padding: '38px 34px', borderBottom: `1px solid ${p.rule}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 300px', minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: p.grn, marginBottom: '16px' }}>The pass</div>
          <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(42px,6vw,72px)', lineHeight: 0.94, textTransform: 'uppercase', color: p.ink, margin: '0 0 14px' }}>Pass sheet</h1>
          <p style={{ fontSize: '14.5px', lineHeight: 1.55, color: p.ink3, margin: 0, maxWidth: '62ch' }}>
            One card per approved person. Print and cut, or forward the per-person link. Zones are printed so the desk never has to look up what a band covers.
          </p>
        </div>
        <div className="passes-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" onClick={shareAll} style={ghostButtonStyle}>Send on WhatsApp</button>
          <button type="button" onClick={() => window.print()} style={buttonStyle}>Print {passes.length} passes →</button>
        </div>
      </header>

      <div className="pass-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: '1px', background: p.rule }}>
        {passes.map((pass) => {
          const type = passType(pass.typeCode)
          const zones = zonesFor(pass.typeCode)
          const link = `/p/${pass.passToken}`
          return (
            <article className="pass-card" key={pass.id} style={{ background: 'var(--bg,#0A0A0A)', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: `1px solid ${p.rule}`, paddingBottom: '14px' }}>
                <img src="/assets/boa-logo.png" alt="BOA" style={{ height: '26px', width: 'auto', display: 'block', filter: theme === 'light' ? 'invert(1)' : undefined }} />
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: p.ink3 }}>{pass.passRef}</div>
              </div>

              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.ink3 }}>Name</div>
                <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '30px', lineHeight: 1, textTransform: 'uppercase', color: p.ink, marginTop: '8px' }}>{pass.fullName}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: p.ink2, marginTop: '10px' }}>{pass.orgName}</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10.5px', letterSpacing: '0.07em', textTransform: 'uppercase', color: p.ink3, marginTop: '3px' }}>{pass.role} · {DAY_VALIDITY[pass.dayValidity]}</div>
              </div>

              <div style={{ border: `1px solid ${typeColour(type.code, theme)}` }}>
                <div style={{ height: '10px', background: typeColour(type.code, theme) }} />
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontFamily: "'Anton',sans-serif", fontSize: '24px', lineHeight: 1, textTransform: 'uppercase', color: typeColour(type.code, theme) }}>{type.label}</div>
                  <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: p.ink2, marginTop: '5px' }}>{type.band} band</div>
                </div>
              </div>

              <div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.ink3, marginBottom: '9px' }}>Zones</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 14px' }}>
                  {zones.map((zone) => <span key={zone.text} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '10px', fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: zone.label ? p.ink : p.ink3, padding: '2px 0' }}>{zone.text}</span>)}
                </div>
              </div>

              <div className="qr-wrap" aria-label={`QR code for ${pass.fullName}`} dangerouslySetInnerHTML={{ __html: pass.qrSvg }} />

              {pass.vehicleReg && <div style={{ border: `1px solid ${p.gold}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.13em', textTransform: 'uppercase', color: p.gold }}>Vehicle</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '14px', fontWeight: 700, letterSpacing: '0.12em', color: p.ink }}>{pass.vehicleReg}</span>
              </div>}

              <div className="pass-card-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={() => share(link, `BOA pass for ${pass.fullName}`)} style={ghostButtonStyle}>Send on WhatsApp</button>
              </div>
              <div style={{ marginTop: 'auto', borderTop: `1px solid ${p.rule}`, paddingTop: '14px', fontSize: '12px', lineHeight: 1.5, color: p.ink3 }}>Bring this and a valid photo ID. Non-transferable. One person = one pass = one physical check-in = one wristband.</div>
            </article>
          )
        })}
      </div>
      <style>{`
        .qr-wrap { background:var(--panel2); padding:16px; display:flex; justify-content:center; }
        .qr-wrap svg { display:block; width:min(100%, 260px); height:auto; }
        @media print {
          @page { size:A4; margin:12mm; }
          html, body { background:white !important; }
          .passes-header, .pass-card-actions { display:none !important; }
          .pass-grid { display:block !important; background:white !important; }
          .pass-card { min-height:270mm; break-after:page; background:white !important; color:var(--on) !important; padding:0 !important; }
          .pass-card:last-child { break-after:auto; }
          .pass-card > * { break-inside:avoid; }
          .qr-wrap { margin-top:8mm; }
        }
      `}</style>
    </main>
  )
}

function typeColour(code: PassTypeCode, theme: 'dark' | 'light'): string {
  const type = passType(code)
  return theme === 'dark' ? type.colour : type.colourLight
}
