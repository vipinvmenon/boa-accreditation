/**
 * ACC-117 / ACC-141–143 · lib/roster-import.ts — the roster form's response
 * sheet, parsed and validated offline, before anything reaches
 * boa_acc_import_approve.
 *
 * It also pins the lists this module must agree with — the form's questions
 * and answers (build-roster-form.gs), the pack's tier labels (lib/design.ts),
 * and the jsonb fields and outcomes of the RPC (the migration) — so a change
 * in one place fails here instead of at import time.
 *
 * It cannot prove the database's decisions (approval, the pass, the AAA
 * guard, duplicates, changed tiers): supabase/tests/import-approve.test.sql
 * does that.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { TIERS } from '@/lib/design'
import {
  DAYS_ANSWERS,
  DESK_HEADER,
  DESK_TIERS,
  DESK_TIER_CODES,
  FORM_CREW_TYPES,
  IMPORT_OUTCOMES,
  ROSTER_HEADER,
  importApproveSql,
  importRowSchema,
  matchOrganisations,
  normaliseCrewType,
  normalisePhone,
  normalisePlate,
  cleanOrgName,
  orgLooseKey,
  reconcileOrganisations,
  parseFormTimestamp,
  parseOrgAliases,
  resolveOrganisation,
  toRpcPayload,
  validateRoster,
} from '@/lib/roster-import'

const HEADER = ROSTER_HEADER.join(',')
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const line = (cells: string[]) => cells.map(csvCell).join(',')

/** One response row with sane defaults; override any column by name. */
function row(o: Partial<Record<(typeof ROSTER_HEADER)[number], string>> = {}) {
  const base: Record<(typeof ROSTER_HEADER)[number], string> = {
    Timestamp: '9/21/2026 14:03:05',
    Organisation: 'F5 Events',
    'Full name': 'Ravi Kumar',
    'WhatsApp number': '9876543210',
    'Crew type': 'Security',
    'Job title': '',
    'Days on site': 'Show day only (10 Oct)',
    'Loading vehicle registration': '',
  }
  const merged = { ...base, ...o }
  return line(ROSTER_HEADER.map((h) => merged[h]))
}
const sheet = (...rows: string[]) => [HEADER, ...rows].join('\r\n') + '\r\n'

/** The same sheet with the desk's column on the right; `desk` fills it per row. */
const deskSheet = (...rows: [string, string][]) =>
  [`${HEADER},${DESK_HEADER}`, ...rows.map(([r, desk]) => `${r},${csvCell(desk)}`)].join('\r\n') + '\r\n'

const migration = readFileSync(
  new URL('../../supabase/migrations/202609301000_boa_acc_crew_tshirt.sql', import.meta.url),
  'utf8',
)

describe('the column contract', () => {
  it('accepts the exact header and refuses a renamed column', () => {
    expect(validateRoster(sheet(row())).fatal).toBeNull()
    const renamed = sheet(row()).replace('WhatsApp number', 'Mobile number')
    expect(validateRoster(renamed).fatal).toMatch(/Invalid header/)
  })

  it('refuses an empty sheet and a malformed CSV', () => {
    expect(validateRoster(`${HEADER}\n`).fatal).toMatch(/no data rows/)
    expect(validateRoster(`${HEADER}\n"unterminated`).fatal).toMatch(/Invalid CSV/)
  })

  it('refuses a row with the wrong number of columns, by sheet row number', () => {
    const v = validateRoster(`${HEADER}\n${row()}\na,b,c\n`)
    expect(v.errors).toEqual([{ row_no: 3, organisation: 'b', errors: ['expected 8 columns, received 3'] }])
  })

  it('a sheet with no desk column is valid, but nothing in it is decided', () => {
    const v = validateRoster(sheet(row()))
    expect(v.rows[0]?.type_code).toBeNull()
    expect(v.undecided).toEqual([2])
    expect(v.warnings.join('\n')).toMatch(/No "Accreditation type" column: every row imports as submitted/)
  })
})

describe('a question re-added in the form editor leaves Google\'s repeat column (6 Oct)', () => {
  // The live sheet on 6 Oct: a second "Crew type" at I, the desk's columns pushed to J–L.
  const TSHIRT = 'T-Shirt,T-Shirt Size'
  const repeatSheet = (...rows: [string, string, string][]) =>
    [`${HEADER},Crew type,${DESK_HEADER},${TSHIRT}`, ...rows.map(([r, again, deskCell]) => `${r},${csvCell(again)},${csvCell(deskCell)},,`)].join('\r\n') + '\r\n'

  it('is accepted, with a warning naming both columns, and the desk columns still read', () => {
    const v = validateRoster(repeatSheet([row(), '', 'Stage']))
    expect(v.fatal).toBeNull()
    expect(v.errors).toEqual([])
    expect(v.rows[0]).toMatchObject({ type_code: 'stage', crewType: 'Security' })
    expect(v.warnings.join('\n')).toMatch(/second "Crew type" column \(I\).*Both E and I are read/)
  })

  it('takes the answer from whichever copy holds it, so nothing is lost', () => {
    const v = validateRoster(repeatSheet([row(), '', 'Crew'], [row({ 'Crew type': '', 'WhatsApp number': '9876543211' }), 'Bar Crew', '']))
    expect(v.errors).toEqual([])
    expect(v.rows.map((r) => r.crewType)).toEqual(['Security', 'Bar Crew'])
    expect(v.rows.map((r) => r.type_code)).toEqual(['crew', null])
  })

  it('refuses a row with an answer in both copies rather than pick one', () => {
    const v = validateRoster(repeatSheet([row(), 'Bar Crew', 'Stage']))
    expect(v.rows).toEqual([])
    expect(v.errors[0]?.errors).toEqual(['Crew type has an answer in both E and I; clear the wrong one in the sheet'])
  })

  it('a repeat is only an exact form title — Timestamp, or an unknown column, is still refused', () => {
    for (const bad of ['Timestamp', 'crew type', 'Aadhaar']) {
      const csv = [`${HEADER},${bad},${DESK_HEADER}`, `${row()},,Stage`].join('\n') + '\n'
      expect(validateRoster(csv).fatal, bad).toMatch(/Invalid header/)
    }
  })
})

describe('column I, Accreditation Type, is the approval (ACC-141)', () => {
  it('is accepted as the one extra column, to the right of the form\'s', () => {
    const v = validateRoster(deskSheet([row(), 'Stage']))
    expect(v.fatal).toBeNull()
    expect(v.rows).toHaveLength(1)
  })

  it('its header is typed by hand, so case and surrounding space do not matter', () => {
    for (const typed of ['Accreditation Type', 'ACCREDITATION TYPE', ' accreditation type ']) {
      const csv = deskSheet([row(), 'Stage']).replace(DESK_HEADER, typed)
      expect(validateRoster(csv).fatal, typed).toBeNull()
    }
    // but a different word is still a different column
    expect(validateRoster(deskSheet([row(), 'Stage']).replace(DESK_HEADER, 'Accreditation')).fatal).toMatch(/Invalid header/)
  })

  it('no other extra column is accepted — unknown columns are still refused', () => {
    expect(validateRoster(sheet(row()).replace(HEADER, `${HEADER},Aadhaar`)).fatal).toMatch(/Invalid header/)
    const twoExtra = [`${HEADER},${DESK_HEADER},Notes`, `${row()},Stage,x`].join('\n') + '\n'
    expect(validateRoster(twoExtra).fatal).toMatch(/Invalid header/)
    // and it must be on the right, not between form columns
    const between = sheet(row()).replace('Crew type', `${DESK_HEADER},Crew type`)
    expect(validateRoster(between).fatal).toMatch(/Invalid header/)
  })

  it('a filled cell becomes the row\'s type_code, with the days answer as its day_validity', () => {
    const v = validateRoster(deskSheet([row({ 'Days on site': 'Both build and show' }), 'Stage']))
    expect(v.rows[0]).toMatchObject({ type_code: 'stage', day_validity: 'build_show' })
    expect(v.undecided).toEqual([])
  })

  it('the crew type never sets the tier: same crew type, different column I, different tier', () => {
    const v = validateRoster(
      deskSheet(
        [row({ 'Crew type': 'Bar Crew' }), 'Crew'],
        [row({ 'Crew type': 'Bar Crew', 'WhatsApp number': '9876543211' }), 'Promoters Lounge'],
        [row({ 'Crew type': 'Bar Crew', 'WhatsApp number': '9876543212' }), ''],
      ),
    )
    expect(v.rows.map((r) => r.type_code)).toEqual(['crew', 'promoters_lounge', null])
  })

  it('a blank cell is undecided: no tier, imported as submitted, and listed for Salman', () => {
    const v = validateRoster(
      deskSheet([row(), ''], [row({ 'WhatsApp number': '9876543211' }), 'Crew'], [row({ 'WhatsApp number': '9876543212' }), '  ']),
    )
    expect(v.rows.map((r) => r.type_code)).toEqual([null, 'crew', null])
    expect(v.undecided).toEqual([2, 4])
    expect(v.warnings.join('\n')).toMatch(/2 row\(s\) have no Accreditation type: they import as submitted, for Salman to decide \(rows 2, 4\)/)
  })

  it('AAA and Artist are decisions too (ACC-140b): they travel as type_code, the database records the nomination', () => {
    const v = validateRoster(deskSheet([row(), 'AAA'], [row({ 'WhatsApp number': '9876543211' }), 'Artist']))
    expect(v.errors).toEqual([])
    expect(v.rows.map((r) => r.type_code)).toEqual(['aaa', 'artist'])
    for (const p of toRpcPayload(v.rows)) expect(importRowSchema.safeParse(p).success).toBe(true)
  })

  it('refuses a value that is not exactly one of the labels, by row — General Admission and a curly apostrophe included', () => {
    const v = validateRoster(
      deskSheet(
        [row(), 'General Admission'],
        [row({ 'WhatsApp number': '9876543211' }), 'Eddie’s Lounge'],
        [row({ 'WhatsApp number': '9876543212' }), 'stage'],
        [row({ 'WhatsApp number': '9876543213' }), "Eddie's Lounge"],
      ),
    )
    expect(v.errors.map((e) => e.row_no)).toEqual([2, 3, 4])
    expect(v.errors[0]!.errors.join()).toMatch(/Accreditation type "General Admission" is not one of the desk's choices/)
    expect(v.rows.map((r) => r.type_code)).toEqual(['eddies_lounge'])
  })

  it('a desk-column sheet expects nine cells per row', () => {
    const v = validateRoster(`${HEADER},${DESK_HEADER}\n${row()}\n`)
    expect(v.errors[0]!.errors).toEqual(['expected 9 columns, received 8'])
  })
})

describe('field rules', () => {
  it('reads the US-locale timestamp as Asia/Kolkata with an explicit offset', () => {
    expect(parseFormTimestamp('9/21/2026 14:03:05')).toBe('2026-09-21T14:03:05+05:30')
    expect(parseFormTimestamp('10/1/2026 9:05:00')).toBe('2026-10-01T09:05:00+05:30')
    expect(new Date(parseFormTimestamp('9/21/2026 14:03:05')!).toISOString()).toBe('2026-09-21T08:33:05.000Z')
    expect(parseFormTimestamp('2/30/2026 10:00:00')).toBeNull()
    expect(parseFormTimestamp('21/9/2026 10:00:00')).toBeNull() // day-first is not the sheet's locale
    expect(parseFormTimestamp('2026-09-21 10:00:00')).toBeNull()
  })

  it('reads the phone as a string and adds +91; never repairs a bad one', () => {
    expect(normalisePhone('9876543210')).toBe('+919876543210')
    expect(normalisePhone(' 98765 43210 ')).toBe('+919876543210')
    expect(normalisePhone('+919876543210')).toBe('+919876543210')
    expect(normalisePhone('5876543210')).toBeNull()
    expect(normalisePhone('9.87654321E9')).toBeNull() // what a spreadsheet round-trip produces
    expect(normalisePhone('987654321')).toBeNull()
  })

  it('reads international numbers (ACC-195): +, 00, or bare digits with the country code', () => {
    expect(normalisePhone('+971 50 123 4567')).toBe('+971501234567')
    expect(normalisePhone('00971501234567')).toBe('+971501234567')
    expect(normalisePhone('971501234567')).toBe('+971501234567') // row 32 of the live sheet
    expect(normalisePhone('+44 (7911) 123456')).toBe('+447911123456')
    expect(normalisePhone('12125551234')).toBe('+12125551234')
  })

  it('still refuses what is ambiguous or wrong', () => {
    expect(normalisePhone('2125551234')).toBeNull() // 10 digits, not Indian: a US number without +1
    expect(normalisePhone('+915876543210')).toBeNull() // +91 must be an Indian mobile
    expect(normalisePhone('+0501234567')).toBeNull()
    expect(normalisePhone('+97150')).toBeNull()
    expect(normalisePhone('9715012345678901')).toBeNull() // 16 digits
  })

  it('upper-cases the plate, removes spaces, checks the database pattern', () => {
    expect(normalisePlate('ka01 ab 1234')).toEqual({ ok: true, value: 'KA01AB1234' })
    expect(normalisePlate('   ')).toEqual({ ok: true, value: null })
    expect(normalisePlate('KA-01-AB-1234')).toEqual({ ok: false })
  })

  it('role text is the job title when given, otherwise the crew type', () => {
    const v = validateRoster(sheet(row({ 'Job title': 'Head rigger' }), row({ 'WhatsApp number': '9876543211' })))
    expect(v.rows.map((r) => r.role_text)).toEqual(['Head rigger', 'Security'])
  })

  it('refuses role text outside 2–60 characters instead of truncating it', () => {
    const longWriteIn = 'Temporary structure fabrication and scaffolding supervisors team'
    expect(longWriteIn.length).toBeGreaterThan(60)
    const v = validateRoster(
      sheet(row({ 'Crew type': longWriteIn }), row({ 'WhatsApp number': '9876543211', 'Job title': 'X' })),
    )
    expect(v.rows).toHaveLength(0)
    expect(v.errors[0]?.errors[0]).toMatch(/Crew type is used as the role and must be 2–60 characters/)
    expect(v.errors[1]?.errors[0]).toMatch(/Job title must be 2–60 characters/)
  })

  it('maps the three day answers one-to-one and refuses anything else', () => {
    const v = validateRoster(
      sheet(
        row({ 'Days on site': 'Build days only (5–9 Oct)', 'WhatsApp number': '9000000001' }),
        row({ 'Days on site': 'Show day only (10 Oct)', 'WhatsApp number': '9000000002' }),
        row({ 'Days on site': 'Both build and show', 'WhatsApp number': '9000000003' }),
        row({ 'Days on site': 'Weekend', 'WhatsApp number': '9000000004' }),
      ),
    )
    expect(v.rows.map((r) => r.day_validity)).toEqual(['build', 'show', 'build_show'])
    expect(v.errors[0]?.row_no).toBe(5)
  })

  it('collects every problem on a row, not just the first', () => {
    const v = validateRoster(sheet(row({ Timestamp: 'yesterday', 'WhatsApp number': '12', 'Full name': 'A' })))
    expect(v.errors[0]?.errors).toHaveLength(3)
  })
})

describe('crew-type write-ins (ACC-143)', () => {
  it('the live sheet\'s write-ins: "(stage)" and "(Stage)" are one crew type', () => {
    expect(normaliseCrewType('Tech Production (stage)')).toBe('Tech Production (Stage)')
    expect(normaliseCrewType('Tech Production (Stage)')).toBe('Tech Production (Stage)')
    expect(normaliseCrewType('  Tech   Production (stage) ')).toBe('Tech Production (Stage)')
    expect(normaliseCrewType('Artist Logistics')).toBe('Artist Logistics')
    expect(normaliseCrewType('artist logistics')).toBe('Artist Logistics')
  })

  it('a fixed choice in any case becomes the form\'s own spelling; letters are never lower-cased', () => {
    expect(normaliseCrewType(' bar   crew ')).toBe('Bar Crew')
    expect(normaliseCrewType('BOA internal crew')).toBe('BOA Internal Crew')
    expect(normaliseCrewType('sound & lights')).toBe('Sound & Lights')
    // the live form's hand-typed spelling since 2 Oct is the same fixed choice
    expect(normaliseCrewType('Family and Friends')).toBe('Family & Friends')
    expect(normaliseCrewType('DJ crew')).toBe('DJ Crew')
  })

  it('write-ins are grouped by their normalised spelling, and the role text uses it', () => {
    const v = validateRoster(
      deskSheet(
        [row({ 'Crew type': 'Tech Production (Stage)' }), 'Stage'],
        [row({ 'Crew type': 'Tech Production (stage)', 'WhatsApp number': '9876543211' }), ''],
        [row({ 'Crew type': 'Artist Logistics', 'WhatsApp number': '9876543212' }), 'Crew'],
        [row({ 'Crew type': 'Security', 'WhatsApp number': '9876543213' }), 'Crew'],
      ),
    )
    expect([...v.writeIns]).toEqual([
      ['Tech Production (Stage)', [2, 3]],
      ['Artist Logistics', [4]],
    ])
    expect(v.rows.map((r) => [r.crewType, r.writeIn, r.role_text])).toEqual([
      ['Tech Production (Stage)', true, 'Tech Production (Stage)'],
      ['Tech Production (Stage)', true, 'Tech Production (Stage)'],
      ['Artist Logistics', true, 'Artist Logistics'],
      ['Security', false, 'Security'],
    ])
    expect(v.warnings.join('\n')).toMatch(/Write-in crew types, for display only — they never set a tier: Artist Logistics \(rows 4\); Tech Production \(Stage\) \(rows 2, 3\)/)
  })

  it('a write-in never affects the tier: column I decides, blank stays undecided', () => {
    const v = validateRoster(
      deskSheet(
        [row({ 'Crew type': 'Tech Production (stage)' }), ''],
        [row({ 'Crew type': 'Tech Production (Stage)', 'WhatsApp number': '9876543211' }), 'Photo'],
      ),
    )
    expect(v.rows.map((r) => r.type_code)).toEqual([null, 'photo'])
    expect(v.undecided).toEqual([2])
  })
})

describe('organisations: aliases and matching (ACC-142)', () => {
  const committed = parseOrgAliases(
    JSON.parse(readFileSync(new URL('../../data/org-aliases.json', import.meta.url), 'utf8')),
  )

  it('the committed alias map sends the live sheet\'s variants to "Bangalore Open Air"', () => {
    for (const typed of ['Banglore Open Air', 'Bangalore open air', '  banglore   open air ']) {
      expect(resolveOrganisation(typed, committed).name, typed).toBe('Bangalore Open Air')
    }
    expect(resolveOrganisation('Bangalore Open Air', committed)).toEqual({ name: 'Bangalore Open Air', aliased: false })
    expect(resolveOrganisation('Nobody Ltd', committed)).toEqual({ name: 'Nobody Ltd', aliased: false })
  })

  it('matches through the alias map, reports the aliased rows, and reports the unmatched by row — never guessed', () => {
    const v = validateRoster(
      sheet(
        row({ Organisation: 'Bangalore Open Air' }),
        row({ Organisation: 'Banglore Open Air', 'WhatsApp number': '9876543211' }),
        row({ Organisation: 'Bangalore open air', 'WhatsApp number': '9876543212' }),
        row({ Organisation: 'Bangalor Open Air', 'WhatsApp number': '9876543213' }),
        row({ Organisation: '  f5   events ', 'WhatsApp number': '9876543214' }),
      ),
    )
    const orgs = [
      { id: 'boa', name: 'Bangalore Open Air' },
      { id: 'f5', name: 'F5 Events' },
    ]
    const m = matchOrganisations(v.rows, orgs, committed)
    expect(m.groups.map((g) => [g.org.id, g.rows.map((r) => r.row_no)])).toEqual([
      ['boa', [2, 3, 4]],
      ['f5', [6]],
    ])
    expect(m.aliased).toEqual([
      { row_no: 3, from: 'Banglore Open Air', to: 'Bangalore Open Air' },
      { row_no: 4, from: 'Bangalore open air', to: 'Bangalore Open Air' },
    ])
    expect([...m.unmatched]).toEqual([['Bangalor Open Air', [5]]])
  })

  it('an alias to an org that does not exist yet is reported as unmatched, not created', () => {
    const v = validateRoster(sheet(row({ Organisation: 'Banglore Open Air' })))
    const m = matchOrganisations(v.rows, [{ id: 'f5', name: 'F5 Events' }], committed)
    expect(m.groups).toEqual([])
    expect([...m.unmatched]).toEqual([['Banglore Open Air', [2]]])
  })

  it('the alias file refuses chains, conflicts and extra fields', () => {
    expect(() => parseOrgAliases({ source: 'x', aliases: { A1: 'B Org', 'b org': 'C Org' } })).toThrow(/chain/)
    expect(() => parseOrgAliases({ source: 'x', aliases: { 'Abc Org': 'X Org', 'abc  org': 'Y Org' } })).toThrow(/maps to both/)
    expect(() => parseOrgAliases({ source: 'x', aliases: {}, extra: 1 })).toThrow()
  })

  it('keeps the first of a phone repeated anywhere in the sheet, whatever organisation it names', () => {
    const v = validateRoster(sheet(row(), row({ 'Full name': 'Ravi K', Organisation: 'Other Org' })))
    expect(v.rows).toHaveLength(1)
    expect(v.rows[0]?.row_no).toBe(2)
    expect(v.duplicates).toEqual([{ row_no: 3, organisation: 'Other Org', duplicate_of: 2 }])
    expect(v.errors).toEqual([])
    expect(v.warnings.join('\n')).toMatch(/row 3 = row 2/)
  })
})

describe('the 500-row fixture', () => {
  const crew = [...FORM_CREW_TYPES]
  const days = Object.keys(DAYS_ANSWERS)
  const labels = Object.keys(DESK_TIERS)
  const rows: [string, string][] = Array.from({ length: 500 }, (_, i) => [
    row({
      Timestamp: `9/${(i % 9) + 21}/2026 ${i % 24}:${String(i % 60).padStart(2, '0')}:07`,
      Organisation: 'F5 Events',
      'Full name': `Crew Member ${i + 1}`,
      'WhatsApp number': String(9_000_000_000 + i),
      'Crew type': crew[i % crew.length]!,
      'Job title': i % 3 === 0 ? `Shift lead ${i}` : '',
      'Days on site': days[i % days.length]!,
      'Loading vehicle registration': i % 50 === 0 ? `ka 0${i % 9 + 1} ab ${1000 + i}` : '',
    }),
    i % 4 === 0 ? '' : labels[i % labels.length]!,
  ])
  const v = validateRoster(deskSheet(...rows))

  it('validates all 500 with no refusals and no duplicate warnings', () => {
    expect(v.fatal).toBeNull()
    expect(v.errors).toEqual([])
    expect(v.rows).toHaveLength(500)
    expect(v.undecided).toHaveLength(125)
    expect(v.warnings.filter((w) => /same phone/.test(w))).toEqual([])
  })

  it('becomes ONE payload of 500 rows for one organisation, every row schema-valid', () => {
    const { groups, unmatched } = matchOrganisations(v.rows, [{ id: 'f5', name: 'F5 Events' }])
    expect(unmatched.size).toBe(0)
    expect(groups).toHaveLength(1)
    const payload = toRpcPayload(groups[0]!.rows)
    expect(payload).toHaveLength(500)
    expect(payload.every((p) => importRowSchema.safeParse(p).success)).toBe(true)
    expect(payload[0]).toEqual({
      row_no: 2,
      full_name: 'Crew Member 1',
      phone: '+919000000000',
      role_text: 'Shift lead 0',
      vehicle_reg: 'KA01AB1000',
      type_code: null,
      day_validity: 'build',
      tshirt_size: null,
      submitted_at: '2026-09-21T00:00:07+05:30',
    })
    expect(payload[1]?.type_code).toBe('artist')
    // Nothing beyond the RPC's fields leaves this module: no crew type, no org name.
    expect(Object.keys(payload[0]!).sort()).toEqual(
      ['day_validity', 'full_name', 'phone', 'role_text', 'row_no', 'submitted_at', 'tshirt_size', 'type_code', 'vehicle_reg'],
    )
  })

  it('the loader\'s SQL calls boa_acc_import_approve as the operator, with the payload as one literal', () => {
    const payload = toRpcPayload(v.rows.slice(0, 2))
    const sql = importApproveSql('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', payload)
    expect(sql).toMatch(/public\.boa_acc_import_approve\('00000000-0000-4000-8000-000000000002'::uuid, '\[/)
    expect(sql).toMatch(/'sub', '00000000-0000-4000-8000-000000000001'/)
    expect(() => importApproveSql('not-a-uuid', '00000000-0000-4000-8000-000000000002', payload)).toThrow()
  })
})

describe('pinned to the form, the pack and the migration', () => {
  const gs = readFileSync(new URL('../../scripts/roster-form/build-roster-form.gs', import.meta.url), 'utf8')
  const ctx: Record<string, unknown> = {}
  runInNewContext(gs, ctx)

  it('the header is the form\'s question titles, in order, after Timestamp', () => {
    const q = ctx['Q'] as Record<string, string>
    expect(ROSTER_HEADER).toEqual([
      'Timestamp', q['ORG'], q['NAME'], q['PHONE'], q['CREW_TYPE'], q['JOB'], q['DAYS'], q['VEHICLE'],
    ])
  })

  it('crew types and day answers are exactly the form\'s choices', () => {
    expect([...FORM_CREW_TYPES]).toEqual(ctx['CREW_TYPES'])
    expect(Object.keys(DAYS_ANSWERS)).toEqual(ctx['DAYS'])
  })

  it('the desk column\'s choices are the pack\'s tier labels, minus General Admission', () => {
    for (const [label, code] of Object.entries(DESK_TIERS)) {
      expect(TIERS.find((t) => t.code === code)?.label, label).toBe(label)
    }
    expect(Object.values(DESK_TIERS)).not.toContain('general_admission')
    expect(Object.keys(DESK_TIERS)).toHaveLength(TIERS.length - 1)
    expect([...DESK_TIER_CODES].sort()).toEqual(Object.values(DESK_TIERS).sort())
  })

  it('the payload fields are exactly the fields boa_acc_import_approve reads', () => {
    const read = [...new Set([...migration.matchAll(/v_row ->> '(\w+)'/g)].map((m) => m[1]))].sort()
    expect(read).toEqual(Object.keys(importRowSchema.shape).sort())
  })

  it('the result outcomes are exactly the outcomes boa_acc_import_approve returns', () => {
    const returned = [...new Set([...migration.matchAll(/outcome\s*:=\s*'(\w+)'/g)].map((m) => m[1]))].sort()
    expect(returned).toEqual([...IMPORT_OUTCOMES].sort())
  })
})

describe('ACC-194 · loose organisation matching and new organisations', () => {
  const um = (...pairs: [string, number[]][]) => new Map(pairs)

  it('the loose key forgives case, punctuation, "&", a leading The and a trailing Pvt Ltd', () => {
    expect(orgLooseKey('The F5 Events Pvt. Ltd.')).toBe(orgLooseKey('f5 events'))
    expect(orgLooseKey('Rock & Roll Sound')).toBe(orgLooseKey('rock and roll sound'))
    expect(orgLooseKey('Café  Blue')).toBe(orgLooseKey('cafe blue'))
    expect(orgLooseKey('Ltd')).toBe('ltd') // never strips the only word
  })

  it('merges punctuation and case differences into the existing org', () => {
    const r = reconcileOrganisations(um(['F5 Events.', [2]], ['the f5 events pvt ltd', [3]]), ['F5 Events'])
    expect(r.merges).toEqual([
      { from: 'F5 Events.', to: 'F5 Events', row_nos: [2], how: 'punctuation' },
      { from: 'the f5 events pvt ltd', to: 'F5 Events', row_nos: [3], how: 'punctuation' },
    ])
    expect(r.creations).toEqual([])
  })

  it('merges one typo in a long name, and reports it as a typo', () => {
    const r = reconcileOrganisations(um(['Bangalor Open Air', [5]]), ['Bangalore Open Air'])
    expect(r.merges).toEqual([{ from: 'Bangalor Open Air', to: 'Bangalore Open Air', row_nos: [5], how: 'typo' }])
  })

  it('never merges short names or names that differ in a digit; they become new orgs', () => {
    const r = reconcileOrganisations(um(['Stage B', [2]], ['Sound Crew 13', [3]]), ['Stage A', 'Sound Crew 12'])
    expect(r.merges).toEqual([])
    expect(r.creations.map((c) => c.name)).toEqual(['Stage B', 'Sound Crew 13'])
  })

  it('refuses, and does not guess, when a typo is equally close to two orgs', () => {
    const r = reconcileOrganisations(um(['Moonrise Stagecraftx', [4]]), ['Moonrise Stagecrafts', 'Moonrise Stagecraftz'])
    expect(r.merges).toEqual([])
    expect(r.creations).toEqual([])
    expect(r.refused).toHaveLength(1)
    expect(r.refused[0]?.why).toMatch(/could be/)
  })

  it('a name that resembles nothing becomes one new org, spellings collapsed to the most used', () => {
    const r = reconcileOrganisations(
      um(['reflections of darkness', [35]], ['Reflections Of Darkness', [36, 40]], ['Reflection of Darkness', [41]]),
      ['Bangalore Open Air'],
    )
    expect(r.creations).toEqual([
      {
        name: 'Reflections Of Darkness',
        row_nos: [35, 36, 40, 41],
        spellings: ['Reflections Of Darkness', 'reflections of darkness', 'Reflection of Darkness'],
      },
    ])
    expect(r.merges).toEqual([])
  })

  it('refuses a name with no letters or digits in it', () => {
    const r = reconcileOrganisations(um(['—', [2]], ['?', [3]]), ['F5 Events'])
    expect(r.refused.map((x) => x.name)).toEqual(['—', '?'])
    expect(r.creations).toEqual([])
  })

  it('cleans a new name: quotes and punctuation off, lower case capitalised, other case kept', () => {
    expect(cleanOrgName('  "reflections of darkness". ')).toBe('Reflections of Darkness')
    expect(cleanOrgName('F5   events')).toBe('F5 events')
    expect(cleanOrgName('ABC Sound')).toBe('ABC Sound')
  })
})

describe('ACC-197 · the T-shirt columns (J and K)', () => {
  const tshirtSheet = (...rows: [string, string, string, string][]) =>
    [`${HEADER},${DESK_HEADER},T-Shirt,T-Shirt Size`, ...rows.map(([r, ...c]) => `${r},${c.map(csvCell).join(',')}`)].join('\r\n') + '\r\n'

  it('Yes + a size becomes tshirt_size; blank means none', () => {
    const v = validateRoster(
      tshirtSheet(
        [row(), 'Crew', 'Yes', 'L'],
        [row({ 'Full name': 'Asha Rao', 'WhatsApp number': '9876543211' }), 'Crew', '', ''],
      ),
    )
    expect(v.errors).toEqual([])
    expect(v.rows.map((r) => r.tshirt_size)).toEqual(['L', null])
  })

  it('reads yes/size case-insensitively', () => {
    const v = validateRoster(tshirtSheet([row(), 'Crew', ' yes ', 'xxl']))
    expect(v.rows[0]?.tshirt_size).toBe('XXL')
  })

  it('refuses a half-filled pair rather than guessing', () => {
    const noSize = validateRoster(tshirtSheet([row(), 'Crew', 'Yes', '']))
    expect(noSize.errors[0]?.errors.join()).toMatch(/Yes but T-Shirt Size is blank/)
    const noYes = validateRoster(tshirtSheet([row(), 'Crew', '', 'M']))
    expect(noYes.errors[0]?.errors.join()).toMatch(/set but T-Shirt is not Yes/)
    const badSize = validateRoster(tshirtSheet([row(), 'Crew', 'Yes', '4XL']))
    expect(badSize.errors[0]?.errors.join()).toMatch(/not one of S, M, L, XL, XXL, 3XL/)
    const badYes = validateRoster(tshirtSheet([row(), 'Crew', 'Maybe', '']))
    expect(badYes.errors[0]?.errors.join()).toMatch(/must be Yes or blank/)
  })

  it('a sheet without J and K still imports, with no shirts', () => {
    expect(validateRoster(deskSheet([row(), 'Crew'])).rows[0]?.tshirt_size).toBeNull()
  })

  it('J without K, or K before J, is not a valid header', () => {
    const jOnly = [`${HEADER},${DESK_HEADER},T-Shirt`, `${row()},Crew,Yes`].join('\n') + '\n'
    expect(validateRoster(jOnly).fatal).toMatch(/Invalid header/)
    const swapped = [`${HEADER},${DESK_HEADER},T-Shirt Size,T-Shirt`, `${row()},Crew,L,Yes`].join('\n') + '\n'
    expect(validateRoster(swapped).fatal).toMatch(/Invalid header/)
  })

  it('the RPC payload carries it, and the migration never touches the holder\'s pass view', () => {
    const v = validateRoster(tshirtSheet([row(), 'Crew', 'Yes', 'M']))
    expect(toRpcPayload(v.rows)[0]?.tshirt_size).toBe('M')
    const mig = readFileSync(new URL('../../supabase/migrations/202609301000_boa_acc_crew_tshirt.sql', import.meta.url), 'utf8')
    expect(mig).not.toMatch(/create (or replace )?function public\.boa_acc_pass_view/)
    const passView = readFileSync(new URL('../../supabase/migrations/202609221400_boa_acc_pass_view.sql', import.meta.url), 'utf8')
    expect(passView).not.toMatch(/tshirt/i)
  })
})
