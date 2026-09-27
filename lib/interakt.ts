import { z } from 'zod'

/**
 * ADR-024 · Interakt template-send client — SERVER ONLY.
 *
 * Reads INTERAKT_API_KEY; never import this from a Client Component, and never
 * give any INTERAKT_* variable a NEXT_PUBLIC_ prefix (docs/WHATSAPP.md).
 *
 * API shape read on 27 Sep 2026 from Interakt's own documentation, reached
 * through Settings → Developer Settings → API DOC in app.interakt.ai (their
 * public resource-centre URLs 404 from search engines — go through the
 * dashboard, do not guess URLs):
 *
 *  - POST https://api.interakt.ai/v1/public/message/
 *    Authorization: Basic <SECRET_KEY>   ← the key verbatim, NOT base64 of
 *    "user:pass". Interakt's own curl examples pass the dashboard's Secret Key
 *    as the credential itself.
 *  - countryCode and phoneNumber are SEPARATE fields, and phoneNumber carries
 *    no country code and no leading zero.
 *  - template.name is the template's CODE NAME, read from the dashboard URL
 *    https://app.interakt.ai/template/<codename>/view — not its display name.
 *  - headerValues / bodyValues / buttonValues carry the template's variables.
 *    buttonValues applies "only in case there is a dynamic URL in the button",
 *    keyed by button index as a string, each value an array:
 *      "buttonValues": { "1": ["<pass token>"] }
 *    documented as 'value for {{1}} for dynamic url in button at index
 *    position 0'. This is what makes a per-person pass link possible.
 *  - Success: { result: true, message: "Message created successfully",
 *    id: "<uuid>" }. The id is the message id that webhooks refer to.
 *  - A send's STATUS IS NOT IN THE RESPONSE. Interakt: the status "won't be
 *    given in the API's response, but will only be available via webhooks"
 *    (Sent / Delivered / Read / Failed). Nothing here may infer delivery.
 *  - Rate limit: 600 requests/minute on BOA's plan; 429 on exceeding it.
 *
 * NOT verified, and deliberately not implemented here: the webhook payload's
 * shape and how Interakt authenticates its callbacks. Writing that from
 * memory would be a fabricated verification (non-negotiable #10). The Meta
 * webhook in lib/whatsapp.ts stays until Interakt's is read from a real event.
 */

export const INTERAKT_API_BASE = 'https://api.interakt.ai/v1/public'
export const INTERAKT_MESSAGE_URL = `${INTERAKT_API_BASE}/message/`

// ── Configuration ────────────────────────────────────────────────────────────

export type InteraktConfig = {
  apiKey: string
  templateName: string
  templateLang: string
}

type Env = Record<string, string | undefined>

const nonEmpty = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined)

/** Send config, or null when Interakt is not set up. Callers degrade to wa.me. */
export function interaktConfig(env: Env = process.env): InteraktConfig | null {
  const apiKey = nonEmpty(env['INTERAKT_API_KEY'])
  if (!apiKey) return null
  return {
    apiKey,
    templateName: nonEmpty(env['INTERAKT_TEMPLATE_NAME']) ?? 'boa_crew_pass',
    templateLang: nonEmpty(env['INTERAKT_TEMPLATE_LANG']) ?? 'en',
  }
}

// ── Numbers and names ────────────────────────────────────────────────────────

export type SplitNumber = { countryCode: string; phoneNumber: string }

/**
 * The schema stores +91XXXXXXXXXX. Interakt wants the country code and the
 * subscriber number as separate fields, the latter with no leading zero.
 */
export function splitNumber(e164: string): SplitNumber {
  const digits = e164.replace(/\D/g, '')
  if (!/^91[6-9]\d{9}$/.test(digits)) throw new Error('not an Indian mobile number')
  return { countryCode: '+91', phoneNumber: digits.slice(2) }
}

/**
 * A template text parameter may not contain newlines, tabs or runs of spaces.
 * A first name never should; this makes sure. Same rule as the Meta client —
 * it is WhatsApp's constraint, not Meta's.
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

/** The request body, built separately so it can be asserted without a network. */
export function buildTemplateMessage(config: InteraktConfig, input: SendInput) {
  const { countryCode, phoneNumber } = splitNumber(input.to)
  return {
    countryCode,
    phoneNumber,
    type: 'Template',
    template: {
      name: config.templateName,
      languageCode: config.templateLang,
      bodyValues: [templateText(input.firstName)],
      // Button index "1" is Interakt's key for the first button, whose dynamic
      // URL variable {{1}} is the pass token. The token alphabet is URL-safe
      // base64, so it needs no percent-encoding.
      buttonValues: { '1': [input.passToken] },
    },
  } as const
}

export const sendSuccessSchema = z.object({
  result: z.literal(true),
  message: z.string().optional(),
  id: z.string().min(1).max(200),
})

/**
 * Interakt's failure shape has not been seen from a real call. Parse it
 * leniently and fall back to the HTTP status rather than inventing fields.
 */
export const interaktErrorSchema = z
  .object({
    result: z.boolean().optional(),
    message: z.string().optional(),
    error: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  })
  .passthrough()

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string }

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export function describeInteraktError(status: number, body: unknown): string {
  const parsed = interaktErrorSchema.safeParse(body)
  if (!parsed.success) return `Interakt HTTP ${status}`
  const { message, error } = parsed.data
  const detail =
    message ??
    (typeof error === 'string' ? error : error ? JSON.stringify(error) : undefined)
  if (status === 429) return `Interakt 429: rate limited${detail ? ` — ${detail}` : ''}`.slice(0, 500)
  return `Interakt HTTP ${status}${detail ? `: ${detail}` : ''}`.slice(0, 500)
}

/**
 * Send the pass template. Never throws; a failure comes back with Interakt's
 * reason. A success means Interakt ACCEPTED the message — not that WhatsApp
 * delivered it. Delivery is only ever known from a webhook.
 */
export async function sendPassTemplate(
  config: InteraktConfig,
  input: SendInput,
  fetchImpl: FetchLike = fetch,
): Promise<SendResult> {
  const valid = sendInputSchema.safeParse(input)
  if (!valid.success) return { ok: false, reason: 'invalid send input (phone or pass token)' }

  let response: Response
  try {
    response = await fetchImpl(INTERAKT_MESSAGE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildTemplateMessage(config, valid.data)),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    return { ok: false, reason: 'No response from Interakt (network or timeout) — may not have been sent' }
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) return { ok: false, reason: describeInteraktError(response.status, body) }

  const parsed = sendSuccessSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, reason: 'Interakt accepted the request but returned no message id' }
  }
  return { ok: true, messageId: parsed.data.id }
}
