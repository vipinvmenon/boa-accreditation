# UX-audit screenshot crawl — round 2

Captured by `scripts/ux-crawl.mjs` against a production build (`corepack pnpm build` +
`next start`) with every API mocked via Playwright `page.route()`, exactly as
`scripts/visual-check.mjs` and the `tests/e2e/*` suite already do. No production
Supabase project was contacted at any point: `/p/[passToken]` (a Server Component
calling Supabase in-process) was served by pointing `SUPABASE_URL` at a local
fixture-only PostgREST stub on `:4312` (the same pattern `tests/e2e/pass-page.spec.ts`
uses), and every `https://tjbfvuboyvaephtewjwq.supabase.co/auth/v1/*` call the login
screen makes was intercepted and answered locally. No sign-in ever happened. All
names, phone numbers, orgs and QR codes below are invented fixture data — nothing
here is a real person or a live scannable pass.

Re-run with:

```
corepack pnpm build
SUPABASE_URL=http://127.0.0.1:4312 SUPABASE_SERVICE_ROLE_KEY=e2e-fixture-service-role-key \
  node_modules/.bin/next start -p 4321 &
BASE_URL=http://127.0.0.1:4321 node scripts/ux-crawl.mjs
kill %1   # stop the app server when done — the script stops its own :4312 stub
```

**101 screenshots**, 0 capture failures, 0 pages with horizontal overflow
(`document.documentElement.scrollWidth > innerWidth`, checked on every shot).

## Every shot

| File | Route | State | Viewport | Theme | Mocks / data | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `404-desktop-dark.png` | `/nope` | 404 | desktop | dark | none — /nope has no route, Next's own not-found page |  |
| `404-desktop-light.png` | `/nope` | 404 | desktop | light | none — /nope has no route, Next's own not-found page |  |
| `404-mobile-dark.png` | `/nope` | 404 | mobile | dark | none — /nope has no route, Next's own not-found page |  |
| `404-mobile-light.png` | `/nope` | 404 | mobile | light | none — /nope has no route, Next's own not-found page |  |
| `desk-control-room-500-desktop-dark.png` | `/desk` | desk-control-room-500 | desktop | dark | /api/desk/dashboard mocked to return HTTP 500 |  |
| `desk-control-room-500-mobile-dark.png` | `/desk` | desk-control-room-500 | mobile | dark | /api/desk/dashboard mocked to return HTTP 500 |  |
| `desk-control-room-empty-desktop-dark.png` | `/desk` | desk-control-room-empty | desktop | dark | dashboard fixture with every count zeroed and orgs: [] |  |
| `desk-control-room-empty-mobile-dark.png` | `/desk` | desk-control-room-empty | mobile | dark | dashboard fixture with every count zeroed and orgs: [] |  |
| `desk-control-room-desktop-dark.png` | `/desk` | desk-control-room | desktop | dark | /api/desk/dashboard, /api/desk/operators (scripts/visual-fixtures/desk.mjs) |  |
| `desk-control-room-desktop-light.png` | `/desk` | desk-control-room | desktop | light | /api/desk/dashboard, /api/desk/operators (scripts/visual-fixtures/desk.mjs) |  |
| `desk-control-room-mobile-dark.png` | `/desk` | desk-control-room | mobile | dark | /api/desk/dashboard, /api/desk/operators (scripts/visual-fixtures/desk.mjs) |  |
| `desk-control-room-mobile-light.png` | `/desk` | desk-control-room | mobile | light | /api/desk/dashboard, /api/desk/operators (scripts/visual-fixtures/desk.mjs) |  |
| `desk-master-500-desktop-dark.png` | `/desk/master` | desk-master-500 | desktop | dark | /api/desk/master mocked to return HTTP 500 |  |
| `desk-master-500-mobile-dark.png` | `/desk/master` | desk-master-500 | mobile | dark | /api/desk/master mocked to return HTTP 500 |  |
| `desk-master-empty-desktop-dark.png` | `/desk/master` | desk-master-empty | desktop | dark | { rows: [], total: 0 } |  |
| `desk-master-empty-mobile-dark.png` | `/desk/master` | desk-master-empty | mobile | dark | { rows: [], total: 0 } |  |
| `desk-master-filtered-by-org-desktop-dark.png` | `/desk/master?org=a1111111-1111-4111-8111-111111111111` | desk-master-filtered-by-org | desktop | dark | /api/desk/master honours ?org= and ?in_bms=, 3-person 2-org fixture (MASTER_BY_ORG) |  |
| `desk-master-filtered-by-org-mobile-dark.png` | `/desk/master?org=a1111111-1111-4111-8111-111111111111` | desk-master-filtered-by-org | mobile | dark | /api/desk/master honours ?org= and ?in_bms=, 3-person 2-org fixture (MASTER_BY_ORG) |  |
| `desk-master-desktop-dark.png` | `/desk/master` | desk-master | desktop | dark | /api/desk/master, /api/desk/dashboard, /api/desk/operators (desk.mjs) |  |
| `desk-master-desktop-light.png` | `/desk/master` | desk-master | desktop | light | /api/desk/master, /api/desk/dashboard, /api/desk/operators (desk.mjs) |  |
| `desk-master-mobile-dark.png` | `/desk/master` | desk-master | mobile | dark | /api/desk/master, /api/desk/dashboard, /api/desk/operators (desk.mjs) |  |
| `desk-master-mobile-light.png` | `/desk/master` | desk-master | mobile | light | /api/desk/master, /api/desk/dashboard, /api/desk/operators (desk.mjs) |  |
| `desk-mobile-menu-open-mobile-dark.png` | `/desk` | desk-mobile-menu-open | mobile | dark | desk default fixtures, then the mobile "Menu" burger button clicked open (mobile viewport only — CSS-hidden at desktop width) |  |
| `desk-operator-menu-open-desktop-dark.png` | `/desk` | desk-operator-menu-open | desktop | dark | desk default fixtures, then the "Operator menu" button clicked open |  |
| `desk-operator-menu-open-desktop-light.png` | `/desk` | desk-operator-menu-open | desktop | light | desk default fixtures, then the "Operator menu" button clicked open |  |
| `desk-operator-menu-open-mobile-dark.png` | `/desk` | desk-operator-menu-open | mobile | dark | desk default fixtures, then the "Operator menu" button clicked open |  |
| `desk-operator-menu-open-mobile-light.png` | `/desk` | desk-operator-menu-open | mobile | light | desk default fixtures, then the "Operator menu" button clicked open |  |
| `desk-orgs-500-desktop-dark.png` | `/desk/orgs` | desk-orgs-500 | desktop | dark | /api/desk/orgs mocked to return HTTP 500 |  |
| `desk-orgs-500-mobile-dark.png` | `/desk/orgs` | desk-orgs-500 | mobile | dark | /api/desk/orgs mocked to return HTTP 500 |  |
| `desk-orgs-empty-desktop-dark.png` | `/desk/orgs` | desk-orgs-empty | desktop | dark | { orgs: [] } |  |
| `desk-orgs-empty-mobile-dark.png` | `/desk/orgs` | desk-orgs-empty | mobile | dark | { orgs: [] } |  |
| `desk-orgs-desktop-dark.png` | `/desk/orgs` | desk-orgs | desktop | dark | /api/desk/orgs (2-org fixture), /api/desk/dashboard, /api/desk/operators |  |
| `desk-orgs-desktop-light.png` | `/desk/orgs` | desk-orgs | desktop | light | /api/desk/orgs (2-org fixture), /api/desk/dashboard, /api/desk/operators |  |
| `desk-orgs-mobile-dark.png` | `/desk/orgs` | desk-orgs | mobile | dark | /api/desk/orgs (2-org fixture), /api/desk/dashboard, /api/desk/operators |  |
| `desk-orgs-mobile-light.png` | `/desk/orgs` | desk-orgs | mobile | light | /api/desk/orgs (2-org fixture), /api/desk/dashboard, /api/desk/operators |  |
| `desk-passes-500-desktop-dark.png` | `/desk/passes` | desk-passes-500 | desktop | dark | /api/desk/passes mocked to return HTTP 500 |  |
| `desk-passes-500-mobile-dark.png` | `/desk/passes` | desk-passes-500 | mobile | dark | /api/desk/passes mocked to return HTTP 500 |  |
| `desk-passes-empty-desktop-dark.png` | `/desk/passes` | desk-passes-empty | desktop | dark | { passes: [] } |  |
| `desk-passes-empty-mobile-dark.png` | `/desk/passes` | desk-passes-empty | mobile | dark | { passes: [] } |  |
| `desk-passes-desktop-dark.png` | `/desk/passes` | desk-passes | desktop | dark | /api/desk/passes, /api/desk/passes/send, /api/desk/dashboard, /api/desk/operators (desk.mjs passesFor()) |  |
| `desk-passes-desktop-light.png` | `/desk/passes` | desk-passes | desktop | light | /api/desk/passes, /api/desk/passes/send, /api/desk/dashboard, /api/desk/operators (desk.mjs passesFor()) |  |
| `desk-passes-mobile-dark.png` | `/desk/passes` | desk-passes | mobile | dark | /api/desk/passes, /api/desk/passes/send, /api/desk/dashboard, /api/desk/operators (desk.mjs passesFor()) |  |
| `desk-passes-mobile-light.png` | `/desk/passes` | desk-passes | mobile | light | /api/desk/passes, /api/desk/passes/send, /api/desk/dashboard, /api/desk/operators (desk.mjs passesFor()) |  |
| `desk-users-500-desktop-dark.png` | `/desk/users` | desk-users-500 | desktop | dark | /api/desk/operators mocked to return HTTP 500 |  |
| `desk-users-500-mobile-dark.png` | `/desk/users` | desk-users-500 | mobile | dark | /api/desk/operators mocked to return HTTP 500 |  |
| `desk-users-empty-desktop-dark.png` | `/desk/users` | desk-users-empty | desktop | dark | { operators: [] } |  |
| `desk-users-empty-mobile-dark.png` | `/desk/users` | desk-users-empty | mobile | dark | { operators: [] } |  |
| `desk-users-desktop-dark.png` | `/desk/users` | desk-users | desktop | dark | /api/desk/operators, /api/desk/dashboard |  |
| `desk-users-desktop-light.png` | `/desk/users` | desk-users | desktop | light | /api/desk/operators, /api/desk/dashboard |  |
| `desk-users-mobile-dark.png` | `/desk/users` | desk-users | mobile | dark | /api/desk/operators, /api/desk/dashboard |  |
| `desk-users-mobile-light.png` | `/desk/users` | desk-users | mobile | light | /api/desk/operators, /api/desk/dashboard |  |
| `error-boundary-desktop-dark.png` | `/desk/orgs` | error-boundary | desktop | dark | /api/desk/orgs mocked with a malformed 200 ({}) to trigger a real render throw, caught by app/error.tsx | /desk/orgs reads `body.orgs` with no Zod parse (app/desk/orgs/orgs-screen.tsx); a malformed 200 ({}) leaves `orgs` undefined and `orgs.length` throws at render, which app/error.tsx catches. This is also a real bug (non-negotiable #8: "Zod at every boundary") — see README. |
| `error-boundary-desktop-light.png` | `/desk/orgs` | error-boundary | desktop | light | /api/desk/orgs mocked with a malformed 200 ({}) to trigger a real render throw, caught by app/error.tsx | /desk/orgs reads `body.orgs` with no Zod parse (app/desk/orgs/orgs-screen.tsx); a malformed 200 ({}) leaves `orgs` undefined and `orgs.length` throws at render, which app/error.tsx catches. This is also a real bug (non-negotiable #8: "Zod at every boundary") — see README. |
| `error-boundary-mobile-dark.png` | `/desk/orgs` | error-boundary | mobile | dark | /api/desk/orgs mocked with a malformed 200 ({}) to trigger a real render throw, caught by app/error.tsx | /desk/orgs reads `body.orgs` with no Zod parse (app/desk/orgs/orgs-screen.tsx); a malformed 200 ({}) leaves `orgs` undefined and `orgs.length` throws at render, which app/error.tsx catches. This is also a real bug (non-negotiable #8: "Zod at every boundary") — see README. |
| `error-boundary-mobile-light.png` | `/desk/orgs` | error-boundary | mobile | light | /api/desk/orgs mocked with a malformed 200 ({}) to trigger a real render throw, caught by app/error.tsx | /desk/orgs reads `body.orgs` with no Zod parse (app/desk/orgs/orgs-screen.tsx); a malformed 200 ({}) leaves `orgs` undefined and `orgs.length` throws at render, which app/error.tsx catches. This is also a real bug (non-negotiable #8: "Zod at every boundary") — see README. |
| `gate-empty-cache-desktop-dark.png` | `/gate` | gate-empty-cache | desktop | dark | no Dexie seeding at all; session mocked; /api/gate/pull mocked 503 -> boot pull fails, retry state shown | No Dexie seeding at all: online, session mocked, /api/gate/pull mocked 503 — the boot pull fails and the retry error state renders. |
| `gate-empty-cache-mobile-dark.png` | `/gate` | gate-empty-cache | mobile | dark | no Dexie seeding at all; session mocked; /api/gate/pull mocked 503 -> boot pull fails, retry state shown | No Dexie seeding at all: online, session mocked, /api/gate/pull mocked 503 — the boot pull fails and the retry error state renders. |
| `gate-offline-desktop-dark.png` | `/gate` | gate-offline | desktop | dark | roster seeded, then context.setOffline(true) before reload; /api/gate/pull+issue still mocked 503 | Roster seeded, then context.setOffline(true) before reload — status line reads "Offline | N queued". |
| `gate-offline-mobile-dark.png` | `/gate` | gate-offline | mobile | dark | roster seeded, then context.setOffline(true) before reload; /api/gate/pull+issue still mocked 503 | Roster seeded, then context.setOffline(true) before reload — status line reads "Offline | N queued". |
| `gate-operator-menu-open-desktop-dark.png` | `/gate` | gate-operator-menu-open | desktop | dark | gate default fixtures/seed, then the "Operator menu" button clicked open |  |
| `gate-operator-menu-open-mobile-dark.png` | `/gate` | gate-operator-menu-open | mobile | dark | gate default fixtures/seed, then the "Operator menu" button clicked open |  |
| `gate-vehicle-desktop-dark.png` | `/gate/vehicle` | gate-vehicle | desktop | dark | same as gate, plus a seeded sticker record for the vehicle flow |  |
| `gate-vehicle-desktop-light.png` | `/gate/vehicle` | gate-vehicle | desktop | light | same as gate, plus a seeded sticker record for the vehicle flow |  |
| `gate-vehicle-mobile-dark.png` | `/gate/vehicle` | gate-vehicle | mobile | dark | same as gate, plus a seeded sticker record for the vehicle flow |  |
| `gate-vehicle-mobile-light.png` | `/gate/vehicle` | gate-vehicle | mobile | light | same as gate, plus a seeded sticker record for the vehicle flow |  |
| `gate-desktop-dark.png` | `/gate` | gate | desktop | dark | /api/gate/session (issuer), /api/gate/pull+issue mocked 503, Dexie roster/ledger/outbox seeded (40 people) |  |
| `gate-desktop-light.png` | `/gate` | gate | desktop | light | /api/gate/session (issuer), /api/gate/pull+issue mocked 503, Dexie roster/ledger/outbox seeded (40 people) |  |
| `gate-mobile-dark.png` | `/gate` | gate | mobile | dark | /api/gate/session (issuer), /api/gate/pull+issue mocked 503, Dexie roster/ledger/outbox seeded (40 people) |  |
| `gate-mobile-light.png` | `/gate` | gate | mobile | light | /api/gate/session (issuer), /api/gate/pull+issue mocked 503, Dexie roster/ledger/outbox seeded (40 people) |  |
| `login-default-desktop-dark.png` | `/desk/login` | login-default | desktop | dark | auth/v1/user mocked 401 (no session), auth/v1/token always mocked (never forwarded) |  |
| `login-default-desktop-light.png` | `/desk/login` | login-default | desktop | light | auth/v1/user mocked 401 (no session), auth/v1/token always mocked (never forwarded) |  |
| `login-default-mobile-dark.png` | `/desk/login` | login-default | mobile | dark | auth/v1/user mocked 401 (no session), auth/v1/token always mocked (never forwarded) |  |
| `login-default-mobile-light.png` | `/desk/login` | login-default | mobile | light | auth/v1/user mocked 401 (no session), auth/v1/token always mocked (never forwarded) |  |
| `login-error-desktop-dark.png` | `/desk/login` | login-error | desktop | dark | same, plus a submitted sign-in mocked to auth/v1/token -> 400 invalid_grant |  |
| `login-error-desktop-light.png` | `/desk/login` | login-error | desktop | light | same, plus a submitted sign-in mocked to auth/v1/token -> 400 invalid_grant |  |
| `login-error-mobile-dark.png` | `/desk/login` | login-error | mobile | dark | same, plus a submitted sign-in mocked to auth/v1/token -> 400 invalid_grant |  |
| `login-error-mobile-light.png` | `/desk/login` | login-error | mobile | light | same, plus a submitted sign-in mocked to auth/v1/token -> 400 invalid_grant |  |
| `orgfilter-1-filtered-desktop-dark.png` | `/desk/master?org=a1111111-1111-4111-8111-111111111111` | orgfilter-1-filtered | desktop | dark | see "Org-filter walkthrough" below | Step 2 of the org-filter walkthrough — see README. |
| `orgfilter-1-filtered-mobile-dark.png` | `/desk/master?org=a1111111-1111-4111-8111-111111111111` | orgfilter-1-filtered | mobile | dark | see "Org-filter walkthrough" below |  |
| `orgfilter-2-cleared-via-show-everyone-desktop-dark.png` | `/desk/master` | orgfilter-2-cleared | desktop | dark | see "Org-filter walkthrough" below |  |
| `orgfilter-3-both-filters-active-desktop-dark.png` | `/desk/master?org=a1111111-1111-4111-8111-111111111111&in_bms=false` | orgfilter-3-both-filters | desktop | dark | see "Org-filter walkthrough" below |  |
| `pass-aaa-desktop-dark.png` | `/p/uxAaaPassToken00000000` | pass-aaa | desktop | dark | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> aaa-tier fixture |  |
| `pass-aaa-desktop-light.png` | `/p/uxAaaPassToken00000000` | pass-aaa | desktop | light | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> aaa-tier fixture |  |
| `pass-aaa-mobile-dark.png` | `/p/uxAaaPassToken00000000` | pass-aaa | mobile | dark | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> aaa-tier fixture |  |
| `pass-aaa-mobile-light.png` | `/p/uxAaaPassToken00000000` | pass-aaa | mobile | light | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> aaa-tier fixture |  |
| `pass-crew-desktop-dark.png` | `/p/uxCrewPassToken0000000` | pass-crew | desktop | dark | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> crew-tier fixture |  |
| `pass-crew-desktop-light.png` | `/p/uxCrewPassToken0000000` | pass-crew | desktop | light | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> crew-tier fixture |  |
| `pass-crew-mobile-dark.png` | `/p/uxCrewPassToken0000000` | pass-crew | mobile | dark | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> crew-tier fixture |  |
| `pass-crew-mobile-light.png` | `/p/uxCrewPassToken0000000` | pass-crew | mobile | light | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> crew-tier fixture |  |
| `pass-invalid-desktop-dark.png` | `/p/not-a-real-token` | pass-invalid | desktop | dark | malformed token shape — rejected by passTokenParamSchema before any RPC call, stub never hit | Malformed shape — rejected by passTokenParamSchema before any RPC call. |
| `pass-invalid-desktop-light.png` | `/p/not-a-real-token` | pass-invalid | desktop | light | malformed token shape — rejected by passTokenParamSchema before any RPC call, stub never hit | Malformed shape — rejected by passTokenParamSchema before any RPC call. |
| `pass-invalid-mobile-dark.png` | `/p/not-a-real-token` | pass-invalid | mobile | dark | malformed token shape — rejected by passTokenParamSchema before any RPC call, stub never hit | Malformed shape — rejected by passTokenParamSchema before any RPC call. |
| `pass-invalid-mobile-light.png` | `/p/not-a-real-token` | pass-invalid | mobile | light | malformed token shape — rejected by passTokenParamSchema before any RPC call, stub never hit | Malformed shape — rejected by passTokenParamSchema before any RPC call. |
| `pass-stage-desktop-dark.png` | `/p/uxStagePassToken000000` | pass-stage | desktop | dark | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> stage-tier fixture |  |
| `pass-stage-desktop-light.png` | `/p/uxStagePassToken000000` | pass-stage | desktop | light | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> stage-tier fixture |  |
| `pass-stage-mobile-dark.png` | `/p/uxStagePassToken000000` | pass-stage | mobile | dark | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> stage-tier fixture |  |
| `pass-stage-mobile-light.png` | `/p/uxStagePassToken000000` | pass-stage | mobile | light | fixture-only PostgREST stub on :4312, boa_acc_pass_view -> stage-tier fixture |  |
| `pass-voided-desktop-dark.png` | `/p/uxVoidedPassToken00000` | pass-voided | desktop | dark | stub returns 400 not-found for a valid-shaped token absent from the fixture map (same response as unknown) | Same "not valid" response as an unknown token — boa_acc_pass_view intentionally does not distinguish (docs/SECURITY.md). |
| `pass-voided-desktop-light.png` | `/p/uxVoidedPassToken00000` | pass-voided | desktop | light | stub returns 400 not-found for a valid-shaped token absent from the fixture map (same response as unknown) | Same "not valid" response as an unknown token — boa_acc_pass_view intentionally does not distinguish (docs/SECURITY.md). |
| `pass-voided-mobile-dark.png` | `/p/uxVoidedPassToken00000` | pass-voided | mobile | dark | stub returns 400 not-found for a valid-shaped token absent from the fixture map (same response as unknown) | Same "not valid" response as an unknown token — boa_acc_pass_view intentionally does not distinguish (docs/SECURITY.md). |
| `pass-voided-mobile-light.png` | `/p/uxVoidedPassToken00000` | pass-voided | mobile | light | stub returns 400 not-found for a valid-shaped token absent from the fixture map (same response as unknown) | Same "not valid" response as an unknown token — boa_acc_pass_view intentionally does not distinguish (docs/SECURITY.md). |

## What could not be captured, and why

- **Nothing was skipped outright.** Every route and state the brief asked for has
  at least one screenshot.
- **`/desk/login` inline error** — captured as asked (`login-error-*`), by mocking
  the Supabase Auth token endpoint to return `400 invalid_grant` after a real form
  submission, never touching production.
- **The error page (`app/error.tsx`)** — captured (`error-boundary-*`), but not by
  a mocked 500. Every screen in this app that already validates its response with
  Zod (master, passes, users, control room) turns a 500 into an inline `InlineError`
  component, never a thrown render — so a mocked 500 never reaches `app/error.tsx`
  on any of those screens. `/desk/orgs` is the one screen that does **not** Zod-parse
  its response (see the bug below), so a malformed **200** (`{}`) is what actually
  reaches a `throw` during render. This is a real way the error boundary fires in
  production, not a synthetic shortcut — see "Bugs found" below.
- **Vehicle screen state** — captured at its idle/just-loaded state (plate field
  empty), not mid-flow. The brief only asked for "the route," and this is the state
  an officer actually sees on arrival.
- **`/gate` scan result (green/amber/red)** — not captured. Reaching it means typing
  into `aria-label="Pass-code input for hardware scanner"` and pressing Enter; the
  brief's required shots are the route itself and the offline/empty-cache states,
  all of which this covers. Noted here rather than silently adding scope.
- **A "successful" desk login** — deliberately never produced. There is no fixture
  state where `signInWithPassword` succeeds; every `auth/v1/token` request in this
  crawl is intercepted and answered with a 400, on purpose, so this script can never
  accidentally send a real credential-shaped request anywhere.

## Console errors and failed requests, per route

`docs/ux-audit/screens-r2/manifest.json`'s `consoleFindings` has the raw list per
capture. After filtering out noise, here is what is left:

**Not a bug — Next.js prefetch aborts.** The overwhelming majority of "console
errors" (client-side `Link` prefetch requests carrying `?_rsc=...`) are
`net::ERR_ABORTED`, logged because this script closes each Playwright page right
after its screenshot, cancelling any in-flight prefetch the desk/gate navigation
chrome kicked off. These appear on almost every desk/gate route and are an artifact
of the crawl closing pages quickly, not a defect in the app.

**Expected — this script's own mocked failures.** The 500/503/400/404 responses
logged as "Failed to load resource" on `desk-*-500-*`, `gate-offline-*`,
`gate-empty-cache-*`, `login-error-*` and the pass-page not-found states are the
fixtures this script installed on purpose, to capture those UI states.

**Two genuine, unprompted findings:**

1. **CSP violations on the static 404 page (`404-*.png`).** `/nope` (Next's
   `_not-found`, built as `○ Static` per the build output) logs real browser
   console errors independent of any mock:
   ```
   Loading the script '.../_next/static/chunks/<hash>.js' violates the following
   Content Security Policy directive: "script-src 'self' 'nonce-<n>' 'strict-dynamic'
   'wasm-unsafe-eval'"...
   Executing inline script violates the following Content Security Policy
   directive 'script-src ...'...
   ```
   `middleware.ts` (lines 3–22) generates a **fresh random nonce per request**
   (`crypto.randomUUID()`) and sets it on both the request header and the
   `Content-Security-Policy` response header. That works for every dynamically
   rendered route, because the nonce baked into that response's own HTML always
   matches that same response's CSP header. `/_not-found` is different: it is
   pre-rendered once at **build time** (the `○` in `next build`'s route table), so
   the nonce baked into its static HTML is fixed forever, while the CSP header
   middleware attaches on each live request carries a brand-new nonce every time —
   the two can never match. The visible symptom here is cosmetic (the page still
   renders correctly, screenshots included), but the console shows real script
   loads being blocked by the browser, which is worth a look if the 404 page is
   ever given its own interactive behaviour.
2. **`/desk/orgs` has no runtime validation of its own API response — a real
   non-negotiable-#8 violation.** See "Bugs found" below; this is what
   `error-boundary-*.png` demonstrates.

Everything else in `consoleFindings` traces to one of the two "not a bug" /
"expected" categories above.

## The org-filter walkthrough (ADR-021 / ACC-152 / ACC-154)

Full step log in `org-filter-walkthrough.json`. Summary:

| Step | Action | Resulting URL | Result |
| --- | --- | --- | --- |
| 1 | Load `/desk/orgs` | `/desk/orgs` | Loads; no people listed (ADR-021: orgs screen is read-only, no roster). |
| 2 | Click the "Chakra Sound & Light" row | `/desk/master?org=<id>` | Master list opens filtered to that company. Screenshot: `orgfilter-1-filtered-{desktop,mobile}-dark.png`. |
| 3 | Look for a "Show everyone" banner | — | Present: `role="status"` banner reads "Showing Chakra Sound & Light only" with a "Show everyone" link (this is `master-screen.tsx:144-176`). |
| 4 | Click "Show everyone" | `/desk/master` | Filter fully cleared. Screenshot: `orgfilter-2-cleared-via-show-everyone-desktop-dark.png`. |
| 5 | Re-filter (`?org=<id>`), then click the "Master list" nav item in the header | `/desk/master` | Filter cleared — the nav `Link`'s `href` is the bare `/desk/master` (`app/desk/desk-chrome.tsx:255`, `DESK_NAV` in `lib/design.ts:174-180`), so it always drops any query string. This works, but nothing labels it as a "clear filters" action — an operator would have to already know that clicking a nav tab resets filters. |
| 6 | Type into the search box while org-filtered | `/desk/master?org=<id>` (unchanged) | The org filter is untouched, as expected — `query` is local React state, not reflected in the URL, and combines with `org` rather than replacing it (`master-screen.tsx:36-43`). |
| 7 | With **both** `?org=<id>&in_bms=false` active, look for any control that clears just one filter | `/desk/master?org=<id>&in_bms=false` | **Zero** such controls exist. The only escape hatch is the single "Show everyone" link, which clears both `org` and `in_bms` together in one click (`master-screen.tsx:174`, and `masterFilterSummary()` in `lib/format.ts:80-126`, which always renders one combined banner + one combined link, never a per-filter chip). Screenshot: `orgfilter-3-both-filters-active-desktop-dark.png`. |

**Verdict:** clearing the filter is not broken — "Show everyone" and the plain
nav link both work correctly, confirming the ACC-152/ACC-154 fixes described in
`docs/CURRENT-STATE.md` hold up. The actual gap is **granularity and
discoverability**: there is no per-filter chip (e.g. an "×" next to "Sound"
specifically), so an operator who wants to drop only the BMS filter while keeping
the org filter (or vice versa) cannot — they must clear both and reapply one, or
hand-edit the URL. `master-screen.tsx:34` (`orgFilter`) and `:27-28` (`bmsFilter`)
read independently from `searchParams`, so the data model already supports
clearing them independently; only the UI (`masterFilterSummary`/the one banner
link) does not expose that. This is a UX-polish finding, not a functional defect —
worth an ADR/ROADMAP entry for per-filter chips, not a hotfix.

*(While building this fixture, an early version of this crawl script's own mock
ignored `in_bms` when `org` was also set, which would have produced a misleading
screenshot showing an "IN BMS" person under a "not yet in BMS" banner. Caught and
fixed before capture — noted here only so a future re-run of this script doesn't
reintroduce it in `installDeskFixtures`'s `masterByOrg` branch.)*

## Bugs found

1. **`/desk/orgs` never validates its own API response (non-negotiable #8: "Zod at
   every boundary").** `app/desk/orgs/orgs-screen.tsx`:
   ```ts
   const body = (await res.json()) as { orgs: OrgRowWithCounts[] }   // a cast, not a parse
   setOrgs(body.orgs)
   ```
   Every other desk screen (`master-screen.tsx`, `passes-screen.tsx` via its own
   schemas) runs `schema.safeParse()` on its fetch response before touching state.
   `orgs-screen.tsx` does not. If the API ever returns a 200 with an unexpected
   shape (`{}`, `{ orgs: null }`, a proxy/CDN error page served with a 200, etc.),
   `orgs` becomes `undefined`. The render guard on line ~195,
   `{orgs !== null && orgs.length === 0 && (...)}`, then evaluates
   `orgs.length` on `undefined` (since `undefined !== null`) and throws
   `TypeError: Cannot read properties of undefined (reading 'length')`, caught by
   `app/error.tsx`. Reproduced live for this crawl (`error-boundary-*.png`) by
   mocking `GET /api/desk/orgs` to return `{}`. Fix: `orgRowWithCountsSchema.array().safeParse(body.orgs)` before `setOrgs`, matching every sibling screen.
2. **CSP nonce mismatch on the statically-prerendered 404 page.** See the console
   findings section above — `middleware.ts`'s per-request nonce can never match
   `/_not-found`'s build-time-baked HTML. Currently cosmetic (no visible breakage)
   but is a real, reproducible browser-console error on every 404 hit in
   production.
3. **No per-filter clear control on `/desk/master`.** See the org-filter
   walkthrough above — not a functional bug (both existing "clear" paths work),
   but a discoverability/granularity gap worth a backlog entry.

No layout bugs were found: **0 of 101 screenshots showed horizontal overflow**
(`document.documentElement.scrollWidth > innerWidth`, measured on every capture,
recorded in `manifest.json`), and dark/light both rendered correctly on every
screen visually reviewed. One minor cosmetic observation, not treated as a bug:
on `/gate` at 390px, the "N approved passes held on this device" line and the
`SyncStatus` "not synced yet" line sit very close together (`SyncStatus`'s
`top={-16}` offset in `app/gate/page.tsx:343`), which looks tight but does not
overlap or clip in any capture.

## Files in this directory

- `*.png` — the 101 screenshots, named `<state>-<viewport>-<theme>.png`.
- `manifest.json` — machine-readable record of every capture: route, state,
  viewport, theme, HTTP status, overflow measurement, console-error count, and
  any note.
- `org-filter-walkthrough.json` — the raw step-by-step log behind the table above.
