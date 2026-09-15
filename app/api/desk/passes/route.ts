import { NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { supabaseServer } from '@/lib/supabase-server'
import { passesResponseSchema, passesSchema, type Pass } from '@/lib/schemas/pass'
import { QR_DARK, QR_LIGHT, QR_SCHEME } from '@/lib/design'

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
  const response = {
    passes: await Promise.all(result.passes.map(async (pass) => ({
      ...pass,
      qrSvg: await QRCode.toString(`${QR_SCHEME}${pass.passToken}`, {
        type: 'svg',
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: QR_DARK, light: QR_LIGHT },
      }),
    }))),
  }
  const parsed = passesResponseSchema.safeParse(response)
  if (!parsed.success) return NextResponse.json({ error: 'internal' }, { status: 500 })
  return NextResponse.json(parsed.data)
}
