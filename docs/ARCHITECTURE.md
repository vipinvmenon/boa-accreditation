# Architecture

> **Status: specification.** Phase 0 (scaffold, design system, gates) is built.
> Everything below marked ▢ is not built yet. See CURRENT-STATE.md.

## Shape

Three surfaces, one database, one deployment.

| Surface | Routes | Who | Credential |
|---|---|---|---|
| Submission | `/s/[token]`, `/p/[passToken]` | vendor contact | invite token in the URL, no account |
| Allocation desk | `/desk/*` | Bhoopesh, Salman, 2 approvers | Supabase email + password |
| Gate | `/gate`, `/gate/vehicle`, `/gate/setup` | volunteers on phones | device token, pasted once |

## Layering

```
  app/ + components/     presentation. Never imports the Supabase client or Dexie.
  app/api/ + actions     the only place a credential is held or an RPC is called.
  lib/ + gate/           pure logic, schemas, the offline engine.
  PostgreSQL             RLS, SECURITY DEFINER RPCs, the immutable ledger.
```

Rules:

1. A screen never imports the Supabase client, and never imports Dexie directly.
2. A screen never contains fixture data — no literal name, org or serial.
3. Zod at every boundary: RPC responses, form input, QR payloads, cache reads.
4. No `any`. Database types are generated into `lib/database.types.ts`.
5. A failed write is never silent. No `void` promise that can swallow a throw.
6. Client validation is an affordance. The database enforces the same rule.

## Rendering

| Route | Rendering | Why |
|---|---|---|
| `/` | static | a deliberate dead end. Nothing to discover |
| `/s/[token]` ▢ | `force-dynamic` | quota and status must be current |
| `/p/[passToken]` ▢ | `force-dynamic` | **404, never 403** — a 403 confirms a token exists |
| `/desk/*` ▢ | **all `force-dynamic`** | a cached Control room on 9 Oct showing yesterday's "428 not collected" is worse than a slow one |
| `/gate/*` ▢ | **`force-dynamic`, client** | zero server data; the per-request CSP nonce must reach the App Router bootstrap. The service worker precaches the emitted route responses |

## Route handlers vs server actions

**Route handlers** for anything the outbox drains, anything public, anything
needing an explicit status code — `/api/gate/*`, `/api/s/[token]`, `/api/pass/*`,
CSV export, operator invite.

**Server actions** only for desk mutations that are form-shaped and never queued:
approve, reject, set type, set days, toggle BMS, mint or revoke a token.

> The offline outbox **must not** drain into a server action. A server action ID
> is tied to a build, so a deploy mid-event would 404 every entry a phone queued
> before it. This is the whole reason for the split.

## Deployment

New Vercel project `boa-accreditation`, region `bom1` (Mumbai), domain
`accred.bangaloreopenair.com`.

**Not** a second domain on `boa-bar-control`'s project, as the 29-Aug spec
proposed: that project's `vercel.json` is project-global (SPA catch-all, its own
CSP, a service worker scoped at `/`), so a second domain there would serve the bar
app. Both existing BOA apps are one project each; this is the third.

## What this app is NOT

- Not a PWA (ADR-007). No manifest, no install prompt.
- Not connected to BookMyShow. There is no API; BMS entry is manual and the app
  only tracks the worklist.
- Not the artist portal. Artists are handled at their hotel.
- Not sharing a database with `boa-bar-control` or `boa-stok-form`.
