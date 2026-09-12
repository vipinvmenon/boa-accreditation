'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pullGate } from '@/gate/client'
import { ensureGateServiceWorker } from '../register-sw'

export const dynamic = 'force-static'

export default function GateSetupPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [asOf, setAsOf] = useState<string | null>(null)
  const [count, setCount] = useState(0)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const snapshot = await pullGate(token.trim())
      sessionStorage.setItem('boa-gate-device-token', token.trim())
      setCount(snapshot.roster.length)
      setAsOf(snapshot.meta.rosterAsOf)
      if (await ensureGateServiceWorker()) {
        // A soft navigation leaves this document uncontrolled until the next
        // navigation. Make the first gate load a real navigation so the
        // active worker can serve it when the radio is switched off.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/gate'
      } else {
        router.replace('/gate')
      }
    } catch (cause: unknown) {
      setError(cause instanceof Error && cause.message === 'empty_roster'
        ? 'The pull returned no approved passes. The scanner stays locked.'
        : 'Could not pull the approved list. Check the device token and signal, then try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg,#0A0A0A)', color: 'var(--ink,#F2EFE2)', fontFamily: "'Archivo',sans-serif" }}>
      <section style={{ padding: 'clamp(32px, 8vw, 96px) clamp(20px, 6vw, 80px)', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--grn,#00F5A5)', marginBottom: 16 }}>Gate setup</div>
        <h1 style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(48px, 10vw, 88px)', lineHeight: 0.94, textTransform: 'uppercase', margin: '0 0 18px' }}>Load the list</h1>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink2,rgba(242,239,226,0.72))', maxWidth: 58 * 8 }}>
          Paste the device token to make one successful, non-empty pull. The gate will not show a scanner over an empty or stale cache.
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 34 }}>
          <label htmlFor="device-token" style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink3,rgba(242,239,226,0.52))' }}>Device token</label>
          <input id="device-token" value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="off" spellCheck={false} placeholder="PASTE DEVICE TOKEN" style={{ border: '1px solid var(--rule2,rgba(242,239,226,0.32))', background: 'transparent', color: 'var(--ink,#F2EFE2)', padding: '17px 16px', fontFamily: "'JetBrains Mono',monospace", letterSpacing: '0.1em', minHeight: 56, width: '100%' }} />
          <button type="submit" disabled={busy} style={{ cursor: busy ? 'wait' : 'pointer', border: '1px solid var(--grn,#00F5A5)', background: 'var(--grn,#00F5A5)', color: 'var(--on,#0A0A0A)', padding: 20, fontFamily: "'Anton',sans-serif", fontSize: 19, letterSpacing: '0.1em', textTransform: 'uppercase', minHeight: 62 }}>{busy ? 'Pulling…' : 'Pull approved list'}</button>
        </form>
        {error && <p role="alert" style={{ border: '1px solid var(--bad,#FF6B5A)', padding: 16, color: 'var(--ink,#F2EFE2)', lineHeight: 1.5 }}>{error}</p>}
        {count > 0 && <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--grn,#00F5A5)' }}>{count} approved passes held · {asOf ? new Date(asOf).toLocaleString() : 'time unavailable'}</p>}
      </section>
    </main>
  )
}
