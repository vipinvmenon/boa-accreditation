/**
 * The roster form is built by an Apps Script that cannot run here, so this
 * suite runs it against recording stubs of FormApp / SpreadsheetApp. It proves
 * what the script ASKS Google to build — questions, order, dropdown values,
 * validation patterns, the linked sheet. It cannot prove Google renders it;
 * that still needs a human to open the form once.
 *
 * It also pins the form's validation patterns to the database CHECKs, so a
 * value the form accepts is a value boa_acc_person accepts after the
 * importer's normalisation.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

type Item = {
  kind: string
  title?: string
  help?: string
  required?: boolean
  choices?: string[]
  pattern?: string
}

const source = readFileSync(
  new URL('../../scripts/roster-form/build-roster-form.gs', import.meta.url),
  'utf8',
)

type Settings = {
  title?: string
  description?: string
  collectEmail?: boolean
  edits?: boolean
  again?: boolean
  confirmation?: string
}

function run(orgs?: string[]) {
  const items: Item[] = []
  const settings: Settings = {}
  let destination: { type: string; id: string } | null = null

  const itemBuilder = (kind: string) => {
    const item: Item = { kind }
    items.push(item)
    const b = {
      setTitle: (t: string) => ((item.title = t), b),
      setHelpText: (t: string) => ((item.help = t), b),
      setRequired: (r: boolean) => ((item.required = r), b),
      setChoiceValues: (c: string[]) => ((item.choices = [...c]), b),
      setValidation: (v: { pattern: string }) => ((item.pattern = v.pattern), b),
    }
    return b
  }

  const formObj = {
    setDescription: (d: string) => void (settings.description = d),
    setCollectEmail: (v: boolean) => void (settings.collectEmail = v),
    setAllowResponseEdits: (v: boolean) => void (settings.edits = v),
    setShowLinkToRespondAgain: (v: boolean) => void (settings.again = v),
    setConfirmationMessage: (m: string) => void (settings.confirmation = m),
    addTextItem: () => itemBuilder('text'),
    addListItem: () => itemBuilder('list'),
    addMultipleChoiceItem: () => itemBuilder('choice'),
    setDestination: (type: string, id: string) => void (destination = { type, id }),
    getPublishedUrl: () => 'https://forms.example/published',
    getEditUrl: () => 'https://forms.example/edit',
  }

  const logs: string[] = []
  const context = {
    FormApp: {
      create: (title: string) => ((settings.title = title), formObj),
      createTextValidation: () => {
        const v = { pattern: '' }
        const b = {
          requireTextMatchesPattern: (p: string) => ((v.pattern = p), b),
          setHelpText: () => b,
          build: () => v,
        }
        return b
      },
      DestinationType: { SPREADSHEET: 'SPREADSHEET' },
    },
    SpreadsheetApp: {
      create: (name: string) => ({
        getId: () => 'sheet-id-1',
        getUrl: () => `https://sheets.example/${encodeURIComponent(name)}`,
      }),
    },
    Logger: { log: (m: string) => void logs.push(m) },
  }

  const prelude = orgs ? `\nORGS = ${JSON.stringify(orgs)};\n` : ''
  runInNewContext(`${source}${prelude}\nbuildRosterForm();`, context)
  return { items, settings, destination: destination as { type: string; id: string } | null, logs }
}

/** The importer's normalisation, restated so the patterns can be pinned. */
const normPhone = (v: string) => `+91${v}`
const normPlate = (v: string) => v.toUpperCase().replace(/\s/g, '')

// The database's own CHECKs, from supabase/migrations/202609110001_boa_acc_core.sql.
const DB_PHONE = /^\+91[6-9][0-9]{9}$/
const DB_PLATE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/

describe('roster form', () => {
  it('asks exactly these questions, in this order', () => {
    const { items } = run()
    expect(items.map((i) => i.title)).toEqual([
      'Organisation',
      'Full name',
      'Mobile number',
      'Crew type',
      'Job title',
      'Days on site',
      'Vehicle registration',
    ])
  })

  it('collects nothing beyond non-negotiable #9, and no respondent email', () => {
    const { items, settings } = run()
    const forbidden = /aadhaar|\bid number|photo(graph)?\b(?! id)|address|date of birth|dob/i
    for (const i of items) expect(i.title).not.toMatch(forbidden)
    expect(settings.collectEmail).toBe(false)
  })

  it('offers Salman\'s crew types as a closed dropdown, with no "Other"', () => {
    const crew = run().items.find((i) => i.title === 'Crew type')!
    expect(crew.kind).toBe('list')
    expect(crew.required).toBe(true)
    expect(crew.choices).toEqual([
      'Security',
      'Bouncer',
      'Bar Crew',
      'Merch Crew',
      'Artist Hospitality',
      'Food Stalls',
      'Cashless',
      'Sound & Lights',
      'Generator',
      'Ground Production',
      'Sponsor',
    ])
  })

  it('makes days required, with one choice per day_validity value', () => {
    const days = run().items.find((i) => i.title === 'Days on site')!
    expect(days.kind).toBe('choice')
    expect(days.required).toBe(true)
    expect(days.choices).toHaveLength(3) // build / show / build_show
  })

  it('asks for organisation as text when ORGS is empty, and as a dropdown when filled', () => {
    expect(run().items[0]).toMatchObject({ kind: 'text', required: true })
    expect(run(['F5 Events', 'Reynolds']).items[0]).toMatchObject({
      kind: 'list',
      choices: ['F5 Events', 'Reynolds'],
    })
  })

  it('links responses to a new spreadsheet and logs the links', () => {
    const { destination, logs } = run()
    expect(destination).toEqual({ type: 'SPREADSHEET', id: 'sheet-id-1' })
    expect(logs.join('\n')).toMatch(/SEND THIS LINK/)
  })

  it('accepts only phones the database will accept once +91 is added', () => {
    const p = new RegExp(run().items.find((i) => i.title === 'Mobile number')!.pattern!)
    for (const ok of ['9876543210', '6000000000']) {
      expect(p.test(ok)).toBe(true)
      expect(DB_PHONE.test(normPhone(ok))).toBe(true)
    }
    for (const bad of ['+919876543210', '98765 43210', '5876543210', '987654321']) {
      expect(p.test(bad)).toBe(false)
    }
  })

  it('accepts only plates the database will accept once uppercased and unspaced', () => {
    const p = new RegExp(run().items.find((i) => i.title === 'Vehicle registration')!.pattern!)
    for (const ok of ['KA01AB1234', 'ka01ab1234', 'KA 01 AB 1234', 'DL3C1']) {
      expect(p.test(ok)).toBe(true)
      expect(DB_PLATE.test(normPlate(ok))).toBe(true)
    }
    for (const bad of ['K01AB1234', 'KA-01-AB-1234', 'not a plate']) {
      expect(p.test(bad)).toBe(false)
    }
  })

  it('keeps name and job within the database length limits', () => {
    const { items } = run()
    const name = new RegExp(items.find((i) => i.title === 'Full name')!.pattern!)
    const job = new RegExp(items.find((i) => i.title === 'Job title')!.pattern!)
    expect(name.test('A'.repeat(80))).toBe(true)
    expect(name.test('A'.repeat(81))).toBe(false)
    expect(name.test('A')).toBe(false)
    expect(job.test('A'.repeat(60))).toBe(true)
    expect(job.test('A'.repeat(61))).toBe(false)
  })
})
