/**
 * ACC-147 / ACC-131 — find a person on the check-in desk without their QR.
 *
 * Pure: it searches rows the gate screen already read from the Dexie cache
 * (non-negotiable #7). No Dexie IO, no network, no mutation. A pick is turned
 * into the same `BOA26:<token>` payload a camera scan produces, so a searched
 * person goes through exactly the same resolveScan → green/amber/red → typed
 * serial → outbox path as a scanned one. Nothing here assigns a serial.
 *
 * No Dexie index is used or needed: the roster (~2,000 rows) is already in
 * memory on the gate screen, and a prepared in-memory index is a linear scan
 * of short strings per keystroke (search.test.ts bounds 2,000 rows).
 *
 * Phone: since ACC-150 the pull and the cached roster row carry the person's
 * phone, so a digits-only query matches by phone. It stays optional on the
 * row — a cache written by an older pull has none, and that must keep
 * parsing (gate/db.ts) — and a missing phone simply never matches. A phone
 * is only ever matched on its trailing digits and only ever displayed masked
 * to its last four (non-negotiable #9).
 */
import type { RosterRow } from './db'

export type SearchableRow = RosterRow

export const DEFAULT_RESULT_LIMIT = 8
export const MIN_NAME_QUERY = 2
export const MIN_PHONE_DIGITS = 4

/** The payload the scanner would have decoded for this pass (see resolve.ts). */
export function passPayload(passToken: string): string {
  return `BOA26:${passToken}`
}

/**
 * Lower-case, strip diacritics (NFKD then drop combining marks), and collapse
 * every run of non-letter/non-digit characters to one space.
 */
export function normaliseText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function digitsOnly(value: string): string {
  return value.replace(/\D+/g, '')
}

/** "+919876543210" → "••• 3210". Never shows more than the last four digits. */
export function maskPhone(phone: string): string {
  const digits = digitsOnly(phone)
  if (digits.length < 4) return '•••'
  return `••• ${digits.slice(-4)}`
}

type IndexedRow = {
  row: SearchableRow
  name: string
  words: string[]
  compactName: string
  phoneDigits: string
  plate: string
}

export type SearchIndex = readonly IndexedRow[]

export function buildSearchIndex(rows: readonly SearchableRow[]): SearchIndex {
  return rows.map((row) => {
    const name = normaliseText(row.fullName)
    return {
      row,
      name,
      words: name.split(' ').filter(Boolean),
      compactName: name.replace(/ /g, ''),
      phoneDigits: row.phone ? digitsOnly(row.phone) : '',
      plate: row.vehicleReg ? normaliseText(row.vehicleReg).replace(/ /g, '') : '',
    }
  })
}

export type MatchKind = 'name' | 'phone' | 'plate'

export type PersonMatch = {
  row: SearchableRow
  matchedBy: MatchKind
  /** Lower is better. Exposed for tests; the UI only uses the order. */
  rank: number
}

/** Every query word must be the prefix of a different name word. */
function wordsMatch(queryWords: readonly string[], nameWords: readonly string[]): boolean {
  const used = new Set<number>()
  // Longest query words first, so "ra ravi" cannot spend "ravi" on "ra".
  const ordered = [...queryWords].sort((a, b) => b.length - a.length)
  for (const query of ordered) {
    const at = nameWords.findIndex((word, index) => !used.has(index) && word.startsWith(query))
    if (at === -1) return false
    used.add(at)
  }
  return true
}

function nameRank(entry: IndexedRow, query: string, queryWords: readonly string[]): number | null {
  if (entry.name === query) return 0
  if (entry.name.startsWith(query)) return 1
  if (wordsMatch(queryWords, entry.words)) {
    const first = queryWords[0]
    return first !== undefined && entry.words[0]?.startsWith(first) ? 2 : 3
  }
  // "ravikumar" typed without the space.
  const compact = query.replace(/ /g, '')
  if (compact.length >= MIN_NAME_QUERY + 1 && entry.compactName.startsWith(compact)) return 4
  return null
}

/**
 * Ranked, capped search. A query with at least MIN_PHONE_DIGITS digits and no
 * letters is a phone query (trailing digits) that also tries plates; anything
 * else is a name query (any word prefix, then plate as a fallback).
 */
export function searchPeople(
  index: SearchIndex,
  rawQuery: string,
  limit: number = DEFAULT_RESULT_LIMIT,
): PersonMatch[] {
  const query = normaliseText(rawQuery)
  if (query.length === 0 || limit <= 0) return []

  const hasLetters = /\p{L}/u.test(query)
  const digits = digitsOnly(query)
  const compact = query.replace(/ /g, '')
  const isPhoneQuery = !hasLetters && digits.length >= MIN_PHONE_DIGITS
  if (hasLetters && query.length < MIN_NAME_QUERY) return []
  if (!hasLetters && !isPhoneQuery) return []

  const queryWords = query.split(' ').filter(Boolean)
  const matches: PersonMatch[] = []

  for (const entry of index) {
    if (isPhoneQuery && entry.phoneDigits.length > 0 && entry.phoneDigits.endsWith(digits)) {
      matches.push({ row: entry.row, matchedBy: 'phone', rank: entry.phoneDigits === digits ? 0 : 1 })
      continue
    }
    if (hasLetters) {
      const rank = nameRank(entry, query, queryWords)
      if (rank !== null) {
        matches.push({ row: entry.row, matchedBy: 'name', rank })
        continue
      }
    }
    if (compact.length >= MIN_PHONE_DIGITS && entry.plate.length > 0 && entry.plate.includes(compact)) {
      matches.push({ row: entry.row, matchedBy: 'plate', rank: 5 })
    }
  }

  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.row.fullName.localeCompare(b.row.fullName, 'en-IN', { sensitivity: 'base' }) ||
      (a.row.passToken < b.row.passToken ? -1 : a.row.passToken > b.row.passToken ? 1 : 0),
  )
  return matches.slice(0, limit)
}
