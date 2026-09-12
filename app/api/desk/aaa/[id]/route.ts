import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { aaaNominationIdSchema, aaaNominationSchema } from '@/lib/schemas/aaa'

export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const params = aaaNominationIdSchema.safeParse(await context.params)
  if (!params.success) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data, error } = await supabase.rpc('boa_acc_approve_aaa_nomination', {
    p_nomination_id: params.data.id,
  })
  if (error) {
    if (error.code === '42501' || error.message.includes('not authorized')) {
      return NextResponse.json({ error: 'not_authorized' }, { status: 403 })
    }
    if (error.code === 'P0002' || error.message.includes('not found')) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    }
    if (error.message.includes('already_decided')) {
      return NextResponse.json({ error: 'already_decided' }, { status: 409 })
    }
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  const nomination = aaaNominationSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!nomination.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json({ nomination: nomination.data })
}
