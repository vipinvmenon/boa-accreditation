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
