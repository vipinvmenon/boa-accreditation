# Current state

**Read this first, every session. Do not trust any other document over it.**
If you cannot verify a claim here, say so plainly rather than removing it.

_Last updated: 12 September 2026 (tenth update)._

## In one line

Phase 0 (foundation) is complete. **The schema, the public-surface RPCs, the
`/api/s/[token]` route and the real Submission screen are live** — mint,
org_view, submit, quota lock, per-token throttle, the register-your-crew UI —
verified by `corepack pnpm test:db`, `corepack pnpm db:state` and real curl /
browser sessions against production and the live database, not asserted.
`anon` still has zero grants. `test:visual` on Submission is not a pass yet
(ADR-009 — see below); `/desk/*` and `/gate/*` are still empty (ACC-026+).

**The app is deployed** at
[accred.bangaloreopenair.com](https://accred.bangaloreopenair.com)
(`bom1`). Supabase project `tjbfvuboyvaephtewjwq` has 8 migrations applied.

## Dates

| | |
|---|---|
| Links out to 38 vendor companies | **Sun 20 Sep 2026** — hard, no slack |
| Gate must work | **Sun 4 Oct 2026** |
| Build days | 5–9 Oct 2026 |
| Show day | **10 Oct 2026** |

## What is actually true right now

Verified on 10 Sep by running the commands, not by assertion:

- `corepack pnpm typecheck` — green.
- `corepack pnpm lint` — green. 30 theme tokens and 11 prop colours proven
  byte-identical to `design/source/boa_design_body.html`; all declared font
  weights proven imported.
- `corepack pnpm build` — green. 3 static routes: `/`, `/_not-found`, plus the
  error boundary.
- Fonts confirmed loading **by real family name** in a real browser
  (`Anton, sans-serif` resolves; `--grn` is `#00f5a5`; body is `#0A0A0A`). This
  was the whole reason for choosing `@fontsource` over `next/font` — see
  DESIGN-SYSTEM.md.
- `scripts/extract-assets.mjs` recovers the logo (1008×360) and the Control room
  poster (1122×1402) from the design bundle. Both verified real PNGs.
- `scripts/build-gate-sw.mjs` runs and emits a 27-entry precache (~622 KB).
- `corepack pnpm test` — 13 tests green (`tests/unit/design-contract.test.ts`).
- **The design gates were mutation-tested, not assumed.** Reordering two zones
  fails the suite; "reconciling" the two colour layers fails both the suite and
  the lint gate.
- **CI is green on GitHub** (run 34515651290, both jobs). The whole chain was
  also verified inside a real `git clone`, not only in the working tree.

## What does NOT exist yet

- **No public or desk screens.** `/s/[token]`, `/desk/*`, `/gate/*` are empty.
  ACC-024 is next: the route handler that calls `boa_acc_org_view` / `boa_acc_submit`.
- **No `lib/database.types.ts`** — still generated from the live project, not committed.
- **No e2e / aeroplane-mode suite.** Playwright is installed but unconfigured.
- **`test:visual`** still reports `NOTHING COMPARED — no screen is built yet`.
- **Cursor MCP is only half-connected.** The Vercel *plugin* authenticated in
  this session (`plugin-vercel-vercel` tools loaded). `list_teams` returned
  `[]` and `list_projects` on `team_rDgA7v4RmDHjA3gFRapQoccp` failed — this
  login cannot see the BOA team. Project servers from `.mcp.json` /
  `.cursor/mcp.json` (`supabase`, `github`, `playwright`) are **not** in this
  chat's tool catalog. **ACC-009b stays open.** Not ticked.

## Supabase org — different from the siblings, Vercel is not

Corrected 11 Sep after linking. The earlier note said both platforms differed;
**Vercel was wrong.**

| | boa-accreditation | the two siblings |
|---|---|---|
| Supabase org | `otlqwoxbrsshuoebbamj` | `skbbvwdfpyyfpbvngkgh` (`vipinvmenon's Org`) |
| Vercel team | `team_rDgA7v4RmDHjA3gFRapQoccp` | **same team** ✅ |

The `vipin-menon` slug in the Vercel dashboard URL merely looks personal; the
linked `orgId` is the shared team. Only the **Supabase org** differs. That is
worth a decision — a second person cannot be added to a project they cannot
see, and Bhoopesh, Salman and two approvers all need access — but it is one
thing to move, not two.

## Blocked on the user

These cannot proceed without Vipin, and Phase 1 cannot start without the first:

1. **Supabase — DONE except the database URL.** ✅ Keys in `.env.local` and in
   Vercel (15 vars across 3 environments), project linked, self-registration
   closed. Remaining: `SUPABASE_DB_URL` into GitHub Actions secrets — you
   already have the value, it is set in Vercel. One command:
   ```
   export SUPABASE_DB_URL='<the value you put in Vercel>'
   corepack pnpm bootstrap
   ```

<details><summary>Superseded — the original three items</summary>
   - **`.env.local`** — the project's anon key and service-role key. The URL is
     already filled into `.env.example`. Without these the app cannot talk to
     the database at all, MCP access notwithstanding: the MCP server is a tool
     *I* use, it is not the application's credential.
   - **Authenticate the MCP server.** `.mcp.json` is committed, but the server
     is unauthenticated and shows `⏸ Pending approval`. This needs an
     interactive terminal — see the note below.
   - **`SUPABASE_DB_URL`** in the repo's GitHub Actions secrets, or CI goes red
     on 20 Sep when the dated grace period expires.
</details>
2. **Vercel — project created and deploying ✅.** Two loose ends:
   - **The CLI is not linked** (`.vercel/project.json` is absent) and the CLI
     token on this machine is expired (`invalidToken`). Not blocking — deploys
     go through the GitHub integration — but `vercel env pull` and `vercel logs`
     will not work until someone runs `corepack pnpm vercel login && corepack
     pnpm vercel link`.
   - **The project sits under the `vipin-menon` scope**, whereas
     boa-bar-control and boa-stok-form are under team
     `team_rDgA7v4RmDHjA3gFRapQoccp`. Worth confirming that is intended —
     billing, access and env vars are per-scope.
   - **Environment variables are not set in Vercel.** The deployed build has no
     Supabase credentials, so it can only serve the static dead-end page.
3. **The 38 organisations** — names, kinds, quotas, contact names and phones.
   Needed by 17 Sep for Phase 2.
4. **Email addresses** for Bhoopesh, Salman and the two approvers.

## Production, verified 11 Sep

Checked against the live site rather than assumed:

| | |
|---|---|
| `accred.bangaloreopenair.com` | 200, our app, `x-vercel-id: bom1::…` |
| `boa-accreditation.vercel.app` | 200, same build |
| Security headers | all five present (`nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY`, HSTS, `Permissions-Policy` with `camera=(self)`) |
| `x-powered-by` | absent — `poweredByHeader: false` took effect |
| `/s/*`, `/p/*` | `X-Robots-Tag: noindex, nofollow` (they 404 — no routes yet) |
| `/gate/sw.js` | `Service-Worker-Allowed: /gate/`, `Cache-Control: no-cache` |

**A real bug was found and fixed by this check.** The generated service worker
was precaching `/gate`, `/gate/vehicle` and `/gate/setup` — routes that do not
exist yet — and all three 404 in production. `caches.addAll()` is
all-or-nothing, so a single 404 rejects the whole install and the service worker
never activates. Listing an unbuilt route was therefore not a harmless
placeholder, it was a switch that silently turns the offline gate off.
`build-gate-sw.mjs` now reads the prerender manifest and precaches only routes
Next actually emitted, and **fails the build** if some gate routes exist and
others do not.

Nothing registers the service worker yet, so this had no live effect — but it
would have surfaced in Phase 4 as "offline just doesn't work", which is the
worst week to debug it.

## The Supabase MCP server — configured, NOT yet authenticated

`.mcp.json` is committed and points at project `tjbfvuboyvaephtewjwq` with the
docs, account, database, debugging, development, functions and branching
features. `claude mcp list` currently reports `⏸ Pending approval`.

**Authentication cannot be done from an IDE-hosted or non-interactive session** —
it is an OAuth flow. Vipin needs to run, in a regular terminal, from this
directory:

```
claude          # approve the project-scoped server when prompted
/mcp            # select `supabase`, then Authenticate
```

Until that is done, no agent can query the database through MCP. This does not
block writing migrations — SQL can be written and reviewed offline — but it does
block verifying them against the real project, and `db:state` has nothing to ask.

Two Supabase Agent Skills are also installed under `.agents/skills/`
(`supabase`, `supabase-postgres-best-practices`), symlinked into `.claude/skills/`
with relative links so they are portable. Both were reviewed before being
committed: they are documentation only — no scripts, no hooks, nothing
executable. Their privileges guidance (`revoke all on all tables in schema
public from public`) is consistent with ADR-004.

## The database CI job, and its expiry date

The `database` job is **required, not advisory**. It currently skips, because
there is no database — but the exception is **dated and expires itself**: from
**20 Sep 2026** a missing `SUPABASE_DB_URL` secret fails the build.

This is deliberate. bar-control shipped the same job with `continue-on-error:
true` and a "FLIP THIS TO REQUIRED" comment that was still there weeks later,
so its pgTAP suite never gated anything. Nobody here has to remember to flip
anything; the calendar does it.

**Action:** once ACC-009 lands, add `SUPABASE_DB_URL` to the repo's Actions
secrets. After 20 Sep, CI goes red without it.

## Picking this up in Cursor or Codex

Run `corepack pnpm task`. It reads `docs/ROADMAP.md` and prints what is in
flight, what is next, and what is blocked on a human. Then read this file.

If a task shows `[~]` IN FLIGHT, somebody stopped mid-way — `git log` and
`git diff` show how far. Pick it up rather than starting something new.

Full protocol: `docs/TOOLING.md` → "Handing off between agents".

## What the database actually contains

Run `corepack pnpm db:state`. As of 11 Sep (after ACC-023):

- 10 `boa_acc_` tables; migrations `202609110001`–`202609110008` applied.
  Witnesses all YES.
- `boa_acc_type` holds the 3 design types; every other table is empty
  (token-suite leftovers wiped; `auth.users` 0).
- Public RPCs: `boa_acc_mint_invite` (EXECUTE `authenticated` only),
  `boa_acc_org_view` and `boa_acc_submit` (EXECUTE `service_role` only).
  `anon`: **0 table grants, 0 function grants.**
- `auth.users`: 0 — nobody has been invited yet (ACC-026).

Verified by attempting the thing, not by reading a grant table:

| Attempt | Result |
|---|---|
| anon `GET /rest/v1/boa_acc_person` | `401` / `42501` |
| anon `POST /rest/v1/boa_acc_org` | `401` / `42501` |
| authenticated `select pass_token` | refused, `42501` |
| authenticated `select *` on person | refused — because `*` includes `pass_token` |
| authenticated `select full_name` | allowed |
| `update`/`delete` on the ledger, **as table owner** | refused, `55000` |
| 8 CHECK constraints, each violated on purpose | all refused, `23514` |

## Session log

### 12 Sep 2026 — ACC-025: the Submission screen, real data, one recorded gap

- **`app/s/[token]/page.tsx` + `submission-screen.tsx`** — the first real screen.
  Server component fetches `GET /api/s/[token]` (same-origin, via `headers()`,
  never the Supabase client directly — ARCHITECTURE.md rule 1) and calls
  `notFound()` on a miss, reusing the existing global 404. The client
  component holds the form, POSTs to the same route, and updates the quota
  bar and "Your list" from the real response — no fixture data.
- **ADR-009 (docs/DECISIONS.md): the desk chrome does not ship on public
  screens.** The approved reference screenshot wraps every screen in the
  design bundle's own nav+status bar (logo, "Accred desk" links to
  `/desk/*`, live BMS numbers). Confirmed with the user this is
  review-bundle furniture, the same category as the WEB/MOB/LIGHT toggle
  DESIGN-SYSTEM.md already excludes — a public invite-token link must not
  show desk navigation or ops data. `scripts/capture-design-reference.mjs`
  now hides that bar (`PUBLIC_SCREENS`) before capturing Submission's
  reference, so the reference matches what actually ships.
- **"Your list" is session-only** (plain React state, resets on reload) —
  confirmed with the user rather than guessed. `boa_acc_org_view` returns
  counts only, never names, and no RPC exists to hand an anonymous token
  holder the org's roster; building one was explicitly declined for now
  (privacy scope, not a quick add).
- **`app/responsive.css`** — new, shared. The design's `mob ? A : B` values
  (padSec, h1b, formCols, shellMax/shellEdge) become real `@media (min-width:
  768px)` rules here, per DESIGN-SYSTEM.md's "Responsive" section, since
  inline React styles cannot express a breakpoint. One shared file because
  every future screen needs the same handful of values, not specific to
  Submission.
- **`lib/use-theme.ts`** — `useDomTheme()`, a `MutationObserver` on
  `<html data-theme>`. Needed because the design's layer-2 colours (C8)
  arrive as literal props, not `var(--x)`, so only JS can resolve them per
  theme — and `scripts/visual-check.mjs` flips the attribute at runtime to
  capture both themes, which a `useState` initializer alone would miss.
- **Verified for real, not asserted:**
  - `corepack pnpm typecheck / lint / test / build` all green.
  - Interactively in a real browser against the live database (dev server,
    a minted org+invite, wiped after): add-person updates the quota bar and
    "Your list" live; a duplicate phone shows the mapped error and leaves
    quota untouched; an unknown token renders the same "This link is not
    valid" page ACC-024 already proved 404s correctly.
  - `corepack pnpm test:visual -- --screen submission`: **not** a pass.
    Dark/web is 29.96% against the ≤0.8% gate (light/web 29.94%, dark/mob
    27.99%, light/mob 27.91%) — one screen, `0 blocked`. The fixture org is
    named and seeded to match the mock exactly (`Chakra Sound & Light`,
    14/22 real submissions via `boa_acc_submit`, wiped after), so the entire
    measured diff is the two accepted gaps: the empty "Your list" region
    (ADR-009) and the vehicle toggle's real default (off) vs. the mock's
    fixed-on mock state. Every other pixel — header, quota bar, all three
    form fields, both buttons, footer, both themes — matches. Recorded here
    rather than claimed as a pass it is not.
- **Not yet true:** ACC-032 (confirmation copy, duplicate-phone path,
  closed-org path) is still its own task — this session's error copy is
  plain and functional, not the polished version. Phase 1's own acceptance
  line ("all four, or Phase 1 is not done") still needs ACC-026/027/028.
- 25/60 tasks done.

### 11 Sep 2026 — ACC-024: `/api/s/[token]` route handler, verified on production

- **`app/api/s/[token]/route.ts`** — GET calls `boa_acc_org_view`, POST
  validates the body against `lib/schemas/submission.ts` (zod, mirrors the
  `boa_acc_person` CHECK constraints) and calls `boa_acc_submit`. Both RPCs
  are `service_role`-only, so this route is the only place
  `lib/supabase-admin.ts` (the service-role client) is held — already
  fenced off by `eslint.config.mjs`'s `no-restricted-imports` exception,
  which anticipated this exact filename before it existed.
- **`lib/rate-limit.ts`** — ported verbatim from `boa-stok-form/lib/rate-limit.ts`.
  A per-IP, per-instance in-memory guard against token-guessing on this
  route; the real quota and 60/hour-per-token limits stay in the database
  under a row lock (`boa_acc_submit`), not here.
- Postgres errcodes map to HTTP: `P0002` → 404 (not 403 — see
  ARCHITECTURE.md, a 403 would confirm a token exists), `rate_limited` →
  429, `quota_exceeded` / `duplicate_phone` → 409, `org_closed` → 403.
- **All three of ACC-024's acceptance criteria verified with real `curl`
  against `accred.bangaloreopenair.com`, not against a local dev server**,
  using orgs minted directly via SQL (same fixture pattern as
  `quota.test.sql`) and wiped afterwards with `private.boa_acc_wipe_org`:
  1. A real link accepted 22 people one at a time (201 each; `org_view`
     reported `used: 22` between the two probes).
  2. The 23rd against a quota of 22 was refused: `409 quota_exceeded`.
  3. The 61st submission in an hour (quota 100, so quota could not be the
     cause) was refused: `429 rate_limited`.
  `db:state` after cleanup: all ten tables back to 0 rows.
- **Not yet true:** `test:visual` still reports nothing for Submission —
  that is ACC-025, not built. Phase 1's own acceptance line ("all four, or
  Phase 1 is not done") is not satisfied yet; only this one task is.
- 24/60 tasks done.

### 11 Sep 2026 — ACC-023: mint / org_view / submit, verified on the live DB

- **`202609110004_boa_acc_submit.sql`** — `private.boa_acc_live_invite`,
  `boa_acc_mint_invite` (lead/admin only; raw token once; no sibling rotate),
  `boa_acc_org_view`, `boa_acc_submit` (org row `FOR UPDATE`, quota,
  per-token hourly throttle, name/phone/role/optional plate only).
  `anon` EXECUTE remains zero. Hash via `private.boa_acc_hash_token` /
  `pg_catalog.sha256`.
- **`202609110005`** — `live_invite` and `org_view` are **VOLATILE**. STABLE
  shared the calling statement's snapshot and treated a just-minted token as
  `not found`. Verified by the failing test, then the ALTER, then a green re-run.
- **`202609110006`–`008`** — `wipe_org`, `revoke_invite`, `wipe_email`. Sibling
  DELETE CTEs share a snapshot, so they cannot satisfy `ON DELETE RESTRICT`;
  a VOLATILE plpgsql body can. `corepack pnpm db:state` after the green suite:
  0 orgs, 0 people, 0 operators, 0 `auth.users`.
- **pgTAP:** `quota.test.sql` (22nd allowed, 23rd `quota_exceeded`, closed org,
  duplicate phone), `throttle.test.sql` (60th allowed, 61st `rate_limited`,
  second token unaffected), `tokens.test.sql` (unknown/revoked/expired all
  `P0002 not found`; mint does not rotate). `privileges.test.sql` now `plan(45)`.
- **`scripts/db-test.mjs`** — `DISCARD ALL` on the same postgres connection
  before each file. The transaction pooler reuses sessions; without this,
  the second file raises `You tried to plan twice!`.
- **Cursor connectors:** Vercel plugin OAuth succeeded; that account cannot
  list the BOA team. supabase/github/playwright from `.mcp.json` are not
  loaded in this Cursor session. ACC-009b **not** ticked.
- 23/60 tasks done after `task done ACC-023`.

### 11 Sep 2026 — ACC-022: privileges.test.sql, pgTAP, and a real backup

- **`supabase/tests/privileges.test.sql`** — 29 pgTAP assertions, run for real
  against the live project and verified passing: `anon` holds zero table
  privileges and zero function EXECUTE across all 10 tables and 5 `private.`
  functions; `authenticated` gets EXECUTE on `boa_acc_is_operator` only;
  `authenticated` has **zero** privileges on `boa_acc_person.pass_token`
  specifically (checked at the **column**, not the table — `table_privs_are`
  cannot see that distinction, only `column_privs_are` can) while it *can*
  select `full_name`; RLS is actually enabled (queried `pg_class.relrowsecurity`,
  not assumed from migration text); the ledger's immutability trigger exists
  and is `ENABLE ALWAYS`, not a plain trigger a table owner could bypass.
  **Not yet covered:** "through the views" — no views exist yet
  (`boa_acc_person_state` / `boa_acc_sticker_current` land later); the file
  says so in its own header rather than silently claiming more than it proves.
- **Mutation-testing this against the live database was attempted and
  blocked by the sandbox's auto-mode classifier** (a `GRANT` statement, even
  inside a transaction meant to roll back). Not worked around. What stands
  instead: every assertion matches the lockdown migration line-for-line, and
  ran correctly against real, known-good state. A real mutation test is a
  reasonable follow-up in a disposable/branch project, not claimed here.
- **`supabase/migrations/202609110003_boa_acc_pgtap.sql`** — installs pgTAP
  1.3.3 into `extensions`, dry-run then applied for real. 3 migrations now.
- **`scripts/db-test.mjs`** — the pgTAP runner. Every pgTAP call in a test file
  is `UNION ALL`'d into one `SELECT ... ORDER BY` an explicit sequence number,
  because this pipeline has no `psql`/`pg_prove` — `runSql` only returns rows
  of the last statement (same constraint `db-push.mjs` already lives with).
  Parses `-- @proves: LEVEL | text` headers and prints them before the result.
- **ACC-009c resolved.** Took two rounds: the DB password in `.env.local`
  first had three literal `@` characters (broke URL parsing), then a
  corrected paste was missing the `@` between password and host entirely.
  Both diagnosed from the exact `pg`/`ERR_INVALID_URL` error rather than
  guessed at. `corepack pnpm db:state` and `corepack pnpm test:db` both now
  run for real over `SUPABASE_DB_URL` against the live Postgres 17.6 pooler
  and pass. **A real bug in `db-test.mjs` itself was caught in the process**:
  the test file's `begin;`/`rollback;` wrapper (added out of habit, not
  necessity — nothing here mutates anything) pushed the assertion SELECT off
  the end, so the node-postgres transport returned `ROLLBACK`'s empty result
  instead and the runner read "zero rows" as "nothing failed" — a silent
  false pass. Caught by running the suite through *both* transports and
  noticing one produced no visible output. Fixed by removing the unneeded
  wrapper and adding a hard-failure guard for zero rows / no plan line, so
  the same class of bug cannot recur quietly.
  **Still open:** the GitHub Actions `SUPABASE_DB_URL` secret was set before
  this connection string was confirmed correct — it needs updating to match,
  and CI has not yet proven it end to end.
- **`.github/workflows/backup.yml`** — nightly encrypted `pg_dump`, replacing
  PITR (declined — paid add-on beyond Pro, disproportionate for one event).
  ADR-002 and `OPERATIONS.md` updated. `BACKUP_ENCRYPTION_KEY` secret added by
  Vipin; the workflow itself has not yet been run to confirm both secrets
  resolve — that is still an open verification, not assumed done.
- **ACC-009d closed as not needed**: conflated Supabase org membership
  (dashboard access) with app login (`auth.users`, for `/desk/*`). The four
  operators need only the latter. Project stays in `otlqwoxbrsshuoebbamj`.
- 21/60 tasks done.

### 11 Sep 2026 — ACC-011, ACC-020, ACC-021: the schema is live

- **`scripts/lib/db.mjs`** — two transports. Locally the Supabase Management API
  (`/database/query`) runs SQL as `postgres` using the CLI token already in the
  keychain, so **no database password needs to exist on this machine at all**.
  Verified that multi-statement transactions, `set local role authenticated` and
  rollback all work through it. CI keeps `SUPABASE_DB_URL` instead, deliberately:
  an `sbp_` token can create or delete any project in the account, whereas the
  DB URL is scoped to one database. CI gets the narrow credential.
- **`db:state`** — asks the database, never a document. Pairs each migration
  with one object that exists only if it truly ran.
- **`db:dry`** — runs a pending migration for real, then rolls it back. It
  earned its place immediately: it caught `public.digest` not existing, which is
  the *same* pgcrypto-lives-in-`extensions` trap bar-control documented. Fixed
  by using core `pg_catalog.sha256` instead.
- **`check:sql`** — static checks. Found a false positive in itself (it counted
  commas inside `array[...]` as column separators) and was fixed and
  mutation-tested; it still catches a real arity error.
- **10 tables applied.** Every function uses `search_path = ''` with fully
  qualified names — stricter than bar-control, and it makes the pgcrypto trap
  structurally impossible.
- **The lockdown found a real exposure.** Immediately after the schema applied,
  `anon` held **70 table grants** and an unauthenticated
  `GET /rest/v1/boa_acc_person` returned **HTTP 200**. RLS was holding, so no
  rows leaked — but the tables were discoverable and one permissive policy away
  from 641 phone numbers. Now 0 grants and `401`/`42501` on every read and write.
- **`auth.uid()` is wrapped in a scalar subquery** in every policy. Unwrapped it
  is evaluated once per row; the Supabase guide measures that at 100x slower.
- Policies use `to authenticated`, never the deprecated `auth.role()`, which
  breaks silently if anonymous sign-ins are ever enabled.

**A process correction:** I marked ACC-011 done having written two of its four
scripts. That is exactly the violation non-negotiable #10 exists to prevent.
Caught it, wrote the other two, and `task done` now gates on the test suite.

### 11 Sep 2026 — credentials landed; a live security hole found and closed

Verified by running the checks, not by being told:

- **Supabase project linked.** `boa-accred`, `tjbfvuboyvaephtewjwq`, ap-south-1
  (Mumbai), Postgres 17.6.1, ACTIVE_HEALTHY.
- **Keys fetched and written.** Modern format — `sb_publishable_…` and
  `sb_secret_…` — which vindicates the earlier decision to use publishable
  rather than the legacy anon key.
- **15 Vercel env vars set** — 5 vars × Production/Preview/Development. Vercel
  marked the service-role key Secret in Production and Preview on its own.
- **🔴 SELF-REGISTRATION WAS ENABLED ON THE LIVE PROJECT.** `disable_signup` was
  `false`, so anyone could have created an account. Closed via the Management
  API and **proved closed by attempting a real signup**, which now returns
  `422 signup_disabled`. This directly violated the project's own
  non-negotiable, and nothing in the app would have surfaced it.
- **Fixed the auth redirect config** while there: `site_url` and
  `uri_allow_list` pointed at the `vercel.app` preview URL, not
  `accred.bangaloreopenair.com`. That would have broken operator invite emails
  in Phase 1 (ACC-026) in a way that looks like a mail problem, not a config one.
- **Fixed a real bug in my own bootstrap script**: it read the Supabase token
  from `~/.supabase/access-token`, but the current CLI stores it in the macOS
  keychain. A perfectly good `supabase login` read as "not logged in". Now
  keychain → file → env var.
- Corrected the earlier claim that Vercel was in a different scope. It is not.
- `.gitignore`: `vercel link` appended a blanket `.env*` which would also have
  covered `.env.example`. Negated.

**Still outstanding:** `SUPABASE_DB_URL` as a GitHub Actions secret. Vercel
refuses to reveal Secret values (correctly), so it has to come from Vipin.

### 11 Sep 2026 — the credentials path, reduced to one command

- `corepack pnpm bootstrap` links Supabase, fetches the keys, writes
  `.env.local`, pushes all five env vars to Vercel across three environments,
  sets the `SUPABASE_DB_URL` Actions secret **and confirms it landed**. It never
  prints a key — lengths and prefixes only. `--check` dry-runs it.
- **Found the real blocker rather than guessing at it.** The Supabase CLI token
  on this Mac is valid but scoped to the org holding bar-central and stok-form;
  `tjbfvuboyvaephtewjwq` returns 403. The Vercel token is separately expired.
  So the accreditation project sits in a different account on *both* platforms —
  the same pattern twice. `bootstrap` detects this precisely and prints the fix
  instead of failing obscurely.
- GitHub secrets need a libsodium sealed box, which Node has no primitive for.
  Rather than add a crypto dependency, `bootstrap` hands the job to `gh` with
  the token already in the macOS keychain. Verified by a set/list/delete
  round-trip on a throwaway secret.
- `docs/SETUP.md` is the human checklist: three logins, one command.

### 11 Sep 2026 — agent handoff made mechanical

- `corepack pnpm task` — status / start / done / block, reading and writing
  `docs/ROADMAP.md` directly so there is no second copy of task state.
- All 58 tasks normalised to one parseable checkbox format (they were split
  between markdown tables and checkboxes, which no script could read and GitHub
  rendered inconsistently).
- `task done` runs typecheck, lint and test and **refuses to tick the box** if
  any fails — non-negotiable #10 made mechanical rather than remembered.
- The session-start protocol is in all three agent configs, and
  `check-agent-docs.mjs` now fails lint if Cursor's copy stops mentioning it.
  Mutation-tested: removing it from the Cursor rules alone fails the gate.
- Fixed a real bug in the same script: it stamped release notes in UTC, writing
  yesterday's date through the entire Indian evening. Now Asia/Kolkata.

### 11 Sep 2026 — the design gate, multi-agent setup, always-on verification

- **`corepack pnpm design:reference`** captures 28 references (7 screens × 2
  themes × 2 viewports) by opening the approved bundle in a real browser and
  driving its own nav/theme/viewport controls. It does **not** re-implement
  `renderVals()` in Node: a gate whose reference is a second implementation
  proves only that two guesses agree, which is how bar-control's design QA
  failed.
- **`corepack pnpm test:visual`** compares built screens at ≤0.8%, starts its
  own server on a free port (bar-control once got a false verdict from a stale
  dev server), reports COVERAGE every run, and says
  `NOTHING COMPARED … this is not a pass` rather than a green tick when nothing
  is built.
- **The Anton bold question is SETTLED, with evidence.** The design's own
  rendering reports `font-weight: 700`, `font-synthesis: auto`, and only Anton
  400 loaded — so the approved artboard renders synthesised bold. Not adding
  `font-synthesis: none` was correct. Recorded in the reference manifest.
- **Cursor + Codex ready.** `.cursor/rules/` (4 scoped rule files) and
  `AGENTS.md`. `scripts/check-agent-docs.mjs` fails lint if CLAUDE.md and
  AGENTS.md diverge, if a linked doc is missing, or if the Cursor rules stop
  carrying the non-negotiables — divergence between agent instruction files is
  silent by construction, so it needs a gate.
- **Build and deploy always.** pre-commit (typecheck/lint/test), pre-push
  (build + visual + check:sql), CI on push, and `deploy-verify.yml` on Vercel's
  `deployment_status` plus daily at 08:00 IST. `corepack pnpm verify:deploy`
  runs 18 checks against the live site — all passing.
- **MCP:** supabase, vercel, github, playwright, all project-scoped in
  `.mcp.json` so Cursor and Codex get them too. **All four still need
  authenticating** in a regular terminal.
- `docs/TOOLING.md` and a fully dated `docs/ROADMAP.md` written.

### 11 Sep 2026 — Vercel live, and a service-worker bug caught in production

- `accred.bangaloreopenair.com` is live and serving the app from `bom1`. The
  GitHub repo is connected; pushes auto-deploy.
- Verified every `vercel.json` header actually applied. They silently no-op when
  wrong, so this was checked against the live response, not the config file.
- **Fixed:** the service-worker precache listed three routes that do not exist,
  which would have made `caches.addAll()` reject and disable offline support
  entirely. See "Production, verified 11 Sep" above.
- Vercel CLI added as a pinned devDependency rather than a global install.

### 11 Sep 2026 — Supabase MCP + skills

- Added the project-scoped Supabase MCP server (`.mcp.json`) for project
  `tjbfvuboyvaephtewjwq`. **Not authenticated** — that needs an interactive
  terminal and is on Vipin.
- Verified the project is live: `https://tjbfvuboyvaephtewjwq.supabase.co`
  returns 401 `UNAUTHORIZED_MISSING_API_KEY`, which is the correct response to
  an unauthenticated probe, and the edge resolves via `MAA` (India).
- Installed and **reviewed** two Supabase Agent Skills. Docs only, nothing
  executable, no conflict with our security model.
- Filled the real project URL into `.env.example`. A project ref is not a secret
  — it ships in every browser bundle — but the keys are, and they are still
  missing.

### 11 Sep 2026 — repository, CI, first tests

- Created **private** GitHub repo `vipinvmenon/boa-accreditation` and pushed.
  Private because this carries the access-control design for a live event three
  weeks out; private → public is one command later, the reverse un-indexes
  nothing. The siblings disagree (bar-control public, stok-form private), so
  there was no convention to inherit.
- Added `tests/unit/design-contract.test.ts` — 13 tests over the pass types,
  their zones, and the zone ORDER, which a colour check cannot see.
- Added CI. Both gates mutation-tested before being trusted.
- **CI caught a real bug on its first run that local dev had masked**: git does
  not track empty directories, so `components/` and `gate/` are absent in a
  clone and the token gate's directory walk crashed on them. Fixed, and
  re-verified inside an actual `git clone`.

### 10 Sep 2026 — Phase 0

- Recovered the approved design from the self-unpacking bundle and committed it
  to `design/source/` as the contract.
- Scaffolded Next 16 / React 19 / TS strict, pnpm 11, `corepack pnpm` only.
- Transcribed both colour layers and wrote the gates that keep them honest.
- Three deviations from the plan, each forced and each recorded:
  - `next/font` → `@fontsource` (family names; see DESIGN-SYSTEM.md).
  - `next.config.ts` `eslint` key removed — Next 16 rejects it. Lint is its own
    gate and a required CI job.
  - `pnpm.onlyBuiltDependencies` → `pnpm-workspace.yaml allowBuilds` (pnpm 11).
- Found and fixed a real gap before it shipped: the design declares JetBrains
  Mono 600 and `<strong>` inherits UA bold 700 on Archivo. Both were missing
  from the imports; `scripts/audit-font-weights.mjs` now makes that a gate.

## Template for the next session update

```
### <date> — <phase / task id>
- What changed.
- What was verified, and by running what.
- What is still not true that a reader might assume is.
```
