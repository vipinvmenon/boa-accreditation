import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase-server'
import {
  exportQuerySchema,
  exportResponseSchema,
  type ExportRow,
} from '@/lib/schemas/export'

export const dynamic = 'force-dynamic'

const personSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  full_name: z.string(),
  phone: z.string(),
})

const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const checkinSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  band_serial: z.string().nullable(),
  sticker_no: z.string().nullable(),
  vehicle_reg: z.string().nullable(),
  gate_label: z.string(),
  volunteer_name: z.string(),
  occurred_at: z.string(),
  posted_at: z.string(),
  is_reissue: z.boolean(),
  supervisor_note: z.string().nullable(),
  voids_checkin_id: z.string().nullable(),
})

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value)
  return `"${text.replaceAll('"', '""')}"`
}

function toCsv(rows: ExportRow[]): string {
  const header = [
    'Occurred at',
    'Posted at',
    'Kind',
    'Name',
    'Phone',
    'Organisation',
    'Band',
    'Sticker',
    'Vehicle',
    'Reissue',
    'Supervisor note',
    'Voids',
    'Gate',
    'Volunteer',
  ]
  const body = rows.map((row) => [
    row.occurredAt,
    row.postedAt,
    row.kind,
    row.fullName,
    row.phone,
    row.orgName,
    row.bandSerial ?? '',
    row.stickerNo ?? '',
    row.vehicleReg ?? '',
    row.isReissue ? 'Reissue' : '',
    row.supervisorNote ?? '',
    row.voidsDescription ?? '',
    row.gateLabel,
    row.volunteerName,
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
  const query = exportQuerySchema.safeParse({
    format: params.get('format') ?? 'json',
  })
  if (!query.success) return errorResponse('invalid_query', 400)

  const [{ data: people, error: peopleError }, { data: orgs, error: orgsError }, { data: checkins, error: checkinsError }] =
    await Promise.all([
      supabase
        .from('boa_acc_person')
        .select('id,org_id,full_name,phone'),
      supabase
        .from('boa_acc_org')
        .select('id,name'),
      // Every row, no dedup, no dropping voided rows: this is a ledger
      // reconciliation export, not a display projection. Chronological order
      // matches how it physically happened at the gate.
      supabase
        .from('boa_acc_checkin')
        .select(
          'id,person_id,kind,band_serial,sticker_no,vehicle_reg,gate_label,volunteer_name,occurred_at,posted_at,is_reissue,supervisor_note,voids_checkin_id',
        )
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

  const personById = new Map(parsedPeople.data.map((person) => [person.id, person]))
  const orgById = new Map(parsedOrgs.data.map((org) => [org.id, org]))
  const checkinById = new Map(parsedCheckins.data.map((checkin) => [checkin.id, checkin]))

  function describeVoided(voidsCheckinId: string | null): string | null {
    if (!voidsCheckinId) return null
    const voided = checkinById.get(voidsCheckinId)
    if (!voided) return voidsCheckinId
    return voided.band_serial ?? voided.sticker_no ?? voidsCheckinId
  }

  const rows = parsedCheckins.data.flatMap((checkin): ExportRow[] => {
    const person = personById.get(checkin.person_id)
    if (!person) return []
    const org = orgById.get(person.org_id)
    return [{
      id: checkin.id,
      occurredAt: checkin.occurred_at,
      postedAt: checkin.posted_at,
      kind: checkin.kind,
      fullName: person.full_name,
      phone: person.phone,
      orgName: org?.name ?? '',
      bandSerial: checkin.band_serial,
      stickerNo: checkin.sticker_no,
      vehicleReg: checkin.vehicle_reg,
      isReissue: checkin.is_reissue,
      supervisorNote: checkin.supervisor_note,
      voidsCheckinId: checkin.voids_checkin_id,
      voidsDescription: describeVoided(checkin.voids_checkin_id),
      gateLabel: checkin.gate_label,
      volunteerName: checkin.volunteer_name,
    }]
  })

  const parsedResponse = exportResponseSchema.safeParse({ rows })
  if (!parsedResponse.success) return errorResponse('internal', 500)
  if (query.data.format === 'csv') {
    return new NextResponse(toCsv(parsedResponse.data.rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="boa-ledger-export.csv"',
      },
    })
  }
  return NextResponse.json(parsedResponse.data)
}
