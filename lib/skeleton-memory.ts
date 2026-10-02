'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { z } from 'zod'

/**
 * The shape a screen last loaded with, so its skeleton can be drawn at that
 * shape: as many rows as last time, the descriptions the band cards had.
 * Without it the skeleton guessed (six organisations, four feed rows) and the
 * page jumped when the real data landed (Vipin, 2 Oct).
 *
 * Presentation only. It decides how much grey space a skeleton reserves and
 * never stands in for a count or a fact: every number on screen still comes
 * from the data layer. Per browser, in localStorage, and parsed with Zod on
 * the way back in (non-negotiable #8); anything unreadable is ignored and the
 * skeleton falls back to its own default.
 */
const PREFIX = 'boa-skeleton:'

const noop = () => () => {}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

/**
 * `value` is what the screen has now (null while loading). Returns it once it
 * is there, and until then the last one stored under `key`, or null.
 */
export function useSkeletonMemory<T>(key: string, schema: z.ZodType<T>, value: T | null): T | null {
  // The server has no storage: it renders the default skeleton, and the
  // browser swaps in the remembered shape when it hydrates.
  const raw = useSyncExternalStore(noop, () => read(key), () => null)
  const remembered = useMemo(() => {
    if (raw === null) return null
    try {
      const parsed = schema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }, [raw, schema])
  const json = value === null ? null : JSON.stringify(value)

  useEffect(() => {
    if (json === null) return
    try {
      window.localStorage.setItem(PREFIX + key, json)
    } catch {
      // Storage blocked: the next visit draws the default skeleton.
    }
  }, [key, json])

  return value ?? remembered
}
