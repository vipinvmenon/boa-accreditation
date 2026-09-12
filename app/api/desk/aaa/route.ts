import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { aaaNominationInputSchema, aaaNominationSchema } from '@/lib/schemas/aaa'

export const dynamic = 'force-dynamic'

function mapError(error: { code?: string; message?: string }): { status: number; body: { error: string } } {
  const message = error.message ?? ''
  if (error.code === '42501' || message.includes('not authorized')) {
    return { status: 403, body: { error: 'not_authorized' } }
  }
  if (error.code === '23505' || message.includes('duplicate_nomination')) {
    return { status: 409, body: { error: 'duplicate_nomination' } }
  }
  if (message.includes('invalid nomination')) {
    return { status: 400, body: { error: 'invalid_body' } }
  }
  return { status: 500, body: { error: 'internal' } }
}

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  const { data, error } = await supabase.rpc('boa_acc_list_aaa_nominations')
  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
  const parsed = aaaNominationSchema.array().safeParse(data)
  if (!parsed.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json({ nominations: parsed.data })
}

export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const parsed = aaaNominationInputSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 })

  const { data, error } = await supabase.rpc('boa_acc_nominate_aaa', {
    p_full_name: parsed.data.fullName,
    p_phone: parsed.data.phone,
    p_org_hint: parsed.data.orgHint ?? null,
  })
  if (error) {
    const mapped = mapError(error)
    return NextResponse.json(mapped.body, { status: mapped.status })
  }
  const nomination = aaaNominationSchema.safeParse(Array.isArray(data) ? data[0] : data)
  if (!nomination.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json({ nomination: nomination.data }, { status: 201 })
}
