/**
 * ACC-117 · lib/roster-import.ts — the roster form's response sheet, parsed
 * and validated offline, before anything reaches boa_acc_import_roster.
 *
 * It also pins the three lists this module must agree with — the form's
 * questions and answers (build-roster-form.gs), the requestable tiers
 * (lib/design.ts), and the jsonb fields the RPC reads (the migration) — so a
 * change in one place fails here instead of at import time.
 *
 * It cannot prove the database's decisions (quota, duplicates, no pass):
 * supabase/tests/import-roster.test.sql does that.
 */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { TIERS } from '@/lib/design'
import {
  DAYS_ANSWERS,
  DESK_HEADER,
  DESK_TIERS,
  FORM_CREW_TYPES,
  REQUESTABLE_TIERS,
  ROSTER_HEADER,
  crewTypeMappingSchema,
  importRowSchema,
  matchOrganisations,
  normalisePhone,
  normalisePlate,
  parseFormTimestamp,
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
})

/** The same sheet with the desk's column on the right; `desk` fills it per row. */
const deskSheet = (...rows: [string, string][]) =>
  [`${HEADER},${DESK_HEADER}`, ...rows.map(([r, desk]) => `${r},${csvCell(desk)}`)].join('\r\n') + '\r\n'

describe('the desk\'s Accreditation type column', () => {
  it('is accepted as the one extra column, to the right of the form\'s', () => {
    const v = validateRoster(deskSheet([row(), 'Stage']))
    expect(v.fatal).toBeNull()
    expect(v.rows).toHaveLength(1)
  })

  it('no other extra column is accepted — unknown columns are still refused', () => {
    expect(validateRoster(sheet(row()).replace(HEADER, `${HEADER},Aadhaar`)).fatal).toMatch(/Invalid header/)
    const twoExtra = [`${HEADER},${DESK_HEADER},Notes`, `${row()},Stage,x`].join('\n') + '\n'
    expect(validateRoster(twoExtra).fatal).toMatch(/Invalid header/)
    // and it must be on the right, not between form columns
    const between = sheet(row()).replace('Crew type', `${DESK_HEADER},Crew type`)
    expect(validateRoster(between).fatal).toMatch(/Invalid header/)
  })

  it('the desk\'s decision becomes the tier hint, winning over the crew-type mapping', () => {
    const mapping = crewTypeMappingSchema.parse({ mapping: { Security: 'crew' } })
    const v = validateRoster(deskSheet([row({ 'Crew type': 'Security' }), 'Stage']), mapping)
    expect(v.rows[0]).toMatchObject({ requested_type_code: 'stage', deskTier: 'stage' })
  })

  it('a blank desk cell means undecided: it falls back to the mapping, never a default tier', () => {
    const mapping = crewTypeMappingSchema.parse({ mapping: { Security: 'crew' } })
    const v = validateRoster(deskSheet([row({ 'Crew type': 'Security' }), ''], [row({ 'Crew type': 'Bouncer', 'WhatsApp number': '9876543211' }), '']), mapping)
    expect(v.rows.map((r) => [r.deskTier, r.requested_type_code])).toEqual([[null, 'crew'], [null, null]])
  })

  it('AAA and Artist import with no hint and are reported, because they need a nomination', () => {
    const v = validateRoster(deskSheet([row(), 'AAA'], [row({ 'WhatsApp number': '9876543211' }), 'Artist']))
    expect(v.errors).toEqual([])
    expect(v.rows.map((r) => [r.deskTier, r.requested_type_code])).toEqual([['aaa', null], ['artist', null]])
    expect(v.warnings.join('\n')).toMatch(/2 row\(s\) marked AAA or Artist .*rows 2, 3.*nomination/)
    // and each still becomes a payload row the RPC accepts (no AAA/Artist hint in it)
    const fields = Object.keys(importRowSchema.shape) as (keyof typeof importRowSchema.shape)[]
    for (const r of v.rows) {
      const payload = Object.fromEntries(fields.map((k) => [k, r[k]]))
      expect(importRowSchema.safeParse(payload).success).toBe(true)
      expect(payload['requested_type_code']).toBeNull()
    }
  })

  it('refuses a desk value that is not one of its choices, by row', () => {
    const v = validateRoster(deskSheet([row(), 'General Admission']))
    expect(v.rows).toHaveLength(0)
    expect(v.errors[0]!.errors.join()).toMatch(/Accreditation type "General Admission" is not one of the desk's choices/)
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
    expect(v.rows.map((r) => r.requested_day_validity)).toEqual(['build', 'show', 'build_show'])
    expect(v.errors[0]?.row_no).toBe(5)
  })

  it('collects every problem on a row, not just the first', () => {
    const v = validateRoster(sheet(row({ Timestamp: 'yesterday', 'WhatsApp number': '12', 'Full name': 'A' })))
    expect(v.errors[0]?.errors).toHaveLength(3)
  })
})

describe('crew type → tier hint', () => {
  it('the committed mapping file is empty, so no row carries a hint', () => {
    const committed = crewTypeMappingSchema.parse(
      JSON.parse(readFileSync(new URL('../../data/crew-type-tiers.json', import.meta.url), 'utf8')),
    )
    expect(committed.mapping).toEqual({})
    const v = validateRoster(sheet(row()), committed)
    expect(v.rows[0]?.requested_type_code).toBeNull()
    expect(v.warnings.join('\n')).toMatch(/no tier mapping.*Security/)
  })

  it('a mapped crew type gets its hint; a write-in gets none and is flagged', () => {
    const mapping = crewTypeMappingSchema.parse({ mapping: { security: 'crew' } })
    const v = validateRoster(
      sheet(row(), row({ 'Crew type': 'Drone operator', 'WhatsApp number': '9876543211' })),
      mapping,
    )
    expect(v.rows.map((r) => [r.requested_type_code, r.writeIn])).toEqual([
      ['crew', false],
      [null, true],
    ])
  })

  it('the mapping may only name a tier a vendor can request', () => {
    expect(crewTypeMappingSchema.safeParse({ mapping: { Security: 'aaa' } }).success).toBe(false)
    expect(crewTypeMappingSchema.safeParse({ mapping: { Security: 'artist' } }).success).toBe(false)
    expect(crewTypeMappingSchema.safeParse({ mapping: { Security: 'stage' } }).success).toBe(true)
  })
})

describe('organisations and duplicates', () => {
  it('matches organisation names case- and space-insensitively and reports the unmatched', () => {
    const v = validateRoster(
      sheet(
        row({ Organisation: '  f5   events ' }),
        row({ Organisation: 'Nobody Ltd', 'WhatsApp number': '9876543211' }),
      ),
    )
    const m = matchOrganisations(v.rows, [{ id: 'org-1', name: 'F5 Events' }])
    expect(m.groups.map((g) => [g.org.id, g.rows.length])).toEqual([['org-1', 1]])
    expect([...m.unmatched]).toEqual([['Nobody Ltd', [3]]])
  })

  it('flags a phone repeated within one organisation; the database refuses it', () => {
    const v = validateRoster(sheet(row(), row({ 'Full name': 'Ravi K' })))
    expect(v.rows).toHaveLength(2)
    expect(v.warnings[0]).toMatch(/row 3: same organisation and phone as row 2/)
  })
})

describe('the 500-row fixture', () => {
  const crew = [...FORM_CREW_TYPES]
  const days = Object.keys(DAYS_ANSWERS)
  const rows = Array.from({ length: 500 }, (_, i) =>
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
  )
  const v = validateRoster(sheet(...rows))

  it('validates all 500 with no refusals and no duplicate warnings', () => {
    expect(v.fatal).toBeNull()
    expect(v.errors).toEqual([])
    expect(v.rows).toHaveLength(500)
    expect(v.warnings.filter((w) => /same organisation/.test(w))).toEqual([])
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
      requested_type_code: null,
      requested_day_validity: 'build',
      submitted_at: '2026-09-21T00:00:07+05:30',
    })
    // Nothing beyond the RPC's fields leaves this module: no crew type, no org name.
    expect(Object.keys(payload[0]!).sort()).toEqual(
      ['full_name', 'phone', 'requested_day_validity', 'requested_type_code', 'role_text', 'row_no', 'submitted_at', 'vehicle_reg'],
    )
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

  it('the desk column and its choices are exactly the form script\'s', () => {
    expect(DESK_HEADER).toBe(ctx['DESK_COLUMN'])
    expect(Object.keys(DESK_TIERS)).toEqual(ctx['ACCREDITATION_TYPES'])
    // every desk choice is a real tier, with the pack's label, and GA is not one
    for (const [label, code] of Object.entries(DESK_TIERS)) {
      expect(TIERS.find((t) => t.code === code)?.label, label).toBe(label)
    }
    expect(Object.values(DESK_TIERS)).not.toContain('general_admission')
  })

  it('requestable tiers are exactly lib/design.ts\'s requestable tiers', () => {
    expect([...REQUESTABLE_TIERS].sort()).toEqual(TIERS.filter((t) => t.requestable).map((t) => t.code).sort())
  })

  it('the payload fields are exactly the fields boa_acc_import_roster reads', () => {
    const sql = readFileSync(
      new URL('../../supabase/migrations/202609211100_boa_acc_import_roster.sql', import.meta.url),
      'utf8',
    )
    const read = [...new Set([...sql.matchAll(/v_row ->> '(\w+)'/g)].map((m) => m[1]))].sort()
    expect(read).toEqual(Object.keys(importRowSchema.shape).sort())
  })
})
