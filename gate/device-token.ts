/**
 * The gate device token lives in localStorage, as docs/SECURITY.md specifies
 * ("pasted once into localStorage"). Until ACC-109 it was written to
 * sessionStorage, so a phone that closed the tab silently lost it and the
 * outbox stopped draining with nothing on screen saying so. Reads fall back
 * to sessionStorage once, so a device set up before the fix keeps syncing.
 */
const KEY = 'boa-gate-device-token'

export function readDeviceToken(): string | null {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) return stored
    const legacy = sessionStorage.getItem(KEY)
    if (legacy) {
      localStorage.setItem(KEY, legacy)
      return legacy
    }
  } catch {
    // Storage blocked (private mode): the gate still resolves offline from
    // Dexie; only syncing needs the token.
  }
  return null
}

export function writeDeviceToken(token: string): void {
  localStorage.setItem(KEY, token)
}
