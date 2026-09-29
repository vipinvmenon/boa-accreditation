/**
 * The roster form is built by an Apps Script that cannot run here, so this
 * suite runs it against a stateful fake of FormApp / SpreadsheetApp /
 * PropertiesService: a Drive that holds forms between runs, and script
 * properties that persist, exactly as a real Apps Script project's do.
 *
 * It proves what the script ASKS Google to do — questions, order, choices,
 * validation, the linked sheet, and above all that a second run updates the
 * same form instead of minting a new link. It cannot prove Google renders it.
 *
 * It also pins the form's validation patterns to the database CHECKs, so a
 * value the form accepts is a value boa_acc_person accepts after the
 * importer's normalisation.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../scripts/roster-form/build-roster-form.gs', import.meta.url),
  'utf8',
)

type ItemType = 'TEXT' | 'LIST' | 'MULTIPLE_CHOICE'

class FakeItem {
  title = ''
  help = ''
  required = false
  choices: string[] | undefined
  other = false
  pattern: string | undefined
  constructor(
    readonly id: number,
    readonly type: ItemType,
    private readonly form: FakeForm,
  ) {}
  getId = () => this.id
  getType = () => this.type
  getTitle = () => this.title
  getIndex = () => this.form.items.indexOf(this)
  asTextItem = () => this.cast('TEXT')
  asListItem = () => this.cast('LIST')
  asMultipleChoiceItem = () => this.cast('MULTIPLE_CHOICE')
  private cast(t: ItemType) {
    if (t !== this.type) throw new Error(`cannot cast ${this.type} to ${t}`)
    return this
  }
  setTitle = (t: string) => ((this.title = t), this)
  setHelpText = (t: string) => ((this.help = t), this)
  setRequired = (r: boolean) => ((this.required = r), this)
  setChoiceValues = (c: string[]) => ((this.choices = [...c]), this)
  showOtherOption = (o: boolean) => ((this.other = o), this)
  setValidation = (v: { pattern: string }) => ((this.pattern = v.pattern), this)
  clearValidation = () => ((this.pattern = undefined), this)
}

class FakeForm {
  items: FakeItem[] = []
  responses = 0
  destination: string | null = null
  title = ''
  collectEmail: boolean | undefined
  private nextItem = 1000
  constructor(readonly id: string) {}
  getId = () => this.id
  getPublishedUrl = () => `https://docs.google.com/forms/d/e/pub-${this.id}/viewform`
  getEditUrl = () => `https://docs.google.com/forms/d/${this.id}/edit`
  setTitle = (t: string) => void (this.title = t)
  setDescription = () => undefined
  setCollectEmail = (v: boolean) => void (this.collectEmail = v)
  setAllowResponseEdits = () => undefined
  setShowLinkToRespondAgain = () => undefined
  setConfirmationMessage = () => undefined
  getResponses = () => Array.from({ length: this.responses })
  getItems = () => [...this.items]
  getItemById = (id: number) => this.items.find((i) => i.id === id) ?? null
  add(type: ItemType) {
    const item = new FakeItem(this.nextItem++, type, this)
    this.items.push(item)
    return item
  }
  addTextItem = () => this.add('TEXT')
  addListItem = () => this.add('LIST')
  addMultipleChoiceItem = () => this.add('MULTIPLE_CHOICE')
  deleteItem = (index: number) => void this.items.splice(index, 1)
  moveItem = (from: number, to: number) => {
    const [it] = this.items.splice(from, 1)
    this.items.splice(to, 0, it!)
  }
  getDestinationId = () => {
    if (!this.destination) throw new Error('This form does not have a response destination.')
    return this.destination
  }
  setDestination = (_type: string, id: string) => void (this.destination = id)
}

/** A Google account: Drive contents and one project's script properties. */
function makeWorld() {
  const forms = new Map<string, FakeForm>()
  const sheets: string[] = []
  const props = new Map<string, string>()
  const noAccess = new Set<string>() // form/sheet IDs this account cannot open
  let nextForm = 1
  return {
    forms,
    sheets,
    props,
    noAccess,
    newForm() {
      const f = new FakeForm(`form${String(nextForm++).padStart(24, '0')}`)
      forms.set(f.id, f)
      return f
    },
  }
}
type World = ReturnType<typeof makeWorld>

function run(world: World, opts: { orgs?: string[]; keep?: string; fn?: string } = {}) {
  const logs: string[] = []
  const context = {
    FormApp: {
      create: () => world.newForm(),
      openById: (id: string) => {
        if (world.noAccess.has(id)) throw new Error('You do not have permission to access the requested document.')
        const f = world.forms.get(id)
        if (!f) throw new Error('No item with the given ID could be found.')
        return f
      },
      createTextValidation: () => {
        const v = { pattern: '' }
        const b = {
          requireTextMatchesPattern: (p: string) => ((v.pattern = p), b),
          setHelpText: () => b,
          build: () => v,
        }
        return b
      },
      ItemType: { TEXT: 'TEXT', LIST: 'LIST', MULTIPLE_CHOICE: 'MULTIPLE_CHOICE' },
      DestinationType: { SPREADSHEET: 'SPREADSHEET' },
    },
    SpreadsheetApp: {
      create: () => {
        const id = `sheet-${world.sheets.length + 1}`
        world.sheets.push(id)
        return { getId: () => id, getUrl: () => `https://sheets.example/${id}` }
      },
      openById: (id: string) => {
        if (world.noAccess.has(id)) throw new Error('You do not have permission to access the requested document.')
        return { getUrl: () => `https://sheets.example/${id}` }
      },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => world.props.get(k) ?? null,
        setProperty: (k: string, v: string) => void world.props.set(k, v),
        deleteProperty: (k: string) => void world.props.delete(k),
        getKeys: () => [...world.props.keys()],
      }),
    },
    Logger: { log: (m: string) => void logs.push(m) },
  }
  const prelude =
    (opts.orgs ? `\nORGS = ${JSON.stringify(opts.orgs)};` : '') +
    (opts.keep ? `\nKEEP_FORM = ${JSON.stringify(opts.keep)};` : '')
  runInNewContext(`${source}${prelude}\n${opts.fn ?? 'buildRosterForm'}();`, context)
  return logs
}

const onlyForm = (w: World) => {
  expect(w.forms.size).toBe(1)
  return [...w.forms.values()][0]!
}
const item = (f: FakeForm, title: string) => f.items.find((i) => i.title === title)!

/** The importer's normalisation, restated so the patterns can be pinned. */
const normPhone = (v: string) => `+91${v}`
const normPlate = (v: string) => v.toUpperCase().replace(/\s/g, '')
// The database's own CHECKs, from supabase/migrations/202609110001_boa_acc_core.sql.
const DB_PHONE = /^\+91[6-9][0-9]{9}$/
const DB_PLATE = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$/

const TITLES = [
  'Organisation',
  'Full name',
  'WhatsApp number',
  'Crew type',
  'Job title',
  'Days on site',
  'Loading vehicle registration',
]

describe('roster form — what it asks', () => {
  it('asks exactly these questions, in this order', () => {
    const w = makeWorld()
    run(w)
    expect(onlyForm(w).items.map((i) => i.title)).toEqual(TITLES)
  })

  it('collects nothing beyond non-negotiable #9, and no respondent email', () => {
    const w = makeWorld()
    run(w)
    const f = onlyForm(w)
    const forbidden = /aadhaar|\bid number|photo(graph)?\b(?! id)|address|date of birth|dob/i
    for (const i of f.items) expect(i.title).not.toMatch(forbidden)
    expect(f.collectEmail).toBe(false)
  })

  it('offers Salman\'s crew types plus a write-in "Other"', () => {
    const w = makeWorld()
    run(w)
    const crew = item(onlyForm(w), 'Crew type')
    // Multiple choice, because Google Forms only allows a write-in Other there.
    expect(crew.type).toBe('MULTIPLE_CHOICE')
    expect(crew.other).toBe(true)
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
      'Special Tickets Crew',
      'BOA Internal Crew',
      'Family & Friends',
      'Media / Photo',
    ])
  })

  it('makes days required, one choice per day_validity value, no Other', () => {
    const w = makeWorld()
    run(w)
    const days = item(onlyForm(w), 'Days on site')
    expect(days.type).toBe('MULTIPLE_CHOICE')
    expect(days.required).toBe(true)
    expect(days.other).toBe(false)
    expect(days.choices).toHaveLength(3) // build / show / build_show
  })

  it('asks for the vehicle only when it is a loading vehicle', () => {
    const w = makeWorld()
    run(w)
    const v = item(onlyForm(w), 'Loading vehicle registration')
    expect(v.required).toBe(false)
    expect(v.help).toMatch(/loading or unloading equipment/i)
  })

  it('asks for organisation as text when ORGS is empty, and as a dropdown when filled', () => {
    const a = makeWorld()
    run(a)
    expect(onlyForm(a).items[0]).toMatchObject({ type: 'TEXT', required: true })
    const b = makeWorld()
    run(b, { orgs: ['F5 Events', 'Reynolds'] })
    expect(onlyForm(b).items[0]).toMatchObject({ type: 'LIST', choices: ['F5 Events', 'Reynolds'] })
  })
})

describe('roster form — one stable link', () => {
  it('a second run updates the same form and sheet instead of creating new ones', () => {
    const w = makeWorld()
    const first = run(w)
    const f = onlyForm(w)
    const ids = f.items.map((i) => i.id)

    const second = run(w)
    expect(onlyForm(w)).toBe(f)
    expect(w.sheets).toHaveLength(1)
    expect(f.items.map((i) => i.id)).toEqual(ids) // same questions, not re-added
    const link = (logs: string[]) => logs.find((l) => l.startsWith('SEND THIS LINK'))
    expect(link(second)).toBe(link(first))
  })

  it('adopts an existing form from its edit link and renames questions in place', () => {
    const w = makeWorld()
    // The form as the earlier script built it: old vehicle title.
    const old = w.newForm()
    for (const t of ['Organisation', 'Full name']) old.addTextItem().setTitle(t)
    const phone = old.addTextItem().setTitle('Mobile number')
    old.addMultipleChoiceItem().setTitle('Crew type')
    old.addTextItem().setTitle('Job title')
    old.addMultipleChoiceItem().setTitle('Days on site')
    const vehicle = old.addTextItem().setTitle('Vehicle registration')
    old.destination = 'sheet-existing'

    const logs = run(w, { keep: old.getEditUrl() })

    expect(logs.join('\n')).not.toMatch(/Forgotten/) // adopting is not forgetting
    expect(onlyForm(w)).toBe(old)
    expect(w.sheets).toHaveLength(0) // kept the linked sheet
    expect(vehicle.title).toBe('Loading vehicle registration') // same item, renamed
    expect(phone.title).toBe('WhatsApp number') // same item, renamed
    expect(old.items.map((i) => i.title)).toEqual(TITLES)
  })

  it('rebuilds a question whose type must change, when there are no responses', () => {
    const w = makeWorld()
    const old = w.newForm()
    old.addListItem().setTitle('Crew type') // the very first version was a dropdown
    const logs = run(w, { keep: old.getEditUrl() })
    expect(item(old, 'Crew type').type).toBe('MULTIPLE_CHOICE')
    expect(logs.join('\n')).toMatch(/rebuilt because its type changed: Crew type/)
  })

  it('refuses, changing nothing, when a type change would split a column with responses', () => {
    const w = makeWorld()
    const old = w.newForm()
    const crew = old.addListItem().setTitle('Crew type')
    old.responses = 3
    expect(() => run(w, { keep: old.getEditUrl() })).toThrow(/Delete all responses/)
    expect(old.items).toEqual([crew])
  })

  it('refuses the respondent link, whose ID cannot be opened', () => {
    const w = makeWorld()
    expect(() => run(w, { keep: 'https://docs.google.com/forms/d/e/1FAIpQLSabc123/viewform' })).toThrow(
      /EDIT link/,
    )
    expect(w.forms.size).toBe(0)
  })

  it('leaves questions it does not manage untouched', () => {
    const w = makeWorld()
    run(w)
    const f = onlyForm(w)
    const extra = f.addTextItem().setTitle('Added by hand')
    const logs = run(w)
    expect(f.items).toContain(extra)
    expect(logs.join('\n')).toMatch(/does not manage.*Added by hand/)
  })

  it('reports Google\'s own reason when the form cannot be opened', () => {
    const w = makeWorld()
    const other = w.newForm()
    w.noAccess.add(other.id) // e.g. owned by a different Google account
    expect(() => run(w, { keep: other.getEditUrl() })).toThrow(/Google said: You do not have permission/)
  })

  it('never relinks the form when its existing sheet cannot be opened', () => {
    const w = makeWorld()
    const f = w.newForm()
    f.destination = 'sheet-owned-elsewhere'
    w.noAccess.add('sheet-owned-elsewhere')
    expect(() => run(w, { keep: f.getEditUrl() })).toThrow(/has NOT been changed/)
    expect(f.destination).toBe('sheet-owned-elsewhere')
    expect(w.sheets).toHaveLength(0)
  })

  it('forgetForm makes the next run start a new form', () => {
    const w = makeWorld()
    run(w)
    run(w, { fn: 'forgetForm' })
    run(w)
    expect(w.forms.size).toBe(2)
  })
})

describe('roster form — patterns agree with the database', () => {
  const patterns = () => {
    const w = makeWorld()
    run(w)
    const f = onlyForm(w)
    return (title: string) => new RegExp(item(f, title).pattern!)
  }

  it('accepts only phones the database will accept once +91 is added', () => {
    const p = patterns()('WhatsApp number')
    for (const ok of ['9876543210', '6000000000']) {
      expect(p.test(ok)).toBe(true)
      expect(DB_PHONE.test(normPhone(ok))).toBe(true)
    }
    for (const bad of ['+919876543210', '98765 43210', '5876543210', '987654321']) {
      expect(p.test(bad)).toBe(false)
    }
  })

  it('accepts only plates the database will accept once uppercased and unspaced', () => {
    const p = patterns()('Loading vehicle registration')
    for (const ok of ['KA01AB1234', 'ka01ab1234', 'KA 01 AB 1234', 'DL3C1']) {
      expect(p.test(ok)).toBe(true)
      expect(DB_PLATE.test(normPlate(ok))).toBe(true)
    }
    for (const bad of ['K01AB1234', 'KA-01-AB-1234', 'not a plate']) {
      expect(p.test(bad)).toBe(false)
    }
  })

  it('keeps name and job within the database length limits', () => {
    const get = patterns()
    const name = get('Full name')
    const job = get('Job title')
    expect(name.test('A'.repeat(80))).toBe(true)
    expect(name.test('A'.repeat(81))).toBe(false)
    expect(name.test('A')).toBe(false)
    expect(job.test('A'.repeat(60))).toBe(true)
    expect(job.test('A'.repeat(61))).toBe(false)
  })
})
