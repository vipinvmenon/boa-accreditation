import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase-server'
import {
  masterQuerySchema,
  masterResponseSchema,
  type MasterRow,
} from '@/lib/schemas/master'
import { ORG_KINDS, ORG_TYPE_CODES } from '@/lib/schemas/org'
import { MASTER_DAY_LABELS, matchesMasterFilters, matchesMasterSearch, parseMasterFilters } from '@/lib/master-filter'

export const dynamic = 'force-dynamic'

const personSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  full_name: z.string(),
  phone: z.string(),
  vehicle_reg: z.string().nullable(),
  role_text: z.string(),
  tshirt_size: z.enum(['S', 'M', 'L', 'XL', 'XXL', '3XL']).nullable(),
  day_validity: z.enum(['build', 'show', 'build_show']).nullable(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'voided']),
  type_code: z.enum(ORG_TYPE_CODES).nullable(),
  pass_ref: z.string().nullable(),
  in_bms: z.boolean(),
  approved_at: z.string().nullable(),
  updated_at: z.string(),
})

const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ORG_KINDS),
})

const handoverSchema = z.object({
  person_id: z.string(),
  occurred_at: z.string(),
})

const checkinSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  band_serial: z.string().nullable(),
  sticker_no: z.string().nullable(),
  occurred_at: z.string(),
  gate_label: z.string(),
  voids_checkin_id: z.string().nullable(),
})

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows: MasterRow[]): string {
  const header = ['Name', 'Phone', 'Organisation', 'Role', 'Type', 'Days', 'Band', 'Vehicle', 'BMS', 'Collected', 'Gate', 'T-shirt', 'T-shirt given']
  const body = rows.map((row) => [
    row.fullName,
    row.phone,
    row.orgName,
    row.role,
    row.typeCode ?? '',
    row.dayValidity ? MASTER_DAY_LABELS[row.dayValidity] : '',
    row.bandSerial ?? (row.collectedAt ? 'Issued, no serial' : 'Not issued'),
    row.vehicleReg ?? '—',
    row.inBms ? 'In BMS' : 'Not in BMS',
    row.collectedAt ?? 'Not collected',
    row.gateLabel ?? '',
    row.tshirtSize ?? '',
    row.tshirtSize ? (row.tshirtGivenAt ?? 'Not given') : '',
  ].map(csvCell).join(','))
  return [header.map(csvCell).join(','), ...body].join('\n') + '\n'
}

export async function GET(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('not_authenticated', 401)

  const params = new URL(request.url).searchParams
  const query = masterQuerySchema.safeParse({
    q: params.get('q') ?? '',
    format: params.get('format') ?? 'json',
    filters: parseMasterFilters(params),
  })
  if (!query.success) return errorResponse('invalid_query', 400)

  const [{ data: people, error: peopleError }, { data: orgs, error: orgsError }, { data: checkins, error: checkinsError }, { data: handovers, error: handoversError }] =
    await Promise.all([
      supabase
        .from('boa_acc_person')
        .select('id,org_id,full_name,phone,role_text,tshirt_size,day_validity,vehicle_reg,status,type_code,pass_ref,in_bms,approved_at,updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('boa_acc_org')
        .select('id,name,kind'),
      supabase
        .from('boa_acc_checkin')
        .select('id,person_id,kind,band_serial,sticker_no,occurred_at,gate_label,voids_checkin_id')
        .order('occurred_at', { ascending: true }),
      supabase
        .from('boa_acc_tshirt_handover')
        .select('person_id,occurred_at'),
    ])

  if (peopleError || orgsError || checkinsError || handoversError) {
    if ([peopleError, orgsError, checkinsError, handoversError].some((error) => error?.code === '42501')) {
      return errorResponse('not_authorized', 403)
    }
    return errorResponse('internal', 500)
  }

  const parsedPeople = z.array(personSchema).safeParse(people)
  const parsedOrgs = z.array(orgSchema).safeParse(orgs)
  const parsedCheckins = z.array(checkinSchema).safeParse(checkins)
  const parsedHandovers = z.array(handoverSchema).safeParse(handovers)
  if (!parsedPeople.success || !parsedOrgs.success || !parsedCheckins.success || !parsedHandovers.success) {
    return errorResponse('internal', 500)
  }

  const shirtGivenAt = new Map(parsedHandovers.data.map((row) => [row.person_id, row.occurred_at]))
  const orgById = new Map(parsedOrgs.data.map((org) => [org.id, org]))
  const voidedIds = new Set(
    parsedCheckins.data
      .filter((checkin) => checkin.kind === 'void' && checkin.voids_checkin_id)
      .map((checkin) => checkin.voids_checkin_id as string),
  )
  const latestByPersonAndKind = new Map<string, z.infer<typeof checkinSchema>>()
  for (const checkin of parsedCheckins.data) {
    if (checkin.kind === 'void' || voidedIds.has(checkin.id)) continue
    const key = `${checkin.person_id}:${checkin.kind}`
    latestByPersonAndKind.set(key, checkin)
  }

  const everyone = parsedPeople.data.flatMap((person): MasterRow[] => {
    const org = orgById.get(person.org_id)
    if (!org) return []
    const band = latestByPersonAndKind.get(`${person.id}:wristband`)
    return [{
      id: person.id,
      fullName: person.full_name,
      orgId: org.id,
      phone: person.phone,
      orgName: org.name,
      role: person.role_text,
      tshirtSize: person.tshirt_size,
      tshirtGivenAt: person.tshirt_size ? shirtGivenAt.get(person.id) ?? null : null,
      dayValidity: person.day_validity,
      orgKind: org.kind,
      typeCode: person.type_code,
      status: person.status,
      passRef: person.pass_ref,
      vehicleReg: person.vehicle_reg,
      bandSerial: band?.band_serial ?? null,
      stickerNo: latestByPersonAndKind.get(`${person.id}:vehicle_sticker`)?.sticker_no ?? null,
      inBms: person.in_bms,
      collectedAt: band?.occurred_at ?? null,
      gateLabel: band?.gate_label ?? null,
      decidedAt: person.approved_at ?? (person.status === 'rejected' ? person.updated_at : null),
    }]
  })

  // ACC-162: the unfiltered population (a person whose org is missing is not a
  // row), so "N of M" cannot disagree with the list under it. The screen
  // filters in the browser and asks for everyone; the same predicate runs here
  // when `q` or a filter is passed, which is how the CSV matches the screen.
  const total = everyone.length
  const rows = everyone.filter((row) => matchesMasterSearch(row, query.data.q) && matchesMasterFilters(row, query.data.filters))

  const parsedResponse = masterResponseSchema.safeParse({ rows, total })
  if (!parsedResponse.success) return errorResponse('internal', 500)
  if (query.data.format === 'csv') {
    return new NextResponse(toCsv(parsedResponse.data.rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="boa-master-list.csv"',
      },
    })
  }
  return NextResponse.json(parsedResponse.data)
}
