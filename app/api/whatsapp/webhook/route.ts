import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  extractStatuses,
  verifyHandshake,
  verifyWebhookSignature,
  webhookPayloadSchema,
} from '@/lib/whatsapp'

// ACC-144 · Meta's WhatsApp webhook: delivery statuses for the pass sends.
//
// No operator session exists here. The authorisation is the
// X-Hub-Signature-256 HMAC over the raw body, keyed with WHATSAPP_APP_SECRET;
// only after it verifies does anything reach the database, and then only
// boa_acc_pass_send_status, which is EXECUTE-granted to service_role alone.
//
// Register https://accred.bangaloreopenair.com/api/whatsapp/webhook in the
// Meta app (docs/WHATSAPP.md), subscribed to the "messages" field.

export const dynamic = 'force-dynamic'

/** Subscription handshake: echo hub.challenge when hub.verify_token matches. */
export async function GET(request: Request) {
  const challenge = verifyHandshake(new URL(request.url).searchParams, process.env['WHATSAPP_VERIFY_TOKEN'])
  if (challenge === null) return new NextResponse('forbidden', { status: 403 })
  return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
}

export async function POST(request: Request) {
  const secret = process.env['WHATSAPP_APP_SECRET']
  if (!secret) return NextResponse.json({ error: 'whatsapp_not_configured' }, { status: 503 })

  // The signature is over the exact bytes Meta sent, so read text, not json().
  const raw = await request.text()
  if (!verifyWebhookSignature(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'bad_signature' }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }
  const payload = webhookPayloadSchema.safeParse(json)
  // A well-signed event we do not understand is acknowledged, not retried for
  // seven days: Meta sends other fields (templates, account) to the same URL.
  if (!payload.success) return NextResponse.json({ ok: true, updated: 0 })

  const updates = extractStatuses(payload.data)
  if (updates.length === 0) return NextResponse.json({ ok: true, updated: 0 })

  const admin = supabaseAdmin()
  let updated = 0
  for (const u of updates) {
    const { data, error } = await admin.rpc('boa_acc_pass_send_status', {
      p_wa_message_id: u.messageId,
      p_status: u.status,
      p_at: u.at,
      p_failure_reason: u.failureReason,
    })
    if (error) {
      // Non-200 makes Meta retry, which is what we want for a database blip.
      console.error('[whatsapp-webhook] status update failed', { code: error.code })
      return NextResponse.json({ error: 'internal' }, { status: 500 })
    }
    if (data === true) updated += 1
  }
  return NextResponse.json({ ok: true, updated })
}
