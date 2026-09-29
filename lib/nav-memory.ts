/**
 * Which nav this tab last drew: the desk's or the gate's. Crossing from the
 * desk to /gate mounts GateChrome, which cannot know the operator's role until
 * /api/gate/session answers. Without this it drew the issuer's one-item nav
 * first and then swapped in the desk's links, so the pill was placed against
 * the wrong links and jumped instead of sliding (Vipin, 29 Sep).
 *
 * This is presentation only. It decides which links are drawn, never what the
 * operator may do: authorisation is in the database (CLAUDE.md, #3).
 */
const KEY = 'boa-desk-nav'

export function rememberDeskNav(isDeskOperator: boolean): void {
  try {
    if (isDeskOperator) window.sessionStorage.setItem(KEY, '1')
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the gate falls back to the issuer's nav until it knows.
  }
}

export function readDeskNav(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** For useSyncExternalStore: sessionStorage has no change event within a tab. */
export function subscribeNoop(): () => void {
  return () => {}
}
