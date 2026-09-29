'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useRef } from 'react'

const TABS = [
  { href: '/gate', label: 'People' },
  { href: '/gate/vehicle', label: 'Vehicles' },
] as const

const KEY = 'boa-gate-tab'
const SLIDE_MS = 420

type Slide = { from: number; to: number; at: number }

function pipTransform(index: number): string {
  return index === 1 ? 'translateX(calc(100% + 2px))' : 'translateX(0)'
}

function readSlide(): Slide | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const { from, to, at } = value as Record<string, unknown>
    if ((from !== 0 && from !== 1) || (to !== 0 && to !== 1) || typeof at !== 'number') return null
    return { from, to, at }
  } catch {
    return null
  }
}

function rememberSlide(from: number, to: number): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify({ from, to, at: Date.now() } satisfies Slide))
  } catch {
    // Storage blocked: the new screen shows the pill in place, without the slide.
  }
}

/**
 * The People / Vehicles switch (r8-gate.html, r8-vehicle.html). Each route
 * renders its own copy, so the control remounts on every switch, and the
 * route (server-rendered for /gate/vehicle) takes a moment to arrive. The pill
 * starts sliding on the click, not when the route lands, and the new copy
 * carries on the same slide from wherever it had got to (Vipin, 29 Sep:
 * "make the people vehicle switcher smooth").
 */
export function GateTabs() {
  const pathname = usePathname()
  const active = pathname.startsWith('/gate/vehicle') ? 1 : 0
  const pipRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const pip = pipRef.current
    const slide = readSlide()
    if (!pip || !slide || slide.to !== active || slide.from === active) return
    const elapsed = Date.now() - slide.at
    if (elapsed >= SLIDE_MS || typeof pip.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    pip.animate(
      [{ transform: pipTransform(slide.from) }, { transform: pipTransform(slide.to) }],
      { duration: SLIDE_MS, delay: -elapsed, easing: getComputedStyle(pip).transitionTimingFunction || 'ease-out' },
    )
  }, [active])

  function go(to: number) {
    if (to === active) return
    // Slide now; the route may take a while to arrive.
    const pip = pipRef.current
    if (pip) pip.dataset['pos'] = String(to)
    rememberSlide(active, to)
  }

  return (
    <nav className="segmented" aria-label="Check in people or vehicles">
      <span ref={pipRef} className="seg-pip" data-pos={active} aria-hidden="true" />
      {TABS.map((tab, index) => (
        <Link key={tab.href} href={tab.href} aria-current={index === active ? 'page' : undefined} onClick={() => go(index)}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
