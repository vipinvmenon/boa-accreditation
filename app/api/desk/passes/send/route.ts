import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { sendPassTemplate, whatsappConfig, type WhatsAppConfig } from '@/lib/whatsapp'
import {
  passSendsResponseSchema,
  passSendsRpcSchema,
  sendBeginSchema,
  sendRequestSchema,
  sendResponseSchema,
  type SendResult,
} from '@/app/desk/passes/send-schema'

// ACC-144 · Send each approved person their pass on WhatsApp.
//
// Authorisation is the database's: every RPC below checks for an active
// lead/admin row itself (non-negotiable #3). The session check here only
// turns "no session" into a 401 instead of a 403.

export const dynamic = 'force-dynamic'
// "Send all" is time-boxed well inside this; see BATCH_BUDGET_MS.
export const maxDuration = 60

const BATCH_BUDGET_MS = 40_000
const CONCURRENCY = 4

type Supabase = Awaited<ReturnType<typeof supabaseServer>>

function errorResponse(code: string, status: number) {
  return NextResponse.json({ error: code }, { status })
}

export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('not_authenticated', 401)

  const { data, error } = await supabase.rpc('boa_acc_pass_sends')
  if (error) {
    if (error.code === '42501') return errorResponse('not_authorized', 403)
    return errorResponse('internal', 500)
  }
  const rpc = passSendsRpcSchema.safeParse(data)
  if (!rpc.success) return errorResponse('internal', 500)

  const parsed = passSendsResponseSchema.safeParse({ ...rpc.data, configured: whatsappConfig() !== null })
  if (!parsed.success) return errorResponse('internal', 500)
  return NextResponse.json(parsed.data)
}

async function sendOne(
  supabase: Supabase,
  config: WhatsAppConfig,
  personId: string,
  resend: boolean,
): Promise<SendResult> {
  const begin = await supabase.rpc('boa_acc_pass_send_begin', { p_person_id: personId, p_resend: resend })
  if (begin.error) {
    const { code, message } = begin.error
    if (code === '42501') throw new NotAuthorized()
    if (code === 'P0002') return { personId, outcome: 'not_found', reason: null }
    if (code === 'P0001' && message.includes('already_sent')) return { personId, outcome: 'already_sent', reason: null }
    if (code === 'P0001' && message.includes('not_approved')) return { personId, outcome: 'not_approved', reason: null }
    return { personId, outcome: 'error', reason: 'database refused the send' }
  }
  const claim = sendBeginSchema.safeParse(begin.data)
  if (!claim.success) return { personId, outcome: 'error', reason: 'unexpected database response' }

  const sent = await sendPassTemplate(config, {
    to: claim.data.phone,
    firstName: claim.data.firstName,
    passToken: claim.data.passToken,
  })

  const record = await supabase.rpc('boa_acc_pass_send_record', {
    p_send_id: claim.data.sendId,
    p_wa_message_id: sent.ok ? sent.messageId : null,
    p_failure_reason: sent.ok ? null : sent.reason,
  })
  if (record.error) {
    // The message may have gone; the row stays queued with no message id and
    // stops blocking after 10 minutes. Say so rather than pretend.
    console.error('[pass-send] record failed', { sendId: claim.data.sendId, code: record.error.code })
    return { personId, outcome: 'error', reason: sent.ok ? 'sent, but the send record was not updated' : sent.reason }
  }
  return sent.ok
    ? { personId, outcome: 'queued', reason: null }
    : { personId, outcome: 'failed', reason: sent.reason }
}

class NotAuthorized extends Error {}

export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse('not_authenticated', 401)

  const body = sendRequestSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return errorResponse('invalid_body', 400)

  const maybeConfig = whatsappConfig()
  if (!maybeConfig) return errorResponse('whatsapp_not_configured', 503)
  const config: WhatsAppConfig = maybeConfig

  try {
    if (body.data.mode === 'one') {
      const result = await sendOne(supabase, config, body.data.personId, body.data.resend)
      return respond({ results: [result], remaining: 0 })
    }

    const unsent = await supabase.rpc('boa_acc_pass_send_unsent')
    if (unsent.error) {
      if (unsent.error.code === '42501') return errorResponse('not_authorized', 403)
      return errorResponse('internal', 500)
    }
    const ids = Array.isArray(unsent.data) ? unsent.data.filter((v): v is string => typeof v === 'string') : []
    // Nothing fires on zero people.
    if (ids.length === 0) return respond({ results: [], remaining: 0 })

    const started = Date.now()
    const results: SendResult[] = []
    let next = 0
    async function worker() {
      while (next < ids.length && Date.now() - started < BATCH_BUDGET_MS) {
        const id = ids[next++]
        if (id) results.push(await sendOne(supabase, config, id, false))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker))
    return respond({ results, remaining: ids.length - next })
  } catch (e) {
    if (e instanceof NotAuthorized) return errorResponse('not_authorized', 403)
    console.error('[pass-send] unexpected', e instanceof Error ? e.message : 'unknown')
    return errorResponse('internal', 500)
  }
}

function respond(payload: unknown) {
  const parsed = sendResponseSchema.safeParse(payload)
  if (!parsed.success) return errorResponse('internal', 500)
  return NextResponse.json(parsed.data)
}
