import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { gatePullSchema } from '@/lib/schemas/gate'

export const dynamic = 'force-dynamic'

function deviceToken(request: Request): string | null {
  const token = request.headers.get('x-boa-device-token')?.trim()
  return token ? token : null
}

function mapError(error: { code?: string; message?: string }): { status: number; error: string } {
  if (error.code === '42501' || (error.message ?? '').includes('invalid device')) {
    return { status: 401, error: 'invalid_device' }
  }
  return { status: 500, error: 'internal' }
}

export async function POST(request: Request) {
  const token = deviceToken(request)
  if (token === null) {
    return NextResponse.json({ error: 'invalid_device' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin().rpc('boa_acc_gate_pull', {
    p_device_token: token,
  })
  if (error) {
    const mapped = mapError(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }

  const parsed = gatePullSchema.safeParse(data)
  if (!parsed.success) {
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
  return NextResponse.json(parsed.data)
}
