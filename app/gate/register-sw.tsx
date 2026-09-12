'use client'

import { useEffect } from 'react'

export function GateServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/gate/sw.js', { scope: '/gate/' })
    }
  }, [])
  return null
}
