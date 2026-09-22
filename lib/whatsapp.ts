import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

/**
 * ACC-144 · WhatsApp Business Cloud API client — SERVER ONLY.
 *
 * Imports node:crypto and reads WHATSAPP_ACCESS_TOKEN; never import it from a
 * Client Component. None of the WHATSAPP_* variables may carry a NEXT_PUBLIC_
 * prefix (docs/WHATSAPP.md).
 *
 * API shape checked on 22 Sep 2026 against Meta's developer docs:
 *  - Graph API versions: developers.facebook.com/docs/graph-api/changelog —
 *    v26.0 (29 Jul 2026) is the newest; v25.0 (18 Feb 2026, expires 29 Jul
 *    2028) is the version Meta's WhatsApp template-components examples use.
 *    We pin v25.0: the version the examples we copied were written against.
 *  - Template send: POST /{Version}/{Phone-Number-ID}/messages with
 *    type "template" and components [{type:"body", parameters:[{type:"text"}]},
 *    {type:"button", sub_type:"url", index:"0", parameters:[{type:"text"}]}]
 *    (developers.facebook.com/documentation/business-messaging/whatsapp/
 *    templates/components). A URL button supports ONE variable, appended to
 *    the end of the URL — here the pass token, so the button opens
 *    https://accred.bangaloreopenair.com/p/<token>.
 *  - Success: { messaging_product, contacts:[{input, wa_id}],
 *    messages:[{id, message_status?}] } (…/cloud-api/reference/messages).
 *  - Errors: the standard Graph error object { error: { message, type, code,
 *    error_data?: { details }, fbtrace_id } }. NOT re-verified from a page
 *    (Meta's reference page returned no error example); parsed leniently.
 *  - Webhook: GET handshake hub.mode=subscribe / hub.verify_token /
 *    hub.challenge → 200 with the challenge; POST signed with
 *    X-Hub-Signature-256: sha256=<HMAC-SHA256(raw body, app secret)>
 *    (…/whatsapp/webhooks/create-webhook-endpoint). Status payload:
 *    entry[].changes[].value.statuses[] { id, status, timestamp,
 *    recipient_id, errors?[{ code, title, message, error_data.details }] }
 *    (…/webhooks/reference/messages/status).
 */

export const GRAPH_API_VERSION = 'v25.0'
export const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// ── Configuration ────────────────────────────────────────────────────────────

export type WhatsAppConfig = {
  accessToken: string
  phoneNumberId: string
  templateName: string
  templateLang: string
}

type Env = Record<string, string | undefined>

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined)

/** Send config, or null when the account is not set up (ACC-151 pending). */
export function whatsappConfig(env: Env = process.env): WhatsAppConfig | null {
  const accessToken = nonEmpty(env['WHATSAPP_ACCESS_TOKEN'])
  const phoneNumberId = nonEmpty(env['WHATSAPP_PHONE_NUMBER_ID'])
  if (!accessToken || !phoneNumberId) return null
  return {
    accessToken,
    phoneNumberId,
    templateName: nonEmpty(env['WHATSAPP_TEMPLATE_NAME']) ?? 'boa_crew_pass',
    templateLang: nonEmpty(env['WHATSAPP_TEMPLATE_LANG']) ?? 'en',
  }
}

// ── Numbers and names ────────────────────────────────────────────────────────

/** The schema stores +91XXXXXXXXXX. The Cloud API and wa.me take digits only. */
export function toWhatsAppNumber(e164: string): string {
  const digits = e164.replace(/\D/g, '')
  if (!/^91[6-9]\d{9}$/.test(digits)) throw new Error('not an Indian mobile number')
  return digits
}

/**
 * A template text parameter may not contain newlines, tabs or more than four
 * consecutive spaces. A first name never should; this makes sure.
 */
export function templateText(value: string): string {
  const cleaned = value.replace(/\s+/g, ' ').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 60) : 'there'
}

// ── Sending ──────────────────────────────────────────────────────────────────

export const passTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/)

export const sendInputSchema = z.object({
  to: z.string().regex(/^\+91[6-9]\d{9}$/),
  firstName: z.string(),
  passToken: passTokenSchema,
})
export type SendInput = z.infer<typeof sendInputSchema>

export function buildTemplateMessage(config: WhatsAppConfig, input: SendInput) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toWhatsAppNumber(input.to),
    type: 'template',
    template: {
      name: config.templateName,
      language: { code: config.templateLang },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: templateText(input.firstName) }] },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          // The token alphabet is URL-safe base64, so no percent-encoding needed.
          parameters: [{ type: 'text', text: input.passToken }],
        },
      ],
    },
  } as const
}

export const sendSuccessSchema = z.object({
  messaging_product: z.literal('whatsapp'),
  contacts: z.array(z.object({ input: z.string().optional(), wa_id: z.string().optional() })).optional(),
  messages: z
    .array(z.object({ id: z.string().min(1).max(200), message_status: z.string().optional() }))
    .min(1),
})

export const graphErrorSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.number().optional(),
    error_subcode: z.number().optional(),
    error_data: z.object({ details: z.string().optional() }).passthrough().optional(),
    fbtrace_id: z.string().optional(),
  }).passthrough(),
})

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string }

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

function describeGraphError(status: number, body: unknown): string {
  const parsed = graphErrorSchema.safeParse(body)
  if (!parsed.success) return `Meta HTTP ${status}`
  const e = parsed.data.error
  const detail = e.error_data?.details || e.message || 'no detail'
  return `Meta ${e.code ?? `HTTP ${status}`}: ${detail}`.slice(0, 500)
}

/** Send the pass template. Never throws; a failure comes back with Meta's reason. */
export async function sendPassTemplate(
  config: WhatsAppConfig,
  input: SendInput,
  fetchImpl: FetchLike = fetch,
): Promise<SendResult> {
  const valid = sendInputSchema.safeParse(input)
  if (!valid.success) return { ok: false, reason: 'invalid send input (phone or pass token)' }

  let response: Response
  try {
    response = await fetchImpl(`${GRAPH_API_BASE}/${encodeURIComponent(config.phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTemplateMessage(config, valid.data)),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { ok: false, reason: 'No response from Meta (network or timeout) — may not have been sent' }
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, reason: describeGraphError(response.status, body) }

  const parsed = sendSuccessSchema.safeParse(body)
  if (!parsed.success) return { ok: false, reason: 'Meta accepted the request but returned no message id' }
  const [first] = parsed.data.messages
  if (!first) return { ok: false, reason: 'Meta accepted the request but returned no message id' }
  return { ok: true, messageId: first.id }
}

// ── Webhook ──────────────────────────────────────────────────────────────────

/**
 * X-Hub-Signature-256 check: HMAC-SHA256 of the RAW body (not re-serialised
 * JSON) keyed with the app secret, compared in constant time.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !appSecret) return false
  const match = /^sha256=([0-9a-f]{64})$/i.exec(header.trim())
  if (!match?.[1]) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest()
  const given = Buffer.from(match[1], 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** GET handshake. Returns the challenge to echo, or null to refuse. */
export function verifyHandshake(params: URLSearchParams, verifyToken: string | undefined): string | null {
  if (!verifyToken) return null
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')
  if (mode !== 'subscribe' || !token || !challenge) return null
  const a = Buffer.from(token)
  const b = Buffer.from(verifyToken)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return challenge
}

const statusErrorSchema = z.object({
  code: z.number().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
  error_data: z.object({ details: z.string().optional() }).passthrough().optional(),
}).passthrough()

const statusSchema = z.object({
  id: z.string().min(1).max(200),
  status: z.string(),
  timestamp: z.string().regex(/^\d+$/).optional(),
  recipient_id: z.string().optional(),
  errors: z.array(statusErrorSchema).optional(),
}).passthrough()

export const webhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string().optional(),
    changes: z.array(z.object({
      field: z.string(),
      value: z.object({
        messaging_product: z.string().optional(),
        statuses: z.array(statusSchema).optional(),
      }).passthrough(),
    }).passthrough()),
  }).passthrough()),
}).passthrough()

export type StatusUpdate = {
  messageId: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  at: string | null
  failureReason: string | null
}

const TRACKED = new Set(['sent', 'delivered', 'read', 'failed'])

/** Pull the message-status events we track out of a webhook payload. */
export function extractStatuses(payload: z.infer<typeof webhookPayloadSchema>): StatusUpdate[] {
  const out: StatusUpdate[] = []
  if (payload.object !== 'whatsapp_business_account') return out
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue
      for (const s of change.value.statuses ?? []) {
        if (!TRACKED.has(s.status)) continue // 'played' etc. — voice notes only
        const err = s.errors?.[0]
        const failureReason = s.status === 'failed'
          ? (err
              ? `Meta ${err.code ?? ''} ${err.title ?? ''}: ${err.error_data?.details || err.message || 'no detail'}`
                  .replace(/\s+/g, ' ').trim().slice(0, 500)
              : 'failed (no reason given)')
          : null
        out.push({
          messageId: s.id,
          status: s.status as StatusUpdate['status'],
          at: s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : null,
          failureReason,
        })
      }
    }
  }
  return out
}
