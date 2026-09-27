import { describe, expect, it, vi } from 'vitest'
import {
  INTERAKT_MESSAGE_URL,
  buildTemplateMessage,
  describeInteraktError,
  interaktConfig,
  sendPassTemplate,
  splitNumber,
  templateText,
  type InteraktConfig,
} from '@/lib/interakt'

// ADR-024 · Interakt send client. The webhook is NOT covered here: its payload
// shape is unverified, so nothing in this repository parses it yet.

const config: InteraktConfig = {
  apiKey: 'test-key-not-a-real-one',
  templateName: 'boa_crew_pass',
  templateLang: 'en',
}

const input = {
  to: '+919876543210',
  firstName: 'Asha',
  passToken: 'AbCdEfGhIjKlMnOpQrStUv',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('interaktConfig', () => {
  it('is null without an API key, so callers fall back to wa.me', () => {
    expect(interaktConfig({})).toBeNull()
    expect(interaktConfig({ INTERAKT_API_KEY: '   ' })).toBeNull()
  })

  it('defaults the template name and language', () => {
    expect(interaktConfig({ INTERAKT_API_KEY: 'k' })).toEqual({
      apiKey: 'k',
      templateName: 'boa_crew_pass',
      templateLang: 'en',
    })
  })

  it('takes the template name and language from the environment when set', () => {
    expect(interaktConfig({
      INTERAKT_API_KEY: 'k',
      INTERAKT_TEMPLATE_NAME: 'other_name',
      INTERAKT_TEMPLATE_LANG: 'en_US',
    })).toMatchObject({ templateName: 'other_name', templateLang: 'en_US' })
  })
})

describe('splitNumber', () => {
  it('separates the country code, leaving no leading zero', () => {
    expect(splitNumber('+919876543210')).toEqual({ countryCode: '+91', phoneNumber: '9876543210' })
  })

  it('refuses anything that is not an Indian mobile number', () => {
    expect(() => splitNumber('+14155550100')).toThrow()
    expect(() => splitNumber('+915876543210')).toThrow() // must start 6-9
    expect(() => splitNumber('9876543210')).toThrow()
  })
})

describe('templateText', () => {
  it('collapses whitespace and caps the length', () => {
    expect(templateText('  Asha   Rani \n')).toBe('Asha Rani')
    expect(templateText('x'.repeat(100))).toHaveLength(60)
  })

  it('falls back rather than sending an empty variable', () => {
    expect(templateText('   ')).toBe('there')
  })
})

describe('buildTemplateMessage', () => {
  const body = buildTemplateMessage(config, input)

  it('sends the country code and subscriber number as separate fields', () => {
    expect(body.countryCode).toBe('+91')
    expect(body.phoneNumber).toBe('9876543210')
  })

  it('names the template and its language', () => {
    expect(body.type).toBe('Template')
    expect(body.template.name).toBe('boa_crew_pass')
    expect(body.template.languageCode).toBe('en')
  })

  it('puts the first name in bodyValues and the pass token in buttonValues', () => {
    expect(body.template.bodyValues).toEqual(['Asha'])
    expect(body.template.buttonValues).toEqual({ '1': ['AbCdEfGhIjKlMnOpQrStUv'] })
  })
})

describe('sendPassTemplate', () => {
  it('posts to Interakt with the key as a Basic credential', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ result: true, message: 'Message created successfully', id: 'abc-123' }),
    )
    const result = await sendPassTemplate(config, input, fetchImpl)

    expect(result).toEqual({ ok: true, messageId: 'abc-123' })
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(INTERAKT_MESSAGE_URL)
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Authorization']).toBe(
      `Basic ${config.apiKey}`,
    )
  })

  it('refuses an invalid recipient or pass token without calling out', async () => {
    const fetchImpl = vi.fn()
    expect(await sendPassTemplate(config, { ...input, to: '+14155550100' }, fetchImpl))
      .toEqual({ ok: false, reason: 'invalid send input (phone or pass token)' })
    expect(await sendPassTemplate(config, { ...input, passToken: 'sh rt' }, fetchImpl))
      .toEqual({ ok: false, reason: 'invalid send input (phone or pass token)' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('reports a network failure as possibly-sent rather than failed', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('boom'))
    const result = await sendPassTemplate(config, input, fetchImpl)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toMatch(/may not have been sent/)
  })

  it('surfaces the rate limit distinctly — 600 req/min is a real ceiling', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ message: 'Too many requests' }, 429),
    )
    const result = await sendPassTemplate(config, input, fetchImpl)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.reason).toContain('429')
  })

  it('does not claim success when the response carries no message id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ result: true }))
    const result = await sendPassTemplate(config, input, fetchImpl)
    expect(result).toEqual({
      ok: false,
      reason: 'Interakt accepted the request but returned no message id',
    })
  })

  it('does not treat a non-JSON body as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }))
    const result = await sendPassTemplate(config, input, fetchImpl)
    expect(result.ok).toBe(false)
  })
})

describe('describeInteraktError', () => {
  it('falls back to the status when the body is unrecognisable', () => {
    expect(describeInteraktError(500, null)).toBe('Interakt HTTP 500')
  })

  it('keeps reasons short enough for the send record', () => {
    expect(describeInteraktError(400, { message: 'x'.repeat(2000) }).length).toBeLessThanOrEqual(500)
  })
})
