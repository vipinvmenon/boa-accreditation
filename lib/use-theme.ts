'use client'

import { useEffect, useState } from 'react'
import type { Theme } from './design'

/**
 * Layer 2 (docs/DESIGN-SYSTEM.md, C8) needs the active theme in JS: those
 * values arrive as literal props in the design, not `var(--x, …)`, so CSS
 * alone cannot resolve them. There is no shipped theme toggle yet (`<html
 * data-theme="dark">` is static — app/layout.tsx), but scripts/visual-check.mjs
 * flips the attribute at runtime to capture both themes, so this reads the
 * live attribute rather than trusting the SSR default.
 */
export function useDomTheme(): Theme {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
