'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useDomTheme } from '@/lib/use-theme'
import { NAV, PROP } from '@/lib/design'

export function GateChrome({
  children,
  bandsIssued = 0,
  approved = 0,
  bmsPending = 0,
}: {
  children: React.ReactNode
  bandsIssued?: number
  approved?: number
  bmsPending?: number
}) {
  const pathname = usePathname()
  const theme = useDomTheme()
  const p = PROP[theme]
  const active = NAV.find((item) => item.href === pathname)?.id

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)', fontFamily: "'Archivo',system-ui,sans-serif", color: 'var(--ink2,rgba(242,239,226,0.72))', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 70, background: 'var(--bg,#0A0A0A)', borderBottom: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
          <Link href="/gate" aria-label="Bangalore Open Air" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderRight: '1px solid var(--rule,rgba(242,239,226,0.16))' }}>
            <img src="/assets/boa-logo.png" alt="Bangalore Open Air" style={{ height: 30, width: 'auto', display: 'block', filter: theme === 'dark' ? 'drop-shadow(0 0 16px rgba(0,245,165,0.45))' : 'none' }} />
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', lineHeight: 1.2, textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.52))' }}>Accred<br />desk</span>
          </Link>
          <nav aria-label="Gate navigation" style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: '1 1 auto', overflowX: 'auto' }}>
            {NAV.map((item) => {
              const isActive = item.id === active
              return <Link key={item.id} href={item.href} aria-current={isActive ? 'page' : undefined} className="hov-text-ink" style={{ display: 'flex', alignItems: 'center', border: 0, borderRight: '1px solid var(--rule,rgba(242,239,226,0.16))', background: isActive ? p.grnbg : 'transparent', color: isActive ? (theme === 'dark' ? p.grn : p.ink) : 'var(--ink3,rgba(242,239,226,0.52))', padding: '11px 18px', fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{item.label}</Link>
            })}
          </nav>
          <div style={{ display: 'flex', alignItems: 'stretch', borderLeft: '1px solid var(--rule,rgba(242,239,226,0.16))', '--vp-on': p.on, '--vp-ink': p.ink } as React.CSSProperties}>
            <span className="g-vp-web" style={{ padding: '14px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Web</span>
            <span className="g-vp-mob" style={{ borderRight: '1px solid var(--rule,rgba(242,239,226,0.16))', padding: '14px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Mob</span>
            <button type="button" onClick={() => document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark')} className="hov-text-grn" style={{ cursor: 'pointer', border: 0, background: 'transparent', color: 'var(--ink3,rgba(242,239,226,0.42))', padding: '14px 16px', fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{theme === 'dark' ? 'Light' : 'Dark'}</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', padding: '8px 18px', borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))', background: 'var(--panel,#101012)', fontFamily: "'JetBrains Mono',monospace", fontSize: 10.5, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))' }}>
          <span style={{ color: p.grn }}>● Live</span><span>Build 05–09 Oct · Show 10 Oct</span><span style={{ color: p.ink }}>{bandsIssued} / {approved} bands issued</span><span style={{ marginLeft: 'auto', color: p.gold }}>{bmsPending} not in BMS</span>
        </div>
      </header>
      <main style={{ flex: 1, display: 'flex', justifyContent: 'center' }}><div className="g-shell">{children}</div></main>
      <footer style={{ borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))', padding: '22px 18px 30px', display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'space-between', fontFamily: "'Oswald',sans-serif", fontSize: 10.5, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.42))' }}><span>Not registered, not approved, not verified — not inside.</span><span style={{ color: p.gold }}>Artists handled at the hotel</span></footer>
    </div>
  )
}
