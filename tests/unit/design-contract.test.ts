/**
 * The design source is the contract (docs/DESIGN-SYSTEM.md). lib/design.ts is a
 * transcription of part of it, and a transcription can drift.
 *
 * scripts/check-design-tokens.mjs already proves the colour layers on every
 * lint. This suite proves the parts a colour check cannot see: the pass types,
 * their zones, and — the one most likely to be "tidied" by someone with good
 * intentions — the ZONE ORDER, which is load-bearing because every zone strip
 * renders in it and the boa_acc_zone enum will declare its values in it.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALL_ZONES, PROP, QR_SCHEME, TYPES, passType, typeColour } from '@/lib/design'

const source = readFileSync(new URL('../../design/source/boa_design_body.html', import.meta.url), 'utf8')

/** Pull one TYPES entry straight out of the design source. */
function typeFromSource(code: string) {
  const row = new RegExp(`\\{ code: '${code}',([^}]*)\\}`).exec(source)
  if (!row?.[1]) throw new Error(`no TYPES row for ${code} in the design source`)
  const body = row[1]
  const grab = (key: string) => new RegExp(`${key}: '([^']*)'`).exec(body)?.[1]
  const zones = /zones: \[([^\]]*)\]/.exec(body)?.[1]
  return {
    label: grab('label'),
    colour: grab('colour'),
    colourLight: grab('colourLight'),
    band: grab('band'),
    zones: zones ? zones.split(',').map((z) => z.trim().replace(/^'|'$/g, '')) : [],
  }
}

describe('zones', () => {
  it('match the design ALL_ZONES exactly, in order', () => {
    const raw = /const ALL_ZONES = \[([^\]]*)\]/.exec(source)?.[1]
    expect(raw, 'ALL_ZONES not found in the design source').toBeDefined()
    const fromSource = raw!.split(',').map((z) => z.trim().replace(/^'|'$/g, ''))
    // toEqual on arrays is order-sensitive, which is the point.
    expect([...ALL_ZONES]).toEqual(fromSource)
  })

  it('has exactly seven zones', () => {
    expect(ALL_ZONES).toHaveLength(7)
  })
})

describe('pass types', () => {
  it('are the design\'s three, not the 29-Aug spec\'s six', () => {
    expect(TYPES.map((t) => t.code)).toEqual(['crew', 'stage', 'aaa'])
  })

  it.each(['crew', 'stage', 'aaa'] as const)('%s matches the design source', (code) => {
    const want = typeFromSource(code)
    const got = passType(code)
    expect(got.label).toBe(want.label)
    expect(got.colour).toBe(want.colour)
    expect(got.colourLight).toBe(want.colourLight)
    expect(got.band).toBe(want.band)
    expect([...got.zones]).toEqual(want.zones)
  })

  it('only AAA holds every zone', () => {
    expect(passType('aaa').zones).toHaveLength(ALL_ZONES.length)
    expect(passType('crew').zones.length).toBeLessThan(ALL_ZONES.length)
    expect(passType('stage').zones.length).toBeLessThan(ALL_ZONES.length)
  })

  it('AAA is not requestable on the vendor form', () => {
    // The design: "Named list only, approved directly by Salman." The form must
    // never offer it; the guard itself lives in boa_acc_decide.
    expect(passType('aaa').note).toMatch(/named list only/i)
  })

  it('every zone a type holds is a real zone', () => {
    for (const t of TYPES) {
      for (const z of t.zones) expect(ALL_ZONES).toContain(z)
    }
  })

  it('resolves a colour per theme', () => {
    expect(typeColour('stage', 'dark')).toBe('#E3BB72')
    expect(typeColour('stage', 'light')).toBe('#5E4610')
  })
})

describe('the two colour layers (C8)', () => {
  it('PROP matches the renderVals() literals in the design source', () => {
    const re =
      /const (grn|gold|bad|ink|ink2|ink3|rule|grnbg|goldbg|badbg|on) = dark \? '([^']+)' : '([^']+)';/g
    const seen: string[] = []
    for (const m of source.matchAll(re)) {
      const [, key, dark, light] = m
      seen.push(key!)
      expect(PROP.dark[key as keyof typeof PROP.dark], `PROP.dark.${key}`).toBe(dark)
      expect(PROP.light[key as keyof typeof PROP.light], `PROP.light.${key}`).toBe(light)
    }
    expect(seen.length, 'parsed no colour literals — the regex has drifted').toBe(11)
  })

  it('still disagrees with the helmet layer on exactly the six known values', () => {
    // If this fails, someone "reconciled" the layers. That is the bug, not the
    // fix. See docs/DESIGN-SYSTEM.md, C8.
    const helmet = /\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(source)?.[1] ?? ''
    const token = (name: string) =>
      new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(helmet)?.[1]?.trim()

    expect(token('ink2')).toBe('rgba(242,239,226,0.72)')
    expect(PROP.dark.ink2).toBe('#A6C9B4')

    expect(token('on')).toBe('#0A0A0A')
    expect(PROP.dark.on).toBe('#0D0D12')

    expect(token('rule')).toBe('rgba(242,239,226,0.16)')
    expect(PROP.dark.rule).toBe('rgba(166,201,180,0.18)')
  })
})

describe('QR scheme', () => {
  it('is prefixed so a foreign QR is rejected before an index lookup', () => {
    expect(QR_SCHEME).toBe('BOA26:')
    expect(`${QR_SCHEME}abc`.startsWith(QR_SCHEME)).toBe(true)
    expect('https://example.com/evil'.startsWith(QR_SCHEME)).toBe(false)
  })
})
