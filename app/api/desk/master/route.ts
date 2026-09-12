import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase-server'
import {
  masterQuerySchema,
  masterResponseSchema,
  type MasterRow,
} from '@/lib/schemas/master'
import { ORG_KINDS, ORG_TYPE_CODES } from '@/lib/schemas/org'

export const dynamic = 'force-dynamic'

const personSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  full_name: z.string(),
  phone: z.string(),
  vehicle_reg: z.string().nullable(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'voided']),
  type_code: z.enum(ORG_TYPE_CODES).nullable(),
  pass_ref: z.string().nullable(),
  in_bms: z.boolean(),
})

const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ORG_KINDS),
})

const checkinSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  band_serial: z.string().nullable(),
  sticker_no: z.string().nullable(),
  occurred_at: z.string(),
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
  const header = ['Name', 'Phone', 'Organisation', 'Type', 'Band', 'Vehicle', 'BMS', 'Collected']
  const body = rows.map((row) => [
    row.fullName,
    row.phone,
    row.orgName,
    row.typeCode ?? '',
    row.bandSerial ?? 'Not issued',
    row.vehicleReg ?? '—',
    row.inBms ? 'In BMS' : 'Not in BMS',
    row.collectedAt ?? 'Not collected',
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
    inBms: params.get('in_bms') ?? 'all',
    format: params.get('format') ?? 'json',
  })
  if (!query.success) return errorResponse('invalid_query', 400)

  const [{ data: people, error: peopleError }, { data: orgs, error: orgsError }, { data: checkins, error: checkinsError }] =
    await Promise.all([
      supabase
        .from('boa_acc_person')
        .select('id,org_id,full_name,phone,vehicle_reg,status,type_code,pass_ref,in_bms')
        .order('created_at', { ascending: false }),
      supabase
        .from('boa_acc_org')
        .select('id,name,kind'),
      supabase
        .from('boa_acc_checkin')
        .select('id,person_id,kind,band_serial,sticker_no,occurred_at,voids_checkin_id')
        .order('occurred_at', { ascending: true }),
    ])

  if (peopleError || orgsError || checkinsError) {
    if ([peopleError, orgsError, checkinsError].some((error) => error?.code === '42501')) {
      return errorResponse('not_authorized', 403)
    }
    return errorResponse('internal', 500)
  }

  const parsedPeople = z.array(personSchema).safeParse(people)
  const parsedOrgs = z.array(orgSchema).safeParse(orgs)
  const parsedCheckins = z.array(checkinSchema).safeParse(checkins)
  if (!parsedPeople.success || !parsedOrgs.success || !parsedCheckins.success) {
    return errorResponse('internal', 500)
  }

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

  const needle = query.data.q.toLocaleLowerCase()
  const rows = parsedPeople.data.flatMap((person): MasterRow[] => {
    const org = orgById.get(person.org_id)
    if (!org) return []
    const band = latestByPersonAndKind.get(`${person.id}:wristband`)
    const matchesSearch = !needle || [
      person.full_name,
      person.phone,
      org.name,
      person.vehicle_reg ?? '',
      band?.band_serial ?? '',
      person.pass_ref ?? '',
    ].some((value) => value.toLocaleLowerCase().includes(needle))
    const matchesBms =
      query.data.inBms === 'all' ||
      (query.data.inBms === 'true' && person.in_bms) ||
      (query.data.inBms === 'false' && !person.in_bms)
    if (!matchesSearch || !matchesBms) return []
    return [{
      id: person.id,
      fullName: person.full_name,
      phone: person.phone,
      orgName: org.name,
      orgKind: org.kind,
      typeCode: person.type_code,
      status: person.status,
      passRef: person.pass_ref,
      vehicleReg: person.vehicle_reg,
      bandSerial: band?.band_serial ?? null,
      stickerNo: latestByPersonAndKind.get(`${person.id}:vehicle_sticker`)?.sticker_no ?? null,
      inBms: person.in_bms,
      collectedAt: band?.occurred_at ?? null,
    }]
  })

  const parsedResponse = masterResponseSchema.safeParse({ rows })
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
