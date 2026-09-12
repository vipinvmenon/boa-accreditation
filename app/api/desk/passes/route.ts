import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { passesSchema, type Pass } from '@/lib/schemas/pass'

export const dynamic = 'force-dynamic'

export async function resolvePasses(): Promise<
  { ok: true; passes: Pass[] } | { ok: false; status: number; error: string }
> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, status: 401, error: 'not_authenticated' }

  const { data, error } = await supabase.rpc('boa_acc_passes')
  if (error) {
    if (error.code === '42501') return { ok: false, status: 403, error: 'not_authorized' }
    return { ok: false, status: 500, error: 'internal' }
  }

  const parsed = passesSchema.safeParse(data)
  if (!parsed.success) return { ok: false, status: 500, error: 'internal' }
  return { ok: true, passes: parsed.data }
}

export async function GET() {
  const result = await resolvePasses()
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ passes: result.passes })
}
