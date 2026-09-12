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

export function GateServiceWorker() {
  useEffect(() => {
    void ensureGateServiceWorker()
  }, [])
  return null
}
