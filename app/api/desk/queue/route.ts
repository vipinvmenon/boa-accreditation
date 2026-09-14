import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import {
  queueActionSchema,
  queueFilterSchema,
  queueResponseSchema,
} from '@/lib/schemas/queue'

export const dynamic = 'force-dynamic'

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

export async function GET(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('not_authenticated', 401)

  const filterResult = queueFilterSchema.safeParse(
    new URL(request.url).searchParams.get('filter') ?? 'pending',
  )
  if (!filterResult.success) return errorResponse('invalid_filter', 400)
  const filter = filterResult.data
  const { data, error } = await supabase.rpc('boa_acc_approval_queue', { p_filter: filter })
  if (error) {
    if (error.code === '42501') return errorResponse('not_authorized', 403)
    if (error.code === '22023') return errorResponse('invalid_filter', 400)
    return errorResponse('internal', 500)
  }

  const parsed = queueResponseSchema.safeParse(data)
  if (!parsed.success) return errorResponse('internal', 500)
  return NextResponse.json(parsed.data)
}

export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('not_authenticated', 401)

  const body = queueActionSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return errorResponse('invalid_body', 400)

  const action = body.data
  if (action.action === 'decide') {
    const { error } = await supabase.rpc('boa_acc_decide', {
      p_person_id: action.personId,
      p_approve: action.approve,
      p_type_code: action.approve ? action.typeCode ?? null : null,
      p_day_validity: action.approve ? action.dayValidity ?? null : null,
      p_decision_reason: action.approve ? null : action.reason ?? null,
    })
    if (error) return mutationError(error.code)
  } else if (action.action === 'approve_org') {
    const { error } = await supabase.rpc('boa_acc_approve_org', {
      p_org_id: action.orgId,
      p_type_code: action.typeCode,
      p_day_validity: action.dayValidity,
    })
    if (error) return mutationError(error.code)
  } else {
    const { error } = await supabase.rpc('boa_acc_reject_org', {
      p_org_id: action.orgId,
      p_decision_reason: action.reason,
    })
    if (error) return mutationError(error.code)
  }

  return NextResponse.json({ ok: true })
}

function mutationError(code: string | undefined) {
  if (code === '42501') return errorResponse('not_authorized', 403)
  if (code === '23514') return errorResponse('reason_required', 400)
  if (code === 'P0001') return errorResponse('decision_rejected', 409)
  if (code === 'P0002') return errorResponse('not_found', 404)
  return errorResponse('internal', 500)
}
