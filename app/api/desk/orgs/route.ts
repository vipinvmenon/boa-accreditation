import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase-server'
import { ORG_QUOTA_NON_ENFORCING, orgCreateSchema, orgRowSchema, orgRowWithCountsSchema } from '@/lib/schemas/org'

// ACC-027. Every write to boa_acc_org goes through boa_acc_create_org
// (202609120009) — there is no insert RLS policy, deliberately (see that
// migration's header). This route holds the publishable-key, cookie-backed
// client (lib/supabase-server.ts), never lib/supabase-admin.ts: the RPC
// checks lead/admin itself via the caller's own auth.uid(), the same way
// boa_acc_mint_invite already does, so there is no reason for /desk/orgs to
// carry the service role at all.
export const dynamic = 'force-dynamic'

const ORG_COLUMNS =
  'id, name, kind, quota, default_type, contact_name, contact_phone, status, notes, created_at, updated_at'

/** Maps a Postgres/PostgREST error to an HTTP status + body. */
function mapError(error: { code?: string; message?: string }): { status: number; body: { error: string } } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('not authorized')) {
    return { status: 403, body: { error: 'not_authorized' } }
  }
  if (message.includes('duplicate_name')) {
    return { status: 409, body: { error: 'duplicate_name' } }
  }
  // A CHECK constraint violation the zod schema let through some other way
  // (e.g. a name Postgres still rejects on length after trimming).
  if (error.code === '23514') {
    return { status: 400, body: { error: 'invalid_body' } }
  }
  return { status: 500, body: { error: 'internal' } }
}

const personOrgStatusSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'voided']),
})

const checkinSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  voids_checkin_id: z.string().nullable(),
})

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // RLS (boa_acc_org_read) restricts this to active operators already; a
  // signed-in non-operator gets an empty list rather than an error, which is
  // consistent with "the database enforces the same rule" (non-negotiable #3).
  //
  // ADR-019: this screen's job now is org names the importer matches
  // (data/org-aliases.json, boa_acc_org.name) and how many people each has
  // sent — so the org read is paired with a read of boa_acc_person (RLS
  // boa_acc_person_read, same "any operator" rule — see the master list
  // route for precedent) to compute per-org counts here, in the data layer,
  // rather than adding a new RPC for a count two existing tables already
  // answer with a group-by.
  const [{ data, error }, { data: personRows, error: personError }, { data: checkinRows, error: checkinError }] = await Promise.all([
    supabase.from('boa_acc_org').select(ORG_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('boa_acc_person').select('id,org_id,status'),
    // Same void-aware ledger read as GET /api/desk/master, to answer r10's
    // "Collected" column (design/source/r10/r8-orgs.html) without a new RPC —
    // a person has collected once their most recent, non-voided checkin here
    // is a wristband.
    supabase.from('boa_acc_checkin').select('id,person_id,kind,voids_checkin_id').order('occurred_at', { ascending: true }),
  ])

  if (error || personError || checkinError) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const rows = orgRowSchema.array().safeParse(data)
  const people = personOrgStatusSchema.array().safeParse(personRows)
  const checkins = checkinSchema.array().safeParse(checkinRows)
  if (!rows.success || !people.success || !checkins.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const voidedIds = new Set(
    checkins.data.filter((c) => c.kind === 'void' && c.voids_checkin_id).map((c) => c.voids_checkin_id as string),
  )
  const latestKindByPerson = new Map<string, string>()
  for (const c of checkins.data) {
    if (c.kind === 'void' || voidedIds.has(c.id)) continue
    latestKindByPerson.set(c.person_id, c.kind)
  }

  const countsByOrg = new Map<string, { submittedCount: number; approvedCount: number; collectedCount: number }>()
  for (const person of people.data) {
    const counts = countsByOrg.get(person.org_id) ?? { submittedCount: 0, approvedCount: 0, collectedCount: 0 }
    counts.submittedCount += 1
    if (person.status === 'approved') counts.approvedCount += 1
    if (latestKindByPerson.get(person.id) === 'wristband') counts.collectedCount += 1
    countsByOrg.set(person.org_id, counts)
  }

  const orgs = rows.data.map((org) => ({
    ...org,
    ...(countsByOrg.get(org.id) ?? { submittedCount: 0, approvedCount: 0, collectedCount: 0 }),
  }))

  const parsedOrgs = orgRowWithCountsSchema.array().safeParse(orgs)
  if (!parsedOrgs.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  return NextResponse.json({ orgs: parsedOrgs.data })
}

export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = orgCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })
  }

  const { data: orgId, error } = await supabase.rpc('boa_acc_create_org', {
    p_name: parsed.data.name,
    p_kind: parsed.data.kind,
    // ADR-019 / ACC-140g: quota is no longer collected from the operator —
    // the RPC's p_quota argument still exists (no migration to drop it, see
    // lib/schemas/org.ts), so this passes the non-enforcing default.
    p_quota: ORG_QUOTA_NON_ENFORCING,
    p_contact_name: parsed.data.contactName,
    p_contact_phone: parsed.data.contactPhone,
    p_default_type: parsed.data.defaultType ?? 'crew',
  })

  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }

  // boa_acc_create_org returns only the new id; read the row back through the
  // same authenticated, RLS-scoped client rather than re-deriving the row from
  // the request body, so the response always reflects what the database
  // actually stored (e.g. the trimmed/normalised name and phone).
  const { data: row, error: readError } = await supabase
    .from('boa_acc_org')
    .select(ORG_COLUMNS)
    .eq('id', orgId as string)
    .single()

  if (readError) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const parsedRow = orgRowSchema.safeParse(row)
  if (!parsedRow.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // A just-created org has sent nobody yet — no extra read needed for that.
  return NextResponse.json(
    { org: { ...parsedRow.data, submittedCount: 0, approvedCount: 0, collectedCount: 0 } },
    { status: 201 },
  )
}
