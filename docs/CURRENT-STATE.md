# Current state

**Read this first, every session. Do not trust any other document over it.**
If you cannot verify a claim here, say so plainly rather than removing it.

_Last updated: 11 September 2026 (second update)._

## In one line

Phase 0 (foundation) is complete, pushed to
[vipinvmenon/boa-accreditation](https://github.com/vipinvmenon/boa-accreditation)
(**private**), and CI is green.
**The Supabase project now exists** — ref `tjbfvuboyvaephtewjwq`, verified live
— but nothing has been built in it: **no schema, no migrations, no keys in
`.env.local`.** No Vercel project. No screens beyond the root dead-end, the 404
and the error boundary.

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
- **No design reference images.** `scripts/build-design-reference.mjs` and
  `visual-check.mjs` are not written, so `test:visual` does not run yet. The
  Anton bold question (DESIGN-SYSTEM.md) cannot be settled until they exist.
- **Almost no tests.** Only the design-contract suite exists. Playwright is
  installed but unconfigured; there is no e2e suite and no aeroplane-mode test.

## Blocked on the user

These cannot proceed without Vipin, and Phase 1 cannot start without the first:

1. **Supabase — project created ✅, three things still outstanding:**
   - **`.env.local`** — the project's anon key and service-role key. The URL is
     already filled into `.env.example`. Without these the app cannot talk to
     the database at all, MCP access notwithstanding: the MCP server is a tool
     *I* use, it is not the application's credential.
   - **Authenticate the MCP server.** `.mcp.json` is committed, but the server
     is unauthenticated and shows `⏸ Pending approval`. This needs an
     interactive terminal — see the note below.
   - **`SUPABASE_DB_URL`** in the repo's GitHub Actions secrets, or CI goes red
     on 20 Sep when the dated grace period expires.
2. **Create the Vercel project** `boa-accreditation` in team
   `team_rDgA7v4RmDHjA3gFRapQoccp`, region `bom1`, and point
   `accred.bangaloreopenair.com` at it (Sal: CNAME at Wix → `cname.vercel-dns.com`).
3. **The 38 organisations** — names, kinds, quotas, contact names and phones.
   Needed by 17 Sep for Phase 2.
4. **Email addresses** for Bhoopesh, Salman and the two approvers.

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

## Session log

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
