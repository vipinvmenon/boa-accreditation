# Offline and sync

> **Status: built, and tested — not yet rehearsed by people.** Corrected
> 25 Sep 2026. This header used to read "Nothing below is built — `gate/` is
> empty", which was written during Phase 4 and never updated. It was flatly
> false: `gate/` holds 14 modules, and `corepack pnpm test:e2e` passes 29
> specs including the aeroplane-mode suite — cold offline boot, offline
> search by name, duplicate replay, 401/500 paths, and two phones converging
> after sync.
>
> What is **not** done is the human half: no two-issuer rehearsal on real
> phones (ACC-147), and the iPhone camera path is still unproven under the
> enforced CSP (ACC-053b). Treat the code below as real and the sign-off as
> outstanding.

## Who is at the gate (ACC-150, ADR-020)

An issuer logs in with an email and a password, like the desk, and the session
cookie authorises every `/api/gate/*` call; there is no device token. The
offline cost is stated and accepted: **log in once, with signal, before a
shift.** After that the gate renders and resolves entirely from Dexie with the
radio off — the service worker serves `/gate` from its precache and the page
never asks the server anything on the scan path. A session that lapses while
offline loses nothing: the outbox keeps every queued write until someone logs
in again (see *`classifyFailure`* below). The signed-in check
(`GET /api/gate/session`) runs only on load, only while online, and only to
send a stranger to `/desk/login?next=/gate` — the control is in the database.

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
meta:    'key'   // operatorId, rosterAsOf, ledgerAsOf, schemaVersion,
                 // lastPullAt, lastDrainAt (deviceTokenHint: pre-ACC-150 caches)
```

A roster row carries name, **phone**, role, org, tier, day validity and plate —
name, phone, role and vehicle are the whole of what this project collects
(non-negotiable #9), the phone so the desk can find someone by their number
with the radio off (ACC-147), and it is only ever shown masked to its last four
digits. A roster row is ~180 bytes. 612 people ≈ 110 KB JSON, ~28 KB gzipped — the spec's
"low tens of KB" holds. **Zones come from the 3 cached type rows, never
denormalised per person.**

The ledger cache carries only what the amber panel renders: `personId, kind,
occurredAt, bandSerial, stickerNo, gateLabel, volunteerName, isReissue` — exactly
*"Issued 14:02 · Gate 1 · band #0412 by Ravi"*.

## Pull and refresh

- **Cold pull on the first load of `/gate`**, by the signed-in issuer
  (ACC-150 — there is no `/gate/setup` and no token to paste). It **blocks**
  and never renders a scanner over an empty cache: a phone with no list shows
  *"No list on this phone"* and a way to sign in, never a scanner that would
  answer "Refuse" to every real pass.
- **Re-pull** every 45s when online, on `online`, on `visibilitychange` to
  visible, and immediately after every drain that landed work — see *The sync
  scheduler* below. It is a full snapshot today (`pullGate` replaces roster
  and ledger); the `?since=<rosterAsOf>` delta is not built.
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
  - `auth` (28000/42501, or the gate routes' own HTTP 401 *not_authenticated* /
    403 *not_authorized* — a lapsed operator session, or a signed-in person
    who is not a gate role) → **stop the drain, do not consume an
    attempt.** Otherwise one lapsed session burns 8 attempts × every queued row
    and marks a whole shift's work failed. The head entry stays `pending` with
    `lastError: 'authentication required'` and is held for one backoff step so
    a trigger does not re-post it in a tight loop. (Until ACC-149 a 401's JSON
    body matched none of the auth prose, so it was classified `transient`.)
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

## The sync scheduler (ACC-149)

Up to ten issuers' phones (ADR-020). Offline, two phones can each hand a band
to the same person and no app can stop that; what the gate *can* do is make
the window small when there is signal. `gate/sync-scheduler.ts` decides
**when** to drain and pull. It calls the existing `drainOutbox` and `pullGate`;
it never puts the network on the scan path, and writes nothing but the Dexie
cache — every read is still from Dexie, every write still goes through the
outbox (non-negotiable #7).

| Trigger | What runs |
| --- | --- |
| mount (`start`) | drain if anything is pending, then pull |
| `online` event | drain, then pull |
| `visibilitychange` → visible | drain, then pull |
| 5 s tick, while online | drain if pending **and** 10 s since the last drain; pull if 45 s since the last pull |
| a drain that landed work | pull straight after it, same cycle |

- **Single-flight.** One cycle (drain, then pull) at a time. A trigger that
  arrives mid-cycle is coalesced into exactly one follow-up; timer ticks are
  dropped. A pull never overlaps a drain the scheduler started.
- **Backoff reuses the outbox curve.** A failed pull (or a drain that throws)
  retries after `nextAttemptDelayMs(failures)` — 2 s, 4 s, 8 s … capped at
  60 s. Per-entry retry stays inside the outbox (`selectDrainBatch`).
- **401 is "needs login", never "drop".** When the queue holds an auth-stopped
  entry (`hasAuthStoppedEntry`) or a pull answers 401/403, the timer stops
  draining and pulling and the queue is left exactly as it is — no attempt
  consumed, nothing marked failed. Only an explicit trigger (`online`,
  visible, a remount after re-login) tries again, once. Since ACC-150 the
  credential is the operator's session cookie, which rides every same-origin
  request on its own: there is nothing for the page to read and nothing it
  could check offline, so `hasCredentials()` is always true and "needs login"
  comes only from the server actually refusing.
- **The pull/drain race.** `pullGate` replaces the ledger wholesale. If a drain
  (the scheduler's, `useOutboxSync`'s, or an issue's) lands while a pull is in
  flight, the pull's answer can predate the issue while the entry is already
  `done` — so neither the ledger nor the pending projection would show it, and
  this phone would scan its own just-banded person GREEN. `pullAndReconcile`
  restores ledger rows only for entries that turned `done` *during* that pull.
  Entries done before the request left are not restored: the server's answer
  has them, or correctly omits them because the desk voided them.
- **The sync line** renders on `/gate` and `/gate/vehicle`. Since 2 Oct it
  gives the age of the copy, not a clock time: "Synced just now", "Synced 4
  min ago"; from 5 minutes (`SYNC_STALE_AFTER_MS`) it turns amber: "List is
  12 min old" offline, and "List is 12 min old · not updating, call a lead"
  online, the case where pulls fail with signal and nothing else said so
  (`lib/format-sync-status.ts`). The clock time is the tooltip. The time is
  the last successful pull, persisted in Dexie
  `meta.lastPullAt`, so a cold offline reload still shows when this phone last
  heard from the server. The gate pill owns online/offline and queued state;
  this line reports pull freshness only. The line is laid out at zero height
  and drawn into existing whitespace (the gap above
  *Can't scan?* on `/gate`, the panel padding under the note on
  `/gate/vehicle`), so it moves nothing in the v2 contract's layout:
  `test:visual` for `gate` and `vehicle` measured 0.10–0.38% on 22 Sep 2026.
  A first version that added a normal line shifted the page and failed at
  1.9–12%.
- `useOutboxSync` (ACC-109) still drains on its own 30 s timer and after each
  issue; `drainOutbox` is single-flight per page, so the two never double-post.
  Folding that hook into the scheduler is a clean-up, not a correctness fix.

**Convergence bound, with signal on both phones:** phone A's issue posts at
once (issue → drain); phone B re-pulls within 45 s plus one 5 s tick. So a
second phone shows amber within about 50 s of the first phone's issue.

**Evidence.** `gate/sync-scheduler.test.ts` (fake timers: online/offline,
visible, single-flight, backoff, 401 on drain and on pull without data loss,
the reconcile race) and `gate/outbox.test.ts` (a real 401 drain keeps both
entries `pending` with 0 attempts). `tests/e2e/two-phone-sync.spec.ts`: two
Chromium contexts sharing one **mocked** gate API, the same `page.route`
fixture approach as the aeroplane-mode suite — phone A issues, phone B (on
Playwright's fake clock, jumped past the 45 s interval) turns amber after its
scheduled pull with no reload or reconnect. It was checked to fail when the
pull interval is set to 10 minutes. (The two ACC-109 vehicle tests that seed
Dexie directly now go offline before navigating: the mount-time pull would
otherwise replace their seeded ledger with the fixture's empty one.) It does
not prove the real RPCs, real
phones or a real cell network; the two-phone rehearsal (ACC-058/ACC-147) is
still the acceptance for that.

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
mocked by fixture responses (not against a seeded Supabase roster) — since
ACC-150 that includes `GET /api/gate/session`, mocked as a logged-in issuer
exactly like the other gate APIs, so no real auth user or Supabase session is
created by the suite. A passing
run proves the deterministic browser-flow and same-context IndexedDB assertions
only; it does not prove authenticated desk acceptance, a full seeded roster, or
the required physical/two-phone radio-off rehearsal:

```
fixture four approved + a mocked signed-in issuer session → first /gate load
pulls itself → assert the fixture roster loads
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
