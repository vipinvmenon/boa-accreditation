import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { dashboardSchema, dashboardTypeNoteSchema } from '@/lib/schemas/dashboard'

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

  const { data, error } = await supabase.rpc('boa_acc_desk_dashboard')

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

  // ACC-115: each tier card prints boa_acc_type.note. The counts stay in the
  // one RPC; the note is copy, read from the table the RPC orders by, so the
  // card text comes from the database rather than a second description in
  // TypeScript. A failed read degrades to no note — never to a failed screen.
  const { data: typeRows } = await supabase.from('boa_acc_type').select('code,note')
  const notes = dashboardTypeNoteSchema.array().safeParse(typeRows ?? [])
  const noteByCode = new Map(notes.success ? notes.data.map((row) => [row.code, row.note]) : [])

  return NextResponse.json({
    ...parsed.data,
    types: parsed.data.types.map((type) => ({ ...type, note: noteByCode.get(type.code) ?? null })),
  })
}
