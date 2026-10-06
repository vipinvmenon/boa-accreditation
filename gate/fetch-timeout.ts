/**
 * A gate request that cannot hang (6 Oct pre-festival test pass, finding 8).
 *
 * `fetch` has no time limit of its own. On a congested festival network a
 * request can sit open for minutes, and while it does the single-flight drain
 * and the scheduler's cycle wait on it: nothing else is sent and no pull runs.
 * Every outbox send and every pull goes through here instead, and the body is
 * read under the same limit, since a stalled body is the same hang.
 *
 * A manual AbortController rather than `AbortSignal.timeout`, which iOS 15
 * Safari lacks: there it would throw before the request left, on every send.
 */

/** A send carries one small JSON action. */
export const SEND_TIMEOUT_MS = 20_000
/** A pull carries the whole roster and ledger. */
export const PULL_TIMEOUT_MS = 45_000

/** Thrown when the limit passes. gate/outbox-policy.ts treats it as no signal. */
export class RequestTimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`${url} gave no answer in ${Math.round(ms / 1000)} s`)
    this.name = 'RequestTimeoutError'
  }
}

export async function fetchJsonWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const body: unknown = await response.json().catch(() => {
      // An unreadable body is "no JSON" — unless the limit is what cut it off.
      if (timedOut) throw new RequestTimeoutError(url, timeoutMs)
      return null
    })
    return { response, body }
  } catch (error: unknown) {
    if (timedOut) throw new RequestTimeoutError(url, timeoutMs)
    throw error
  } finally {
    clearTimeout(timer)
  }
}
