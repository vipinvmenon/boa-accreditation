# Current state

**Read this first, every session. Do not trust any other document over it.**
If you cannot verify a claim here, say so plainly rather than removing it.

_Last updated: 10 September 2026._

## In one line

Phase 0 (foundation) is complete and every gate is green on an empty app.
**No database exists yet.** No Supabase project, no Vercel project, no schema,
no screens beyond the root dead-end, the 404 and the error boundary.

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
- **No tests.** `corepack pnpm test` runs zero tests; Vitest and Playwright are
  installed but unconfigured.

## Blocked on the user

These cannot proceed without Vipin, and Phase 1 cannot start without the first:

1. **Create the Supabase project** (ap-south-1 / Mumbai) and put its URL, anon
   key and service-role key in `.env.local`. Note the org was previously at a
   2-project free-tier limit (Pricely + boa-bar-control, plus boa-stok-form) —
   this may need a plan change.
2. **Create the Vercel project** `boa-accreditation` in team
   `team_rDgA7v4RmDHjA3gFRapQoccp`, region `bom1`, and point
   `accred.bangaloreopenair.com` at it (Sal: CNAME at Wix → `cname.vercel-dns.com`).
3. **The 38 organisations** — names, kinds, quotas, contact names and phones.
   Needed by 17 Sep for Phase 2.
4. **Email addresses** for Bhoopesh, Salman and the two approvers.

## Session log

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
