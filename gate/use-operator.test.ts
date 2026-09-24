import { describe, expect, it } from 'vitest'
import { initialsOf } from './use-operator'

/**
 * The avatar used to be the literal string "VI", so every issuer's phone
 * claimed to be Vipin. These cover the shapes real crew names actually take
 * at this gate, including the ones that used to throw on an empty part.
 */
describe('initialsOf', () => {
  it('takes the first and last initial of a full name', () => {
    expect(initialsOf('Bhoopesh Kumar')).toBe('BK')
  })

  it('skips middle names rather than crowding the avatar', () => {
    expect(initialsOf('Salman Ahmed Khan')).toBe('SK')
  })

  it('uses the first two letters of a single name', () => {
    expect(initialsOf('Vipin')).toBe('VI')
  })

  it('collapses the extra whitespace a pasted name carries', () => {
    expect(initialsOf('  Meera   Joseph  ')).toBe('MJ')
  })

  it('never throws on an empty or whitespace-only name', () => {
    expect(initialsOf('')).toBe('··')
    expect(initialsOf('   ')).toBe('··')
  })
})
