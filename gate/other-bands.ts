import { gateIssueResultSchema } from '@/lib/schemas/gate'
import { formatBandSerial, formatLedgerTime } from '@/lib/format'
import { gateDb } from './db'

/**
 * The server's answer to a queued wristband issue lists any other live band the
 * person already held (another phone got there first). Read from the outbox
 * entry once it is done; null while the issue has not reached the server.
 */
export async function readOtherBands(idempotencyKey: string): Promise<string | null> {
  const entry = await gateDb.outbox.where('idempotencyKey').equals(idempotencyKey).first()
  if (!entry || entry.status !== 'done') return null
  const result = gateIssueResultSchema.safeParse(entry.result)
  if (!result.success) return null
  return describeOtherBands(result.data.otherBands)
}

export function describeOtherBands(
  others: ReadonlyArray<{ bandSerial: string | null; gateLabel: string; volunteerName: string; occurredAt: string }>,
): string | null {
  const first = others[0]
  if (!first) return null
  const serial = first.bandSerial ? `, serial ${formatBandSerial(first.bandSerial)}` : ''
  const more = others.length > 1 ? ` (and ${others.length - 1} more)` : ''
  return `Another band was already issued to this person by ${first.volunteerName} at ${formatLedgerTime(first.occurredAt)}${serial}${more}. They now have two. Take one back and tell a lead.`
}
