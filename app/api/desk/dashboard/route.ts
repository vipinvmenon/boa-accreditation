import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import {
  dashboardSchema,
  dashboardGateFeedSchema,
  dashboardTypeNoteSchema,
  doubleIssueListSchema,
  type DashboardResponse,
  type DoubleIssue,
} from '@/lib/schemas/dashboard'

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

  const [{ data, error }, { data: feedData, error: feedError }] = await Promise.all([
    supabase.rpc('boa_acc_desk_dashboard'),
    supabase.rpc('boa_acc_desk_gate_feed'),
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

  const body: DashboardResponse = {
    ...parsed.data,
    gateCounts: parsedFeed?.success ? parsedFeed.data.gateCounts : null,
    latestIssues: parsedFeed?.success ? parsedFeed.data.latestIssues : null,
    types: parsed.data.types.map((type) => ({ ...type, note: noteByCode.get(type.code) ?? null })),
    doubleIssueList,
  }
  return NextResponse.json(body)
}
