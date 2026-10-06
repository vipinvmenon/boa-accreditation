// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonWithTimeout, RequestTimeoutError } from './fetch-timeout'
import { classifyFailure } from './outbox-policy'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A request that never answers until it is aborted, as on a congested network. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
  }))
}

describe('fetchJsonWithTimeout (6 Oct, finding 8)', () => {
  it('gives up on a request that never answers, as no signal', async () => {
    vi.stubGlobal('fetch', hangingFetch())
    const error = await fetchJsonWithTimeout('/api/gate/issue', { method: 'POST' }, 30).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RequestTimeoutError)
    expect(classifyFailure(error)).toBe('network')
  })

  it('gives up on a body that never finishes', async () => {
    // As a browser does: aborting the request errors its body stream.
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(new DOMException('The operation was aborted.', 'AbortError')))
        },
      })
      return new Response(body, { status: 200 })
    }))
    const error = await fetchJsonWithTimeout('/api/gate/pull', { method: 'POST' }, 30).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RequestTimeoutError)
  })

  it('returns the answer and its JSON when it comes in time', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 201 })))
    const { response, body } = await fetchJsonWithTimeout('/api/gate/issue', { method: 'POST' }, 1_000)
    expect([response.status, body]).toEqual([201, { ok: 1 }])
  })

  it('passes a real network failure through unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const error = await fetchJsonWithTimeout('/api/gate/issue', { method: 'POST' }, 1_000).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TypeError)
    expect(classifyFailure(error)).toBe('network')
  })
})
