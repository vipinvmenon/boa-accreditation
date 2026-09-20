# Offline and sync

> **Status: specification.** Nothing below is built — `gate/` is empty. This is
> Phase 4 (ACC-050…059). See CURRENT-STATE.md.

## Why this is the hardest part

BITS Club, four thousand people, one cell tower. The gate has to answer one
question in three seconds with the radio off, and it must be **right** — a green
verdict from a stale or empty cache lets a stranger onto a site.

The 29-Aug spec is explicit: aeroplane-mode scanning is *"a test, not a
nice-to-have."*

## Shape

```
camera ─▶ BarcodeDetector | zxing-wasm ─▶ "BOA26:<token>"
                                              │
                          gate/resolve.ts  (PURE, no IO)
                     (roster, localLedger, pendingOutbox, token)
                                              │
                    GREEN ───────────── AMBER ───────────── RED
             issue band [+ sticker]   note + Reissue      refuse, no write
                                              │
                    ONE idempotency key per user ACTION
                    Dexie outbox ─▶ drain ─▶ POST /api/gate/issue
```

## The cache

Dexie v1, versioned with a migration path from the start:

```ts
roster:  'passToken, personId, orgId, status, updatedAt'  // O(1) scan lookup
ledger:  'id, personId, kind, occurredAt, [personId+kind]'
outbox:  'id, kind, idempotencyKey, status, nextAttemptAt, createdAt'
sticker: 'plate, stickerNo, personId, issuedAt'
meta:    'key'   // device token hint, rosterAsOf, ledgerAsOf, schemaVersion
```

A roster row is ~180 bytes. 612 people ≈ 110 KB JSON, ~28 KB gzipped — the spec's
"low tens of KB" holds. **Zones come from the 3 cached type rows, never
denormalised per person.**

The ledger cache carries only what the amber panel renders: `personId, kind,
occurredAt, bandSerial, stickerNo, gateLabel, volunteerName, isReissue` — exactly
*"Issued 14:02 · Gate 1 · band #0412 by Ravi"*.

## Pull and refresh

- **Cold pull** at `/gate/setup`, after the device token is pasted. It **blocks**
  and never renders a scanner over an empty cache.
- **Delta** every 45s when online, on `visibilitychange`, and immediately after
  every successful drain — `?since=<rosterAsOf>` on the `updated_at` index.
- **`asOf` is rendered.** The design's *"612 approved passes held on this device"*
  gains a second line stamping the pull time. bar-control's rule: *a hardcoded
  19:43 is a lie told at 22:10*.
- **A failed pull never empties the cache and never falls back to anything.**
  Empty cache plus no network is a screen that says so and refuses to scan.

## Resolution — pure and unit-tested

`gate/resolve.ts` takes `(raw, roster, ledgerByPerson, pendingByPerson)` and
returns green / amber / red. No IO, so it is exhaustively testable.

1. Not `BOA26:`-prefixed → **red**.
2. Not in roster → **red** (the roster only ever contains approved people).
3. A non-voided wristband in the ledger **or a pending one in the outbox** →
   **amber**, with the exact issue line.
4. Otherwise → **green**, plus `stickerDue` when a plate is registered and no
   active sticker exists.

> Step 3's outbox check is the one that matters. A re-scan **before** the queue
> drains must show amber, not green. Without it, offline mode is precisely where
> double-issue happens.

## The outbox

Ported from `boa-bar-control/src/domain/outbox-policy.ts`, retargeting only the
message table. Keep the structure and keep its header comment.

- **`selectDrainBatch` stops at the first blocked entry — it does not skip it.**
  bar-control's own regression: an earlier version drained everything whose
  backoff had elapsed, so an entry in backoff was skipped while entries behind it
  went ahead. Here that posts a reissue before its own original, and the ledger's
  account of who got a band first becomes wrong.
- **`classifyFailure`**, four kinds:
  - `duplicate` (23505, key already present) → **success**. The normal outcome of
    a reply lost on a festival network.
  - `auth` (28000/42501, revoked or expired device) → **stop the drain, do not
    consume an attempt.** Otherwise a revoked device burns 8 attempts × every
    queued row and marks a whole shift's work failed.
  - `invalid` (22023/23514, missing supervisor note, person not approved) →
    terminal immediately.
  - `transient` → backoff, capped 60s, `MAX_ATTEMPTS = 8`.
    **`person not found` is transient, not invalid** — a device whose roster
    predates an approval can legitimately scan someone the server knows about.
- **Idempotency keys identify the user's ACTION**, minted once when the flow
  starts, persisted with the entry, reused on every retry. Never one per network
  call.
- Terminal means *stop and show somebody*, never *discard*.
- Completed entries are **retained**, not deleted: they carry the server's reply
  and are the device's only local evidence a write landed.
- `Offline | 3 queued` reads from **one** `getQueueSummary()`. One source of truth
  for the pending count, one for online state.

## Reissue and void

Both **append**. A reissue adds a row with `is_reissue = true` and a supervisor
note; it does not touch the first. A void adds a row with `voids_checkin_id`.
Both work offline. `resolveScan` reports the **latest** non-voided issue.

## The service worker

`public/gate/sw.js`, scope `/gate`, generated by `scripts/build-gate-sw.mjs`
from `.next/static/` — real emitted asset URLs, never guessed, because a hash
that changes between build and precache leaves the gate half-cached: it renders,
then fails on an import at 3am. Next 16's Turbopack output no longer has the
older `app-build-manifest.json`, so the build precaches every immutable
JavaScript asset rather than risking an incomplete transitive chunk graph.

This is why all three `/gate` routes are `force-dynamic` with zero server data:
the per-request CSP nonce must be threaded into the App Router bootstrap. The
service worker precaches the emitted dynamic route responses by URL, so offline
navigation still needs no RSC-payload trickery. The current generated worker
contains **60 precache entries: 3 routes, 30 scripts, 1 CSS, 24 fonts and 1
WASM**.

`/api/gate/*` is **network-only**. The outbox is the queue; a service worker that
served or replayed a cached write would tell a volunteer a wristband was recorded
when it was not.

Not a PWA (ADR-007): no manifest, no install prompt, no update UI.

## The aeroplane-mode test (automated mocked-Chromium evidence, not full acceptance)

`tests/e2e/aeroplane-mode.spec.ts`, against Chromium with both gate API routes
mocked by fixture responses (not against a seeded Supabase roster). A passing
run proves the deterministic browser-flow and same-context IndexedDB assertions
only; it does not prove authenticated desk acceptance, a full seeded roster, or
the required physical/two-phone radio-off rehearsal:

```
fixture four approved → paste device token → assert the fixture roster loads
setOffline(true) → RELOAD          ← cold start offline; the SW is why this renders
scan A → GREEN → issue serial 0412 → outbox 1, chip "1 queued"
scan A again → AMBER               ← proves the pendingByPerson case
scan garbage → RED, outbox still 1
issue B with a BLANK serial → outbox 2   ← a blank serial is a complete collection
RELOAD offline → outbox still 2    ← same-context reload persistence only
setOffline(false) → drain → DB holds exactly 2 rows
force a replay → DB still holds 2  ← idempotency
```

Plus two failure paths: an injected 401 leaves the queue intact with attempts
**not** incremented; an issue forced to 500 stops its own reissue posting.

The reload assertion proves IndexedDB survives a page reload in the same
Chromium context. It does **not** prove persistence across browser restart,
profile eviction, OS suspension, or real-device storage pressure; no such
durability rehearsal has been performed.

**And a manual rehearsal (ACC-058), on two real phones, one an iPhone**, because
iOS Safari has no `BarcodeDetector` and the wasm path must be proven on real
hardware before 30 Sep. A Playwright pass is not a festival.

The real iPhone/two-phone radio-off rehearsal and full seeded-roster
verification remain unperformed. The Chromium suite's mocked API fixtures and
four-person roster must not be described as either.
