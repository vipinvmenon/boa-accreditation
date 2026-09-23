// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { resolveScan } from './resolve'
import {
  buildSearchIndex,
  maskPhone,
  normaliseText,
  passPayload,
  searchPeople,
  type SearchableRow,
} from './search'

const AT = '2026-09-12T12:00:00.000Z'
const ORG_ID = '22222222-2222-4222-8222-222222222222'

let seq = 0
function person(fullName: string, extra: Partial<SearchableRow> = {}): SearchableRow {
  seq += 1
  const hex = seq.toString(16).padStart(12, '0')
  return {
    passToken: `tok-${seq}`,
    personId: `11111111-1111-4111-8111-${hex}`,
    orgId: ORG_ID,
    status: 'approved',
    updatedAt: AT,
    fullName,
    roleText: 'Stage tech',
    orgName: 'Test Org',
    typeCode: 'crew',
    dayValidity: 'build_show',
    ...extra,
  }
}

const ravi = person('Ravi Kumar', { phone: '+919876543210' })
const ravinder = person('Ravinder Singh')
const kumarRavi = person('Kumar Ravi Shankar')
const jose = person('José  D’Souza', { phone: '+919811100001', vehicleReg: 'KA 01 AB 1234' })
const anita = person('Anita Rao', { phone: '+919000003210' })
const ROWS = [ravi, ravinder, kumarRavi, jose, anita]
const index = buildSearchIndex(ROWS)
const names = (query: string, limit?: number) => searchPeople(index, query, limit).map((m) => m.row.fullName)

describe('normaliseText', () => {
  it('folds case, diacritics, punctuation and whitespace', () => {
    expect(normaliseText('  José\tD’Souza ')).toBe('jose d souza')
    expect(normaliseText('ÅNGSTRÖM-Ñoño')).toBe('angstrom nono')
  })
})

describe('searchPeople — names', () => {
  it('ignores queries that are too short', () => {
    expect(names('')).toEqual([])
    expect(names('r')).toEqual([])
    expect(names('   ')).toEqual([])
  })

  it('matches any word prefix, case and accent insensitively', () => {
    expect(names('JOSE')).toEqual(['José  D’Souza'])
    expect(names('souz')).toEqual(['José  D’Souza'])
    expect(names('d souza')).toEqual(['José  D’Souza'])
    expect(names('  shank ')).toEqual(['Kumar Ravi Shankar'])
  })

  it('ranks a full-name prefix above a later-word match', () => {
    // "Ravi Kumar" and "Ravinder" start with "ravi"; "Kumar Ravi" only has it second.
    expect(names('ravi')).toEqual(['Ravi Kumar', 'Ravinder Singh', 'Kumar Ravi Shankar'])
    expect(names('kumar')).toEqual(['Kumar Ravi Shankar', 'Ravi Kumar'])
  })

  it('requires every query word to prefix a different name word', () => {
    expect(names('ravi kum')).toEqual(['Ravi Kumar', 'Kumar Ravi Shankar'])
    expect(names('ravi singh')).toEqual(['Ravinder Singh'])
    expect(names('ravi rao')).toEqual([])
    expect(names('ravi ravi')).toEqual([])
  })

  it('matches a name typed without its space', () => {
    expect(names('ravikum')).toEqual(['Ravi Kumar'])
  })

  it('does not match in the middle of a word', () => {
    expect(names('umar')).toEqual([])
  })

  it('caps results and orders ties deterministically', () => {
    const many = buildSearchIndex(Array.from({ length: 20 }, (_, i) => person(`Crew Member ${String(20 - i).padStart(2, '0')}`)))
    const result = searchPeople(many, 'crew').map((m) => m.row.fullName)
    expect(result).toHaveLength(8)
    expect(result[0]).toBe('Crew Member 01')
    expect(result[7]).toBe('Crew Member 08')
    expect(searchPeople(many, 'crew', 3)).toHaveLength(3)
  })
})

describe('searchPeople — phone and plate', () => {
  it('matches trailing phone digits, at least four', () => {
    expect(names('3210')).toEqual(['Anita Rao', 'Ravi Kumar'])
    expect(names('43210')).toEqual(['Ravi Kumar'])
    expect(names('98765 43210')).toEqual(['Ravi Kumar'])
    expect(names('210')).toEqual([])
    // Leading digits are not a match: only the end of the number counts.
    expect(names('9876')).toEqual([])
  })

  it('ranks an exact full number first', () => {
    const matches = searchPeople(index, '+91 98765 43210')
    expect(matches[0]?.row).toBe(ravi)
    expect(matches[0]?.matchedBy).toBe('phone')
  })

  it('matches nothing by phone when the cached row carries no phone', () => {
    const noPhones = buildSearchIndex([person('No Phone')])
    expect(searchPeople(noPhones, '3210')).toEqual([])
  })

  it('falls back to a vehicle plate', () => {
    const matches = searchPeople(index, 'ab1234')
    expect(matches.map((m) => [m.row.fullName, m.matchedBy])).toEqual([['José  D’Souza', 'plate']])
    expect(searchPeople(index, '1234').map((m) => m.matchedBy)).toEqual(['plate'])
  })
})

describe('maskPhone', () => {
  it('shows only the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('••• 3210')
    expect(maskPhone('12')).toBe('•••')
  })
})

describe('a pick feeds the scanner path', () => {
  it('produces a payload resolveScan resolves to the same person', () => {
    const [match] = searchPeople(index, 'anita')
    expect(match).toBeDefined()
    const roster = new Map(ROWS.map((row) => [row.passToken, row]))
    const result = resolveScan(passPayload(match!.row.passToken), roster, new Map(), new Map())
    expect(result.status).toBe('green')
    expect(result.status !== 'red' && result.person.personId).toBe(anita.personId)
  })
})

describe('performance', () => {
  it('searches a 2,000-row roster quickly with no network', () => {
    const big = buildSearchIndex(
      Array.from({ length: 2000 }, (_, i) =>
        person(`Person${i} Surname${i % 97}`, { phone: `+9198${String(i).padStart(8, '0')}` }),
      ),
    )
    const queries = ['per', 'surname4', 'person1999', '0042', 'zzz', 'person12 sur']
    const started = performance.now()
    for (let round = 0; round < 10; round += 1) for (const q of queries) searchPeople(big, q)
    const elapsed = performance.now() - started
    // 60 searches; a generous bound so a slow CI box does not flake.
    expect(elapsed).toBeLessThan(1500)
    expect(searchPeople(big, 'person1999').map((m) => m.row.fullName)).toEqual(['Person1999 Surname59'])
  })
})
