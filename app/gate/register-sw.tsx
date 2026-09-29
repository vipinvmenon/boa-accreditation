'use client'

import { useEffect } from 'react'

export async function ensureGateServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false

  await navigator.serviceWorker.register('/gate/sw.js', { scope: '/gate' })
  await navigator.serviceWorker.ready
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
      window.setTimeout(resolve, 3000)
    })
  }
  return true
}

/**
 * public/gate/sw.js is generated from a production build and serves
 * /_next/static/* and /gate navigations cache-first. Under `next dev` that
 * pins the gate to whatever it cached, so edits never show and stale client
 * code meets fresh server payloads (Vipin saw both on 29 Sep). In dev the
 * worker is not registered, and one left by an earlier session is removed
 * with its caches. The offline suite runs against `next start`, so it is
 * unaffected.
 */
async function retireGateServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registrations = await navigator.serviceWorker.getRegistrations()
  await Promise.all(registrations.filter((r) => new URL(r.scope).pathname.startsWith('/gate')).map((r) => r.unregister()))
  if ('caches' in window) {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k.startsWith('boa-gate-')).map((k) => caches.delete(k)))
  }
}

export function GateServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      void retireGateServiceWorker()
      return
    }
    void ensureGateServiceWorker()
  }, [])
  return null
}
