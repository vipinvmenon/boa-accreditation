// @vitest-environment node
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import {
  GateDatabase,
  ledgerRowSchema,
  metaRowSchema,
  outboxRowSchema,
  rosterRowSchema,
  stickerRowSchema,
} from './db'

const personId = '11111111-1111-4111-8111-111111111111'
const orgId = '22222222-2222-4222-8222-222222222222'
const entryId = '33333333-3333-4333-8333-333333333333'
const idempotencyKey = '44444444-4444-4444-8444-444444444444'
const occurredAt = '2026-10-10T09:00:00+05:30'

const database = new GateDatabase('boa-accreditation-gate-test')

beforeEach(async () => {
  await database.delete()
  await database.open()
})

describe('GateDatabase v1', () => {
  it('declares the five stores and their required indexes', () => {
    expect(database.verno).toBe(1)
    expect(database.tables.map((table) => table.name)).toEqual([
      'roster',
      'ledger',
      'outbox',
      'sticker',
      'meta',
    ])

    expect(database.roster.schema.primKey.name).toBe('passToken')
    expect(database.roster.schema.indexes.map((index) => index.name)).toEqual([
      'personId',
      'orgId',
      'status',
      'updatedAt',
    ])
    expect(database.ledger.schema.indexes.map((index) => index.name)).toEqual([
      'personId',
      'kind',
      'occurredAt',
      '[personId+kind]',
    ])
    expect(database.outbox.schema.indexes.map((index) => index.name)).toEqual([
      'kind',
      'idempotencyKey',
      'status',
      'nextAttemptAt',
      'createdAt',
    ])
    expect(database.sticker.schema.indexes.map((index) => index.name)).toEqual([
      'stickerNo',
      'personId',
      'issuedAt',
    ])
    expect(database.meta.schema.primKey.name).toBe('key')
  })

  it('stores validated roster, ledger, sticker, and metadata rows', async () => {
    const roster = rosterRowSchema.parse({
      passToken: 'pass-token',
      personId,
      orgId,
      status: 'approved',
      vehicleReg: 'KA01AB1234',
      updatedAt: occurredAt,
    })
    const ledger = ledgerRowSchema.parse({
      id: entryId,
      personId,
      kind: 'wristband',
      occurredAt,
      gateLabel: 'Gate 1',
      volunteerName: 'Ravi',
      isReissue: false,
    })
    const sticker = stickerRowSchema.parse({
      plate: 'KA01AB1234',
      stickerNo: 'ST-0412',
      personId,
      issuedAt: occurredAt,
    })
    const meta = metaRowSchema.parse({ key: 'rosterAsOf', value: occurredAt })

    await database.roster.add(roster)
    await database.ledger.add(ledger)
    await database.sticker.add(sticker)
    await database.meta.add(meta)

    await expect(database.roster.get('pass-token')).resolves.toEqual(roster)
    await expect(database.ledger.get(entryId)).resolves.toEqual(ledger)
    await expect(database.sticker.get('KA01AB1234')).resolves.toEqual(sticker)
    await expect(database.meta.get('rosterAsOf')).resolves.toEqual(meta)
  })

  it('retains blank physical serials as complete ledger rows', async () => {
    const ledger = ledgerRowSchema.parse({
      id: entryId,
      personId,
      kind: 'wristband',
      occurredAt,
      bandSerial: '',
      gateLabel: 'Gate 1',
      volunteerName: 'Ravi',
      isReissue: false,
    })

    await database.ledger.add(ledger)

    await expect(database.ledger.get(entryId)).resolves.toEqual(ledger)
  })

  it('persists an outbox action with its idempotency key and retry state', async () => {
    const outbox = outboxRowSchema.parse({
      id: entryId,
      kind: 'issue',
      idempotencyKey,
      status: 'pending',
      nextAttemptAt: 0,
      createdAt: 0,
      payload: { personId, bandSerial: '' },
      attempts: 0,
    })

    await database.outbox.add(outbox)

    await expect(database.outbox.where('idempotencyKey').equals(idempotencyKey).first()).resolves.toEqual(outbox)
  })

  it('survives closing and reopening, preserving queued work', async () => {
    const outbox = outboxRowSchema.parse({
      id: entryId,
      kind: 'issue',
      idempotencyKey,
      status: 'pending',
      nextAttemptAt: 10,
      createdAt: 1,
      payload: {},
      attempts: 0,
    })

    await database.outbox.add(outbox)
    database.close()
    await database.open()

    await expect(database.outbox.get(entryId)).resolves.toEqual(outbox)
  })
})
