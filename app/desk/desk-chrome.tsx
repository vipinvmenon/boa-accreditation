'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAV, PROP } from '@/lib/design'
import { dashboardSchema, type Dashboard } from '@/lib/schemas/dashboard'
import { useDomTheme } from '@/lib/use-theme'

const rule = 'var(--rule,rgba(242,239,226,0.16))'
const ink = 'var(--ink,#F2EFE2)'
const ink3 = 'var(--ink3,rgba(242,239,226,0.42))'
const green = 'var(--grn,#00F5A5)'
const on = 'var(--on,#0A0A0A)'
const panel = 'var(--panel,#101012)'

export function DeskChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const theme = useDomTheme()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)

  useEffect(() => {
    let cancelled = false
    async function loadStatus() {
      const response = await fetch('/api/desk/dashboard')
      if (cancelled) return
      if (response.status === 401) {
        router.replace('/desk/login')
        return
      }
      if (!response.ok) return
      const parsed = dashboardSchema.safeParse(await response.json())
      if (!cancelled && parsed.success) setDashboard(parsed.data)
    }
    void loadStatus()
    return () => {
      cancelled = true
    }
  }, [router])

  const p = PROP[theme]
  const totalQuota = dashboard?.orgs.reduce((total, org) => total + org.quota, 0) ?? null
  const activeNav = NAV.find((item) => item.href === pathname)?.id

  function toggleTheme() {
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 70,
          background: 'var(--bg,#0A0A0A)',
          borderBottom: `1px solid ${rule}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, flexWrap: 'wrap' }}>
          <Link
            href="/desk"
            aria-label="BOA Accreditation desk home"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 18px',
              borderRight: `1px solid ${rule}`,
              textDecoration: 'none',
            }}
          >
            <img src="/assets/boa-logo.png" alt="Bangalore Open Air" style={{ height: '30px', width: 'auto', display: 'block' }} />
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: '0.16em',
                lineHeight: 1.2,
                textTransform: 'uppercase',
                color: ink3,
              }}
            >
              Accred
              <br />
              desk
            </span>
          </Link>

          <nav aria-label="Desk navigation" style={{ display: 'flex', alignItems: 'stretch', gap: 0, flex: '1 1 auto', overflowX: 'auto' }}>
            {NAV.map((item) => {
              const active = item.id === activeNav
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: 0,
                    borderRight: `1px solid ${rule}`,
                    background: active ? green : 'transparent',
                    color: active ? on : ink3,
                    padding: '11px 18px',
                    fontFamily: "'Oswald',sans-serif",
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            style={{
              cursor: 'pointer',
              border: 0,
              borderLeft: `1px solid ${rule}`,
              background: 'transparent',
              color: p.ink3,
              padding: '14px 16px',
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: '10px',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            flexWrap: 'wrap',
            padding: '8px 18px',
            borderTop: `1px solid ${rule}`,
            background: panel,
            fontFamily: "'JetBrains Mono',monospace",
            fontSize: '10.5px',
            fontWeight: 500,
            letterSpacing: '0.09em',
            textTransform: 'uppercase',
            color: ink3,
          }}
        >
          <span style={{ color: green }}>● Live</span>
          <span>Build 05–09 Oct · Show 10 Oct</span>
          <span style={{ color: ink }}>
            {dashboard ? `${dashboard.bandsIssued} / ${totalQuota ?? 0} bands issued` : 'Loading bands'}
          </span>
          <span style={{ marginLeft: 'auto', color: p.gold }}>
            {dashboard ? `${dashboard.bmsPending} not in BMS` : 'Loading BMS'}
          </span>
        </div>
      </header>

      {children}
    </div>
  )
}
