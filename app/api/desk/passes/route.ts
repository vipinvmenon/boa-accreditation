import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { passesResponseSchema, passesSchema, type Pass } from '@/lib/schemas/pass'

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

/**
 * The list only: no QR codes. The pass sheet draws the one QR it shows
 * (lib/pass-qr.ts) from the passToken already in each row, so the response
 * no longer grows by an SVG per approved person.
 */
export async function GET() {
  const result = await resolvePasses()
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const parsed = passesResponseSchema.safeParse({ passes: result.passes })
  if (!parsed.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json(parsed.data)
}
