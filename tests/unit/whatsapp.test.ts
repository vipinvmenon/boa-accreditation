import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  GRAPH_API_VERSION,
  buildTemplateMessage,
  extractStatuses,
  sendPassTemplate,
  toWhatsAppNumber,
  verifyHandshake,
  verifyWebhookSignature,
  webhookPayloadSchema,
  whatsappConfig,
  type WhatsAppConfig,
} from '@/lib/whatsapp'

// ACC-144 · lib/whatsapp.ts with a mocked fetch. No request leaves this process.

const config: WhatsAppConfig = {
  accessToken: 'test-token',
  phoneNumberId: '123456789012345',
  templateName: 'boa_crew_pass',
  templateLang: 'en',
}
const input = { to: '+919876543210', firstName: 'Asha', passToken: 'AbCdEfGhIjKlMnOpQrSt-_' }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('whatsappConfig', () => {
  it('is null until the token and phone-number id are both set', () => {
    expect(whatsappConfig({})).toBeNull()
    expect(whatsappConfig({ WHATSAPP_ACCESS_TOKEN: 'x' })).toBeNull()
    expect(whatsappConfig({ WHATSAPP_ACCESS_TOKEN: ' ', WHATSAPP_PHONE_NUMBER_ID: '1' })).toBeNull()
  })
  it('defaults the template name and language', () => {
    expect(whatsappConfig({ WHATSAPP_ACCESS_TOKEN: 'x', WHATSAPP_PHONE_NUMBER_ID: '1' })).toEqual({
      accessToken: 'x', phoneNumberId: '1', templateName: 'boa_crew_pass', templateLang: 'en',
    })
  })
})

describe('buildTemplateMessage', () => {
  it('sends digits only, the first name as {{1}} and the token as the URL-button suffix', () => {
    const msg = buildTemplateMessage(config, input)
    expect(msg.to).toBe('919876543210')
    expect(msg.type).toBe('template')
    expect(msg.template.name).toBe('boa_crew_pass')
    expect(msg.template.language).toEqual({ code: 'en' })
    expect(msg.template.components).toEqual([
      { type: 'body', parameters: [{ type: 'text', text: 'Asha' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: input.passToken }] },
    ])
  })
  it('collapses whitespace a template parameter may not carry', () => {
    const msg = buildTemplateMessage(config, { ...input, firstName: ' A\n\tsha  ' })
    expect(msg.template.components[0].parameters[0].text).toBe('A sha')
  })
  it('refuses a number that is not an Indian mobile', () => {
    expect(() => toWhatsAppNumber('+15551234567')).toThrow()
  })
})

describe('sendPassTemplate', () => {
  it('POSTs to the pinned Graph version with a bearer token and returns the message id', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      messaging_product: 'whatsapp',
      contacts: [{ input: '919876543210', wa_id: '919876543210' }],
      messages: [{ id: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAERgS', message_status: 'accepted' }],
    }))
    const result = await sendPassTemplate(config, input, fetchMock)
    expect(result).toEqual({ ok: true, messageId: 'wamid.HBgLOTE5ODc2NTQzMjEwFQIAERgS' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://graph.facebook.com/${GRAPH_API_VERSION}/123456789012345/messages`)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token')
    expect(JSON.parse(String(init.body)).template.name).toBe('boa_crew_pass')
  })

  it("returns Meta's reason on a refusal", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(400, {
      error: {
        message: '(#132001) Template name does not exist in the translation',
        type: 'OAuthException',
        code: 132001,
        error_data: { messaging_product: 'whatsapp', details: 'template name (boa_crew_pass) does not exist in en' },
        fbtrace_id: 'Axyz',
      },
    }))
    const result = await sendPassTemplate(config, input, fetchMock)
    expect(result).toEqual({ ok: false, reason: 'Meta 132001: template name (boa_crew_pass) does not exist in en' })
  })

  it('reports a network failure without throwing', async () => {
    const fetchMock = vi.fn(async () => { throw new TypeError('fetch failed') })
    const result = await sendPassTemplate(config, input, fetchMock)
    expect(result.ok).toBe(false)
  })

  it('treats a 200 with no message id as a failure', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { messaging_product: 'whatsapp', messages: [] }))
    expect((await sendPassTemplate(config, input, fetchMock)).ok).toBe(false)
  })

  it('never calls Meta for invalid input', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {}))
    const result = await sendPassTemplate(config, { ...input, passToken: 'has spaces/and slashes' }, fetchMock)
    expect(result.ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('verifyWebhookSignature', () => {
  const secret = 'app-secret'
  const body = '{"object":"whatsapp_business_account","entry":[]}'
  const sign = (b: string, s = secret) => `sha256=${createHmac('sha256', s).update(b).digest('hex')}`

  it('accepts the HMAC-SHA256 of the raw body', () => {
    expect(verifyWebhookSignature(body, sign(body), secret)).toBe(true)
  })
  it('rejects a signature made with another secret', () => {
    expect(verifyWebhookSignature(body, sign(body, 'other'), secret)).toBe(false)
  })
  it('rejects a body changed after signing', () => {
    expect(verifyWebhookSignature(body.replace('[]', '[{}]'), sign(body), secret)).toBe(false)
  })
  it('rejects a missing, malformed or sha1 header', () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false)
    expect(verifyWebhookSignature(body, 'sha256=nothex', secret)).toBe(false)
    expect(verifyWebhookSignature(body, sign(body).replace('sha256=', 'sha1='), secret)).toBe(false)
  })
  it('rejects everything when no secret is configured', () => {
    expect(verifyWebhookSignature(body, sign(body, ''), '')).toBe(false)
  })
})

describe('verifyHandshake', () => {
  const params = (q: string) => new URLSearchParams(q)
  it('echoes the challenge for the right token', () => {
    expect(verifyHandshake(params('hub.mode=subscribe&hub.verify_token=vt&hub.challenge=1158201444'), 'vt')).toBe('1158201444')
  })
  it('refuses a wrong token, a wrong mode, or no configured token', () => {
    expect(verifyHandshake(params('hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'), 'vt')).toBeNull()
    expect(verifyHandshake(params('hub.mode=unsubscribe&hub.verify_token=vt&hub.challenge=1'), 'vt')).toBeNull()
    expect(verifyHandshake(params('hub.mode=subscribe&hub.verify_token=vt&hub.challenge=1'), undefined)).toBeNull()
  })
})

describe('extractStatuses', () => {
  it('pulls delivered and failed statuses, with the failure reason', () => {
    const payload = webhookPayloadSchema.parse({
      object: 'whatsapp_business_account',
      entry: [{
        id: 'WABA',
        changes: [{
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: '123' },
            statuses: [
              { id: 'wamid.A', status: 'delivered', timestamp: '1790000000', recipient_id: '919876543210' },
              {
                id: 'wamid.B', status: 'failed', timestamp: '1790000001', recipient_id: '919876543211',
                errors: [{ code: 131026, title: 'Message undeliverable', message: 'Message undeliverable', error_data: { details: 'Recipient is not on WhatsApp' } }],
              },
              { id: 'wamid.C', status: 'played', timestamp: '1790000002' },
            ],
          },
        }],
      }],
    })
    expect(extractStatuses(payload)).toEqual([
      { messageId: 'wamid.A', status: 'delivered', at: new Date(1790000000 * 1000).toISOString(), failureReason: null },
      {
        messageId: 'wamid.B', status: 'failed', at: new Date(1790000001 * 1000).toISOString(),
        failureReason: 'Meta 131026 Message undeliverable: Recipient is not on WhatsApp',
      },
    ])
  })
  it('ignores other objects and fields', () => {
    const payload = webhookPayloadSchema.parse({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'message_template_status_update', value: { event: 'APPROVED' } }] }],
    })
    expect(extractStatuses(payload)).toEqual([])
  })
})
