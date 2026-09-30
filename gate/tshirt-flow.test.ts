// @vitest-environment node
import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import { GateDatabase } from './db'
import { queueTshirtGiven } from './tshirt-flow'

const personId = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const database = new GateDatabase('boa-accreditation-gate-tshirt-test')

function person(id: string, token: string, tshirtSize: 'M' | null) {
  return {
    passToken: token, personId: id, orgId: '99999999-9999-4999-8999-999999999999',
    status: 'approved' as const, updatedAt: '2026-10-01T10:00:00+05:30', fullName: 'A Person',
    roleText: 'Crew', orgName: 'Org', typeCode: 'crew' as const, dayValidity: 'show' as const, tshirtSize,
  }
}

beforeEach(async () => {
  await database.delete()
  await database.open()
  await database.roster.bulkPut([person(personId, 'tok-a', 'M'), person(other, 'tok-b', 'M')])
})

describe('queueTshirtGiven (ACC-197b)', () => {
  it('queues one outbox entry and marks only that person, at once (the radio may be off)', async () => {
    const action = await queueTshirtGiven(database, personId)

    const outbox = await database.outbox.toArray()
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ kind: 'tshirt_given', status: 'pending', idempotencyKey: action.idempotencyKey })
    expect(outbox[0]?.payload).toMatchObject({ personId })

    const marked = await database.roster.get('tok-a')
    expect(marked?.tshirtGivenAt).toBe(action.occurredAt)
    expect((await database.roster.get('tok-b'))?.tshirtGivenAt).toBeUndefined()
  })

  it('a second tap keeps the first time', async () => {
    const first = await queueTshirtGiven(database, personId)
    await queueTshirtGiven(database, personId)
    expect((await database.roster.get('tok-a'))?.tshirtGivenAt).toBe(first.occurredAt)
  })
})
