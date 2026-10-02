// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { acceptCameraRead, HOLD_MS } from './scan-guard'

const A = 'BOA26:aaaa'
const B = 'BOA26:bbbb'

describe('acceptCameraRead', () => {
  it('accepts the first read on an idle scanner', () => {
    expect(acceptCameraRead(A, 'none', null, 0)).toEqual({ accept: true, last: { payload: A, at: 0 } })
  })

  it('ignores the pass already on screen, however long it stays in view', () => {
    let last = acceptCameraRead(A, 'none', null, 0).last
    for (const now of [700, 1400, 10_000]) {
      const read = acceptCameraRead(A, 'open', last, now)
      expect(read.accept).toBe(false)
      last = read.last
    }
    // Still the same pass straight after "Next person": still held.
    expect(acceptCameraRead(A, 'none', last, 10_700).accept).toBe(false)
  })

  it('accepts the same pass again once it has been out of view for the hold', () => {
    const last = { payload: A, at: 0 }
    expect(acceptCameraRead(A, 'none', last, HOLD_MS - 1).accept).toBe(false)
    expect(acceptCameraRead(A, 'none', last, HOLD_MS).accept).toBe(true)
  })

  it('locks an Approved result that has no band yet against a different pass', () => {
    const last = { payload: A, at: 0 }
    const read = acceptCameraRead(B, 'locked', last, 700)
    expect(read.accept).toBe(false)
    expect(read.last).toBe(last)
  })

  it('lets a different pass replace a Refuse or Collected result', () => {
    expect(acceptCameraRead(B, 'open', { payload: A, at: 0 }, 700)).toEqual({ accept: true, last: { payload: B, at: 700 } })
  })
})
