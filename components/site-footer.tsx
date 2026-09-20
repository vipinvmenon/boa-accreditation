'use client'

import { PROP } from '@/lib/design'
import { useDomTheme } from '@/lib/use-theme'

export function SiteFooter() {
  const theme = useDomTheme()
  const p = PROP[theme]

  return (
    <footer
      className="site-footer"
      style={{
        borderTop: '1px solid var(--rule,rgba(242,239,226,0.16))',
        padding: '22px 18px 30px',
        display: 'flex',
        gap: '20px',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        fontFamily: "'Oswald',sans-serif",
        fontSize: '10.5px',
        fontWeight: 500,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'var(--ink3,rgba(242,239,226,0.42))',
      }}
    >
      <span>Not registered, not approved, not verified. Not inside.</span>
      <span style={{ color: p.gold }}>Artists handled at the hotel</span>
    </footer>
  )
}
