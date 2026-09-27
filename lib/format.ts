import type { MasterRow } from './schemas/master'

const INDIA_TIME_ZONE = 'Asia/Kolkata'

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: INDIA_TIME_ZONE,
  day: '2-digit',
  month: 'short',
})

export function formatMasterCollected(row: MasterRow): string {
  if (row.collectedAt) {
    const gate = row.gateLabel ? ` · ${row.gateLabel}` : ''
    return `${dateTimeFormatter.format(new Date(row.collectedAt))}${gate}`
  }
  if (row.status === 'rejected' && row.decidedAt) {
    return `Rejected ${dateFormatter.format(new Date(row.decidedAt))}`
  }
  return 'Not collected'
}

export function formatMasterBand(row: MasterRow): string {
  if (row.status === 'rejected' || row.status === 'voided') return 'Voided'
  if (!row.bandSerial) return 'Not issued'
  return row.bandSerial.startsWith('#') ? row.bandSerial : `#${row.bandSerial}`
}

/** ACC-148: a ledger time on the desk's clock, e.g. "09 Oct, 10:00". */
export function formatLedgerTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso))
}

/** A typed band serial, or the fact that none was typed (non-negotiable #6). */
export function formatBandSerial(serial: string | null): string {
  if (!serial) return 'No serial typed'
  return serial.startsWith('#') ? serial : `#${serial}`
}

type RecentLedgerRow = {
  kind: 'wristband' | 'vehicle_sticker'
  holderName: string | null
  holderLabel: string | null
  serial: string | undefined
  occurredAt: string
}

export function formatRecentLedgerRow(row: RecentLedgerRow): { name: string; detail: string } {
  const isSticker = row.kind === 'vehicle_sticker'
  const noun = isSticker ? 'sticker' : 'band'
  const kindLabel = isSticker ? 'vehicle sticker' : 'wristband'
  const serial = row.serial?.replace(/^#/, '')
  return {
    name: row.holderName ?? 'Holder not on this phone’s list',
    detail: `${row.holderLabel ?? kindLabel}, ${serial ? `${noun} ${serial}` : 'no serial'}, ${new Date(row.occurredAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
  }
}

/**
 * ACC-154 — what the Master list says about the filters it is under.
 *
 * ACC-152 gave `?org=` a banner naming the company and a way out, on the
 * principle that a filter the operator cannot see is a bug: they arrive from
 * Organisations, count three people, and conclude the roster lost twenty-two.
 * `?in_bms=` — reached from the "N not in BMS" badge in the chrome of every
 * desk screen — had neither, so the list silently showed 14 of 612 with
 * nothing on screen saying why and no way back.
 *
 * One banner now describes either filter or both. Returns null only when the
 * list is unfiltered, which is the one state that needs no explanation.
 */
export function masterFilterSummary(input: {
  orgFiltered: boolean
  /** The organisation's name, read off the rows; null until they arrive. */
  orgName: string | null
  inBms: 'all' | 'true' | 'false'
  loading: boolean
  /** No rows came back under these filters. */
  empty: boolean
}): string | null {
  const { orgFiltered, orgName, inBms, loading, empty } = input
  if (!orgFiltered && inBms === 'all') return null

  // Verbatim from ACC-152: the wording the org tests assert and the one
  // operators have been reading since 25 Sep.
  if (orgFiltered && inBms === 'all') {
    if (loading) return 'Filtering by organisation…'
    if (empty || !orgName) return 'No one from this organisation yet'
    return `Showing ${orgName} only`
  }

  const bmsPeople = inBms === 'false' ? 'people not yet in BMS' : 'people already in BMS'

  if (!orgFiltered) {
    if (loading) return 'Filtering by BMS…'
    // Empty is the good news for the outstanding filter, and worth saying
    // plainly — chasing BMS entries is what that filter exists for.
    if (empty) return inBms === 'false' ? 'Everyone approved is already in BMS' : 'Nobody has been added to BMS yet'
    return `Showing ${bmsPeople}`
  }

  if (loading) return 'Filtering…'
  if (empty || !orgName) return 'Nobody matches both filters'
  return `Showing ${orgName}, ${bmsPeople}`
}

/**
 * ACC-162 — "Showing 14 of 612 people".
 *
 * The Master list had no count at all, so a volunteer arriving on 5 Oct could
 * not tell a short list from a filtered one. Kept as a pure function because it
 * is read in two places that must not drift: the visible line in the filter
 * banner, and the table's accessible name, which carries it even when no filter
 * is on and the banner is therefore absent.
 *
 * `shown === total` says so plainly rather than "612 of 612", which reads as a
 * filter that happens to match everyone.
 */
export function masterCountLabel(shown: number, total: number): string {
  if (total === 0) return 'Nobody on the roster yet'
  if (shown === 0) return `None of ${total} ${total === 1 ? 'person' : 'people'}`
  if (shown >= total) return `All ${total} ${total === 1 ? 'person' : 'people'}`
  return `Showing ${shown} of ${total} people`
}
