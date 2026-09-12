/**
 * ACC-052 — pure scan resolution.
 *
 * `activeLedger` is an already-filtered projection. Dexie v1 does not store
 * `voidsCheckinId`, so this module deliberately cannot determine whether a
 * ledger row was voided. A future cache version may add that identity; until
 * then the pull that builds this projection must do the void join server-side.
 * This resolver never infers void state from ordering or physical serials.
 *
 * The maps are projections rather than database handles: this module performs
 * no Dexie IO, network access, mutation, or serial assignment.
 */
import { z } from 'zod'
import type { LedgerRow, RosterRow } from './db'
import { ledgerRowSchema, rosterRowSchema } from './db'

const decodedQrSchema = z
  .string()
  .regex(/^BOA26:([^:\s]+)$/, 'QR must be BOA26:<token>')
  .transform((value) => value.slice('BOA26:'.length))

const issueKindSchema = z.enum(['wristband', 'vehicle_sticker'])

const issueProjectionSchema = ledgerRowSchema
  .omit({ kind: true })
  .extend({ kind: issueKindSchema })

const pendingActionSchema = z.object({
  personId: z.string().uuid(),
  kind: issueKindSchema,
  occurredAt: z.string().datetime({ offset: true }).optional(),
  bandSerial: z.string().optional(),
  stickerNo: z.string().optional(),
  gateLabel: z.string().min(1),
  volunteerName: z.string().min(1),
  isReissue: z.boolean(),
})

export type IssueProjection = z.infer<typeof issueProjectionSchema>
export type PendingActionProjection = z.infer<typeof pendingActionSchema>

export type ActiveLedgerProjection = ReadonlyMap<string, LedgerRow | readonly LedgerRow[]>
export type PendingActionMap = ReadonlyMap<string, PendingActionProjection>
export type RosterProjection = ReadonlyMap<string, RosterRow>

export type GateIssue = IssueProjection | PendingActionProjection

export type GateResolution =
  | { status: 'red'; reason: 'invalid_token' | 'not_found' }
  | { status: 'green'; person: RosterRow; stickerDue: boolean }
  | {
      status: 'amber'
      person: RosterRow
      issue: GateIssue
      source: 'ledger' | 'outbox'
    }

function parseRoster(roster: RosterProjection, token: string): RosterRow | undefined {
  const candidate = roster.get(token)
  if (candidate === undefined) return undefined
  return rosterRowSchema.parse(candidate)
}

function parseLedgerIssues(
  activeLedger: ActiveLedgerProjection,
  personId: string,
): IssueProjection[] {
  const candidate = activeLedger.get(personId)
  if (candidate === undefined) return []
  const rows = Array.isArray(candidate) ? candidate : [candidate]
  return rows.map((row) => issueProjectionSchema.parse(row))
}

function parsePendingAction(
  pendingActions: PendingActionMap,
  personId: string,
): PendingActionProjection | undefined {
  const candidate = pendingActions.get(personId)
  if (candidate === undefined) return undefined
  return pendingActionSchema.parse(candidate)
}

/**
 * Resolve one decoded scan against only the caller-supplied projections.
 *
 * The ledger projection is expected to contain the current active issue for a
 * person, if any. Pending wristband work wins over a green result even before
 * the outbox drains; pending sticker work is also returned as amber so a
 * repeated offline action cannot look like a fresh collection.
 */
export function resolveScan(
  raw: unknown,
  roster: RosterProjection,
  activeLedger: ActiveLedgerProjection,
  pendingActions: PendingActionMap,
): GateResolution {
  const decoded = decodedQrSchema.safeParse(raw)
  if (!decoded.success) return { status: 'red', reason: 'invalid_token' }

  const person = parseRoster(roster, decoded.data)
  if (person === undefined) return { status: 'red', reason: 'not_found' }

  const ledgerIssues = parseLedgerIssues(activeLedger, person.personId)
  const ledgerWristband = ledgerIssues.find((issue) => issue.kind === 'wristband')
  if (ledgerWristband !== undefined) {
    return { status: 'amber', person, issue: ledgerWristband, source: 'ledger' }
  }

  const pendingAction = parsePendingAction(pendingActions, person.personId)
  if (pendingAction !== undefined) {
    return { status: 'amber', person, issue: pendingAction, source: 'outbox' }
  }

  return {
    status: 'green',
    person,
    stickerDue:
      Boolean(person.vehicleReg) && !ledgerIssues.some((issue) => issue.kind === 'vehicle_sticker'),
  }
}
