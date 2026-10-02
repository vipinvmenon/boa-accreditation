import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseServer } from '@/lib/supabase-server'
import { collectionCounts } from '@/lib/collection'
import {
  dashboardCollectionSchema,
  dashboardSchema,
  dashboardGateFeedSchema,
  dashboardTypeNoteSchema,
  doubleIssueListSchema,
  type DashboardCollection,
  type DashboardResponse,
  type DoubleIssue,
} from '@/lib/schemas/dashboard'

const collectionPersonSchema = z.object({
  id: z.string(),
  org_id: z.string(),
  status: z.string(),
  type_code: z.string().nullable(),
})

const collectionCheckinSchema = z.object({
  id: z.string(),
  person_id: z.string(),
  kind: z.enum(['wristband', 'vehicle_sticker', 'void']),
  voids_checkin_id: z.string().nullable(),
})

// ACC-033. Every Control-room number comes from boa_acc_desk_dashboard()
// (202609120010) in one call — holds lib/supabase-server.ts (the operator's
// own cookie session), never the service-role client, same as /api/desk/orgs.
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // The collected counts (per tier, per organisation) are read the same way
  // GET /api/desk/orgs and GET /api/desk/master read them — two RLS-guarded
  // tables any active operator can already see — rather than a new RPC.
  const [{ data, error }, { data: feedData, error: feedError }, { data: personRows, error: personError }, { data: checkinRows, error: checkinError }] = await Promise.all([
    supabase.rpc('boa_acc_desk_dashboard'),
    supabase.rpc('boa_acc_desk_gate_feed'),
    supabase.from('boa_acc_person').select('id,org_id,status,type_code'),
    supabase.from('boa_acc_checkin').select('id,person_id,kind,voids_checkin_id'),
  ])

  if (error) {
    if (error.code === '42501') {
      return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  const parsed = dashboardSchema.safeParse(data)
  if (!parsed.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }

  // ACC-183a: the feed is an optional additive migration. An older deployment
  // can return PGRST202 while the already-working Control room RPC is present;
  // keep that shell usable until the feed migration is pushed. But any
  // failure here — missing migration, a permission error, a timeout, or a
  // ledger row this schema can't parse (an unmapped boa_acc_type_code, say)
  // — must read downstream as "the feed is unavailable", not as "zero
  // events today": the route reports it as `null` (below), never as `[]`.
  const parsedFeed = feedError ? null : dashboardGateFeedSchema.safeParse(feedData ?? {})

  // ACC-115: each tier card prints boa_acc_type.note. The counts stay in the
  // one RPC; the note is copy, read from the table the RPC orders by, so the
  // card text comes from the database rather than a second description in
  // TypeScript. A failed read degrades to no note — never to a failed screen.
  const { data: typeRows } = await supabase.from('boa_acc_type').select('code,note')
  const notes = dashboardTypeNoteSchema.array().safeParse(typeRows ?? [])
  const noteByCode = new Map(notes.success ? notes.data.map((row) => [row.code, row.note]) : [])

  // ACC-148: names behind the count, read only when there is something to
  // show. boa_acc_double_issues() does its own role check (lead/approver/
  // admin). A failed read still returns the count, with a null list, so the
  // warning never disappears because its detail could not load.
  let doubleIssueList: DoubleIssue[] | null = []
  if (parsed.data.doubleIssues > 0) {
    const { data: rows, error: listError } = await supabase.rpc('boa_acc_double_issues')
    const list = listError ? null : doubleIssueListSchema.safeParse(rows)
    doubleIssueList = list?.success ? list.data : null
  }

  // A failed read prints a dash on those cards, never a number that means
  // something else (the 1 Oct review found "collected" over approved counts).
  let collection: DashboardCollection | null = null
  if (!personError && !checkinError) {
    const people = collectionPersonSchema.array().safeParse(personRows)
    const checkins = collectionCheckinSchema.array().safeParse(checkinRows)
    if (people.success && checkins.success) {
      const counts = dashboardCollectionSchema.safeParse(collectionCounts(people.data, checkins.data))
      collection = counts.success ? counts.data : null
    }
  }

  const body: DashboardResponse = {
    ...parsed.data,
    gateCounts: parsedFeed?.success ? parsedFeed.data.gateCounts : null,
    latestIssues: parsedFeed?.success ? parsedFeed.data.latestIssues : null,
    types: parsed.data.types.map((type) => ({ ...type, note: noteByCode.get(type.code) ?? null })),
    doubleIssueList,
    collection,
  }
  return NextResponse.json(body)
}
