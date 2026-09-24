'use client'

/**
 * Who is signed in at this gate, answered offline.
 *
 * ADR-020 gave the gate real logins, and ACC-132 then gave it its own chrome.
 * Both keyed off the ROUTE: anyone standing on `/gate` was drawn as a
 * volunteer, so a lead or admin who tapped Vehicle from the desk lost the desk
 * navigation and had no way back (found by Vipin, 24 Sep). The chrome belongs
 * to the PERSON, not the path.
 *
 * The role is the hard part. It arrives only from `/api/gate/session`, which
 * is online-only by design, while the gate must render with the radio off
 * (non-negotiable #7). So the role is cached in Dexie the first time there is
 * signal and read from there afterwards: a phone that boots in a field draws
 * the same chrome it drew yesterday.
 *
 * This is display only. It decides which links a person sees, never what they
 * may do — the database refuses anyone who is not an active issuer, lead or
 * admin on every write (private.boa_acc_gate_operator, non-negotiable #3). A
 * stale cached role can at worst show a lead a nav they cannot use; it can
 * never hand anyone a permission.
 */
import { useEffect, useState } from 'react'
import { gateDb } from '@/gate/db'
import { checkGateSession } from '@/gate/session'
import { GATE_ROLES, type GateSession } from '@/lib/schemas/operator'

export type GateOperator = Pick<GateSession, 'displayName' | 'role'>

/** "Bhoopesh Kumar" -> "BK"; a single name -> its first two letters. */
export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  const last = parts[parts.length - 1]
  if (!first || !last) return '··'
  if (parts.length === 1) return first.slice(0, 2).toUpperCase()
  return ((first[0] ?? '') + (last[0] ?? '')).toUpperCase()
}

async function readCachedOperator(): Promise<GateOperator | null> {
  try {
    const [role, name] = await Promise.all([
      gateDb.meta.get('operatorRole'),
      gateDb.meta.get('operatorName'),
    ])
    const roleValue = typeof role?.value === 'string' ? role.value : null
    const nameValue = typeof name?.value === 'string' ? name.value : null
    if (!roleValue || !nameValue) return null
    const parsedRole = GATE_ROLES.find((candidate) => candidate === roleValue)
    if (!parsedRole) return null
    return { role: parsedRole, displayName: nameValue }
  } catch {
    // A cache that will not open is not an error worth surfacing here: the
    // chrome falls back to the narrowest view until there is signal.
    return null
  }
}

async function cacheOperator(operator: GateOperator): Promise<void> {
  try {
    await gateDb.meta.bulkPut([
      { key: 'operatorRole', value: operator.role },
      { key: 'operatorName', value: operator.displayName },
    ])
  } catch {
    // Caching is an optimisation for the next offline boot, never a gate.
  }
}

/**
 * `null` while unknown — the chrome should draw its narrowest, safest form
 * until the answer arrives, rather than flashing desk links at a volunteer.
 */
export function useGateOperator(): GateOperator | null {
  const [operator, setOperator] = useState<GateOperator | null>(null)

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      const cached = await readCachedOperator()
      if (cancelled) return
      if (cached) setOperator(cached)
      if (!navigator.onLine) return
      const check = await checkGateSession()
      if (cancelled || check.state !== 'ok') return
      const fresh = { displayName: check.session.displayName, role: check.session.role }
      setOperator(fresh)
      await cacheOperator(fresh)
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [])

  return operator
}
