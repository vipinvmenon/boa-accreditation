/**
 * ACC-050 — the gate's durable local database.
 *
 * This is deliberately only the storage foundation. The gate reads its
 * roster/ledger from here and later queues every write in `outbox`; network
 * pulls and drains belong to later Phase 4 tasks.
 *
 * Dexie starts at version 1 so future schema changes have an explicit
 * migration path. Do not rename a store or change an index without adding a
 * Dexie upgrade.
 */
import Dexie, { type EntityTable } from 'dexie'
import { z } from 'zod'
import { tierCodeSchema } from '@/lib/schemas/accreditation'

const uuid = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })

export const rosterRowSchema = z.object({
  passToken: z.string().min(1),
  personId: uuid,
  orgId: uuid,
  status: z.literal('approved'),
  vehicleReg: z.string().min(1).optional(),
  updatedAt: timestamp,
  fullName: z.string().min(1),
  // Optional: rows cached by a pull older than ACC-150 carry no phone, and
  // they must keep parsing. Search treats a missing phone as "no match by
  // phone" (gate/search.ts) rather than failing.
  phone: z.string().min(1).optional(),
  roleText: z.string().min(1),
  orgName: z.string().min(1),
  // Widened to the pack's eight tiers (ADR-018) with no Dexie version bump:
  // typeCode is not an index, and crew/stage/aaa rows already cached remain
  // valid tiers, so no stored row needs rewriting.
  typeCode: tierCodeSchema,
  dayValidity: z.enum(['build', 'show', 'build_show']),
  // ACC-197: null/absent = no crew T-shirt. Optional so rows cached before
  // this pull still parse; not an index, so no Dexie version bump.
  tshirtSize: z.enum(['S', 'M', 'L', 'XL', 'XXL', '3XL']).nullable().optional(),
  // ACC-197b: when the shirt was handed over (this phone's tap until the server
  // confirms it). Monotonic: a pull never clears it. Not an index.
  tshirtGivenAt: timestamp.nullable().optional(),
})

export type RosterRow = z.infer<typeof rosterRowSchema>

export const ledgerRowSchema = z.object({
  id: uuid,
  personId: uuid,
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  occurredAt: timestamp,
  // Empty strings are intentional: the physical article may have no serial,
  // and serials are typed at the gate rather than pre-assigned.
  bandSerial: z.string().optional(),
  stickerNo: z.string().optional(),
  gateLabel: z.string().min(1),
  volunteerName: z.string().min(1),
  isReissue: z.boolean(),
})

export type LedgerRow = z.infer<typeof ledgerRowSchema>

export const outboxStatusSchema = z.enum([
  'pending',
  'syncing',
  'done',
  'failed',
  'resolved',
])

export const outboxRowSchema = z.object({
  id: uuid,
  kind: z.string().min(1),
  idempotencyKey: uuid,
  status: outboxStatusSchema,
  nextAttemptAt: z.number().finite(),
  createdAt: z.number().finite(),
  payload: z.unknown(),
  result: z.unknown().optional(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().optional(),
})

export type OutboxRow = z.infer<typeof outboxRowSchema>

export const stickerRowSchema = z.object({
  plate: z.string().min(1),
  stickerNo: z.string().min(1),
  personId: uuid,
  issuedAt: timestamp,
})

export type StickerRow = z.infer<typeof stickerRowSchema>

export const metaKeySchema = z.enum([
  // Written by device-token pulls before ACC-150; kept so a cache written
  // then still parses. No longer written.
  'deviceTokenHint',
  'operatorId',
  'rosterAsOf',
  'ledgerAsOf',
  'schemaVersion',
  'gateLabel',
  'volunteerName',
  // ACC-149: epoch ms of this device's last successful roster pull and last
  // full outbox drain, rendered as "Last synced". Not indexed; no version bump.
  'lastPullAt',
  'lastDrainAt',
  /**
   * Who is signed in on this phone, cached so the gate can render the right
   * chrome with the radio off (non-negotiable #7). The role only ever arrives
   * from `/api/gate/session`, which is online-only, so without this a phone
   * that boots offline knows its operator's id but not whether they are an
   * issuer or an admin. Display only: every authorisation decision is still
   * the database's (non-negotiable #3), and a stale role here can at worst
   * show the wrong nav, never grant anything. Not indexed; no version bump.
   */
  'operatorRole',
  'operatorName',
])

export const metaRowSchema = z.object({
  key: metaKeySchema,
  value: z.union([z.string(), z.number().finite()]),
})

export type MetaRow = z.infer<typeof metaRowSchema>

export class GateDatabase extends Dexie {
  roster!: EntityTable<RosterRow, 'passToken'>
  ledger!: EntityTable<LedgerRow, 'id'>
  outbox!: EntityTable<OutboxRow, 'id'>
  sticker!: EntityTable<StickerRow, 'plate'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor(name = 'boa-accreditation-gate') {
    super(name)

    this.version(1).stores({
      roster: 'passToken, personId, orgId, status, updatedAt',
      ledger: 'id, personId, kind, occurredAt, [personId+kind]',
      outbox: 'id, kind, idempotencyKey, status, nextAttemptAt, createdAt',
      sticker: 'plate, stickerNo, personId, issuedAt',
      meta: 'key',
    })
  }
}

export const gateDb = new GateDatabase()
