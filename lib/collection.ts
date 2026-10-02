/**
 * Who has collected a wristband, from the append-only check-in ledger.
 *
 * One rule for every desk screen, the same one boa_acc_desk_dashboard()'s
 * `bandsIssued` and GET /api/desk/master already use: a person has collected
 * once they hold at least one wristband check-in that no `void` row cancels.
 * A later vehicle sticker does not undo it (the Organisations screen once
 * read "the latest check-in is a wristband", which un-collected anyone who
 * then got a sticker).
 */

export type LedgerRow = {
  id: string
  person_id: string
  kind: 'wristband' | 'vehicle_sticker' | 'void'
  voids_checkin_id: string | null
}

export function collectedPersonIds(checkins: readonly LedgerRow[]): Set<string> {
  const voided = new Set<string>()
  for (const c of checkins) {
    if (c.kind === 'void' && c.voids_checkin_id) voided.add(c.voids_checkin_id)
  }
  const collected = new Set<string>()
  for (const c of checkins) {
    if (c.kind === 'wristband' && !voided.has(c.id)) collected.add(c.person_id)
  }
  return collected
}

export type CollectionPerson = {
  id: string
  org_id: string
  status: string
  type_code: string | null
}

export type CollectionCounts = {
  /** Approved and collected per tier code, approved people only. */
  tiers: { code: string; approved: number; collected: number }[]
  /** Approved and collected per organisation id, approved people only. */
  orgs: { id: string; approved: number; collected: number }[]
}

/**
 * Per-tier and per-organisation counts of approved people and of those who
 * have collected. Only approved people count: a band handed to someone later
 * voided or rejected is not "collected" against the list the desk is chasing.
 */
export function collectionCounts(people: readonly CollectionPerson[], checkins: readonly LedgerRow[]): CollectionCounts {
  const collected = collectedPersonIds(checkins)
  const tiers = new Map<string, { approved: number; collected: number }>()
  const orgs = new Map<string, { approved: number; collected: number }>()
  for (const person of people) {
    if (person.status !== 'approved') continue
    const has = collected.has(person.id) ? 1 : 0
    const org = orgs.get(person.org_id) ?? { approved: 0, collected: 0 }
    org.approved += 1
    org.collected += has
    orgs.set(person.org_id, org)
    if (person.type_code) {
      const t = tiers.get(person.type_code) ?? { approved: 0, collected: 0 }
      t.approved += 1
      t.collected += has
      tiers.set(person.type_code, t)
    }
  }
  return {
    tiers: [...tiers].map(([code, n]) => ({ code, ...n })),
    orgs: [...orgs].map(([id, n]) => ({ id, ...n })),
  }
}
