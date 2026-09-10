# Current state

**Read this first, every session. Do not trust any other document over it.**
If you cannot verify a claim here, say so plainly rather than removing it.

_Last updated: 11 September 2026 (seventh update)._

## In one line

Phase 0 (foundation) is complete, pushed to
[vipinvmenon/boa-accreditation](https://github.com/vipinvmenon/boa-accreditation)
(**private**), and CI is green.
**The app is deployed and live at
[accred.bangaloreopenair.com](https://accred.bangaloreopenair.com)**, served
from `bom1`, with the GitHub repo connected and auto-deploying.
**The Supabase project exists** — ref `tjbfvuboyvaephtewjwq`, verified live —
but **nothing has been built in it: no schema, no migrations, no keys in
`.env.local`.** No screens yet beyond the root dead-end, the 404 and the error
boundary.

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

Stated explicitly so nobody infers otherwise from the folder tree — the
directories are scaffolded but empty:

- **No Supabase project.** No project ref, no `.env.local`, no migrations run.
  `corepack pnpm db:state`, `test:db` and `check:sql` have nothing to talk to,
  and `scripts/db-test.mjs`, `db-state.mjs`, `sql-arity-check.py` are **not yet
  written**.
- **No Vercel project** and no `accred.bangaloreopenair.com` DNS.
- **No schema.** `supabase/migrations/` and `supabase/tests/` are empty.
- **No screens.** `/s/[token]`, `/desk/*`, `/gate/*` are empty directories.
- **No `lib/database.types.ts`** — it is generated from a live project.
- ~~No design reference images.~~ **Done.** 28 references captured from the
  approved bundle rendering itself, and `test:visual` runs. It currently reports
  `NOTHING COMPARED — no screen is built yet`, which is the honest answer.
- **Almost no tests.** Only the design-contract suite exists. Playwright is
  installed but unconfigured; there is no e2e suite and no aeroplane-mode test.

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

## Session log

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
