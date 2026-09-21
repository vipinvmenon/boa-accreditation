'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { pullGate } from '@/gate/client'
import { writeDeviceToken } from '@/gate/device-token'
import { ensureGateServiceWorker } from '../register-sw'

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
      writeDeviceToken(token.trim())
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
    <main className="utility-gate">
      <section className="utility-inner">
        <header className="utility-head">
          <div>
            <div className="tag">Gate setup</div>
            <h1 className="h1">Load the list</h1>
          </div>
        </header>
        <p className="lede">
          Paste the device token to make one successful, non-empty pull. The gate will not show a scanner over an empty or stale cache.
        </p>
        <form onSubmit={submit} className="utility-form" style={{ marginTop: 34 }}>
          <label htmlFor="device-token" className="utility-label"><span>Device token</span></label>
          <input id="device-token" value={token} onChange={(event) => setToken(event.target.value)} required autoComplete="off" spellCheck={false} placeholder="PASTE DEVICE TOKEN" className="utility-input utility-code" />
          <button type="submit" disabled={busy} className="btn go big wide hov-invert-grn">{busy ? 'Pulling…' : 'Pull approved list'}</button>
        </form>
        {error && <p role="alert" className="utility-notice bad">{error}</p>}
        {count > 0 && <p role="status" className="utility-notice utility-ok">{count} approved passes held · {asOf ? new Date(asOf).toLocaleString() : 'time unavailable'}</p>}
      </section>
    </main>
  )
}
