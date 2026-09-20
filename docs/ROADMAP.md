# Roadmap

**Today: Fri 11 Sep 2026. Show day: Sat 10 Oct. 29 days.**

Task IDs are `ACC-nnn`. Commit with the ID: `feat(ACC-024): submission quota`.
One task at a time. **Do not decide what to build next — this file decides.**
A task is not done until its acceptance criteria are met and the gates pass.

Owner column: **V** = Vipin · **C** = the coding agent (Claude/Cursor/Codex) ·
**S** = Sal (DNS) · **B** = Bhoopesh · **SN** = Salman.

## The four dates

| | Date | Day | Meaning |
|---|---|---|---|
| **A** | **20 Sep** | Sun | 38 invite links go out. **Hard. No slack.** |
| **B** | **4 Oct** | Sun | The gate works offline. First trucks ~5 Oct. |
| Build | 5–9 Oct | Mon–Fri | Load-in. Gate in daily use. |
| **Show** | **10 Oct** | Sat | Freeze from 4 Oct: hot fixes only. |

## Critical path

```
Supabase keys ─▶ schema ─▶ boa_acc_submit (quota) ─▶ /s/[token] ─▶ 38 links ──▶ A
                    └────▶ boa_acc_decide ─▶ roster RPC ─▶ offline scanner ───▶ B
```

Everything else is off the critical path and can be cut. See "Cut order".

---

## ⛔ Blocked on Vipin — every day of delay moves Milestone A

These block **all** of Phase 1. Nothing on the critical path can start without #1.

- [x] **ACC-009a** · Publishable + service-role keys into `.env.local` **and**
      into Vercel env vars. **Done 11 Sep** — 15 vars across Production, Preview
      and Development; verified with `vercel env ls`.
- [ ] **ACC-009b** · Authenticate the MCP servers (supabase, vercel, github,
      playwright). Supabase, Vercel and Playwright are authenticated; GitHub
      remains outstanding. **NO LONGER BLOCKING** — migrations run through the
      Supabase Management API using the CLI token, so this is now a
      convenience. **V** · *when convenient*
- [x] **ACC-009c** · `SUPABASE_DB_URL` **verified working locally, 11 Sep.**
      Took two rounds to get right — worth recording so nobody repeats them:
      (1) the password had three literal `@` characters, breaking URL parsing;
      (2) the next paste was missing the `@` between password and host
      entirely. `corepack pnpm db:state` and `corepack pnpm test:db` both ran
      for real against the live Postgres 17.6 over the pooler and passed.
      The GitHub Actions repo secret was updated to the exact working value
      on 12 Sep; its presence was verified with `gh secret list` without
      revealing the value. **V** · *verified 12 Sep*
- [x] **ACC-010b** · Vercel scope confirmed **fine**. `vercel link` reports
      orgId `team_rDgA7v4RmDHjA3gFRapQoccp` — the same team as the siblings. The
      `vipin-menon` slug in the dashboard URL only looks personal. **Done 11 Sep.**
- [ ] **ACC-090a** · Create the `qa-visual` operator at `/desk/users`; set
      `VISUAL_OPERATOR_EMAIL`/`VISUAL_OPERATOR_PASSWORD` in `.env.local` (both
      checkouts) and as GitHub Actions secrets. **No longer blocking (15 Sep):**
      ACC-090's harness measures all desk screens through API fixtures with no
      login; this only adds a real-session pass on top · **V** · *optional*
- [ ] **ACC-030a** · The 38 organisations: name, kind, quota, contact name,
      contact phone. **V/B** · *needed 17 Sep*
- [ ] **ACC-026a** · Email addresses for Bhoopesh, Salman, 2 approvers.
      `auth.users` is currently 0, so nobody can sign in to the desk at all.
      **Interim decision:** the four test identities use unique Gmail `+alias`
      addresses routing to Vipin's personal inbox. Real addresses are deferred
      until the app is ready, but must replace the aliases before invite links
      go out on 20 Sep. **V** · *real addresses needed before launch*
- [x] **ACC-026b** · Invite-operator UI in the desk app. `/api/admin/invite-operator`
      (ACC-026) has no screen — inviting anyone today means constructing a
      `curl` by hand. Added 12 Sep 2026 on Vipin's direct request after
      comparing against `boa-bar-control`'s `InviteCrewScreen.tsx`; that
      screen's live flow turned out to be the same email-invite +
      self-set-password model accreditation already has, not something
      different, so this is new UI on the existing API, not a new auth
      model. **V** · *added 12 Sep*
- [x] **ACC-028** · `BACKUP_ENCRYPTION_KEY` GitHub secret. Replaces PITR
      (rejected 11 Sep — paid add-on, disproportionate cost for one event) with
      a nightly encrypted `pg_dump`, already built in
      `.github/workflows/backup.yml`. Generate with `openssl rand -base64 32`,
      add as a repo secret, save the passphrase outside GitHub too. See
      `docs/OPERATIONS.md` — Backups. **V** · *by 17 Sep*
- [x] **ACC-009d** · **Not needed — closed 11 Sep.** Conflated two different
      things: Supabase org membership (dashboard/SQL/billing access) vs app
      login (`auth.users` rows, used to sign into `/desk/*`). Bhoopesh, Salman
      and the approvers only ever need the latter, which requires zero
      Supabase org access. The project stays in `otlqwoxbrsshuoebbamj`.

---

## Phase 0 — Foundation · 10–11 Sep — ✅ DONE

- [x] **ACC-001** · Recover the design from the bundle; commit to `design/source/`
- [x] **ACC-002** · Scaffold Next 16 / React 19 / TS strict / pnpm
- [x] **ACC-003** · Transcribe both colour layers; `check-design-tokens.mjs` gate
- [x] **ACC-004** · Fonts via `@fontsource`; `audit-font-weights.mjs` gate
- [x] **ACC-005** · `extract-assets.mjs` — logo + poster out of the bundle
- [x] **ACC-006** · `build-gate-sw.mjs`, precaching only routes Next emitted
- [x] **ACC-007** · Root dead end, 404, error boundary. **Reversed 12 Sep
      2026, ADR-013** — root now redirects to `/desk/login` on Vipin's direct
      instruction. The 404 (`app/not-found.tsx`) is untouched; only the root
      dead-end half of this task was reversed.
- [x] **ACC-008** · `/docs`, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`
- [x] **ACC-010** · Vercel project live at `accred.bangaloreopenair.com`
- [x] **ACC-012** · Design reference capture (28 refs) + `visual-check.mjs`
- [x] **ACC-013** · CI: app + database jobs, database required from 20 Sep
- [x] **ACC-014** · `verify-deploy.mjs` + deployment_status workflow
- [x] **ACC-015** · Git hooks: pre-commit gates, pre-push build + visual
- [x] **ACC-016** · MCP servers registered; Supabase agent skills installed

---

## Phase 1 — Schema and the public surface · Fri 11 – Fri 18 Sep

**This is the critical path. If it slips, Milestone A slips.**

- [x] **ACC-011** · `db-test.mjs`, `db-state.mjs`, `sql-arity-check.py`, `lib/db-url.mjs` · **C** · due Fri 11
- [x] **ACC-020** · `202609110001_boa_acc_core.sql` — 9 tables, enums, `pass_only_when_approved` CHECK, `ENABLE ALWAYS` triggers · **C** · due Sat 12
- [x] **ACC-021** · `..._lock_down_privileges.sql` — anon has nothing; column grants omitting `pass_token`; views `security_invoker` · **C** · due Sat 12
- [x] **ACC-022** · `privileges.test.sql` — every table, every function, both roles, **and through the views** · **C** · due Sun 13
- [x] **ACC-023** · `boa_acc_mint_invite` / `org_view` / `submit` + `quota`, `tokens`, `throttle` tests · **C** · due Mon 14
- [x] **ACC-024** · `/api/s/[token]` + ported `lib/rate-limit.ts` · **C** · due Tue 15
- [x] **ACC-025** · `/s/[token]` — Submission screen, transcribed, both themes · **C** · due Wed 16
- [x] **ACC-026** · `/desk/login` + `/api/admin/invite-operator`; invite B, SN, 2 approvers · **C/V** · due Wed 16
- [x] **ACC-027** · `/desk/orgs` — create org, set quota, mint link, copy · **C** · due Thu 17
- [x] **ACC-028** · `BACKUP_ENCRYPTION_KEY` secret for the nightly encrypted
      backup (replaces PITR — see above) · **V** · due Thu 17

**Acceptance — all four, or Phase 1 is not done:**
1. A real link on the production domain accepts 3 people.
2. It **refuses the 23rd against a quota of 22 when called directly with `curl`** — not through the UI.
3. It refuses the 61st submission in an hour.
4. `test:db` green and **required** in CI; `test:visual` on Submission ≤0.8% in both themes.

## Phase 1b — v2 reconciliation gap-fill · Sun 13 – Sat 19 Sep

Added 13 Sep after reconciling the "Festival Readiness Plan (v2)" handoff
against the shipped app — see ADR-014. Real gaps v2 found, not previously
tracked as ACC tasks.

**13 Sep, later the same day — provenance note:** this whole phase was added
on a local branch that turned out to have diverged from `origin/main` by
~30 commits (several concurrent sessions had been pushing independently).
Rebased onto `origin/main` before continuing; `origin/main` never had this
phase, so ACC-034 through ACC-04B are new roadmap entries as of this rebase,
not something the other sessions already knew about or had rejected.
ACC-034's original scope (stripping the WEB/MOB toggle) was already wrong by
the time of the rebase — `docs/DESIGN-SYSTEM.md` had been corrected upstream
to say the toggle ships. Treat every item below as freshly re-verified
against `origin/main`'s actual current state, not carried over on faith.

- [x] **ACC-034** · `scripts/check-bundle-content.mjs` (₹, finance terms,
      `console.log`) gating `build` and `verify:deploy` · **C** · due Tue 15.
      **Scope corrected 13 Sep:** originally also set out to strip the
      WEB/MOB review toggle from `GateChrome`, but `docs/DESIGN-SYSTEM.md`'s
      Responsive section was corrected in the meantime — the toggle **ships**
      as a real layout indicator, not a debug affordance — so that half of
      this task is superseded, not done differently. See `app/gate/gate-chrome.tsx`.
- [x] **ACC-035** · `scripts/seed-dummy.mjs` / `wipe-dummy.mjs` — 6 `TEST — `
      orgs, 18 people across all statuses/types, one over-quota, through the
      real RPCs, never touching `boa_acc_checkin` · **C** · due Tue 15.
      Confirmed still missing on `origin/main` (13 Sep) — a real gap, not
      already done elsewhere.
- [x] **ACC-036** · Copy inventory (`docs/COPY.md`), design-contract vs ours,
      rewritten in the deck's voice · **C** · Submission strings by Sat 19,
      desk strings folded into Phase 3. **Done 13 Sep**: `docs/COPY.md`
      transcribes the Submission screen against `design/source/` field by
      field, spot-checks the other design-matched desk screens, and covers
      every screen with no design counterpart. Found and fixed real drift:
      an identical generic `"Something went wrong. Try again."` fallback had
      been independently duplicated across 6 files' `internal` error case,
      rewritten consistently; one Submission error message referenced
      "highlighted" fields that don't exist in the code. `test:visual` could
      not be run in that session (no `.env.local`/`design/reference/`
      baseline in that worktree) — not claimed passing.

**14 Sep — design-fidelity lane split (added, not reordered).** Vipin
reported Submission, Master List and Passes still differ from the design.
Root cause: four desk screens have never been pixel-measured (no operator
login in `test:visual`) and Submission passes only via a 32% exemption.
Full plan, file ownership and findings: `docs/PLAN-DESIGN-FIDELITY.md`.
Claude = **C**, Cursor = **CU**, run in parallel.

- [x] **ACC-090** · Visual harness: desk API fixtures (Zod-parsed design
      data), operator sign-in, named masks replace `KNOWN_GAPS`, anti-hardcode
      and stale-build guards, review page, published baseline · **C** · due Tue 15
- [x] **ACC-091** · `boa_acc_org_roster(p_token)` + `roster.test.sql` +
      privileges + ADR-016 · **C** · due Wed 16
- [x] **ACC-092** · Submission: drafts + "Submit N for approval →" batch,
      roster-backed "Your list", ≤0.8% on 4 variants · **C** · due Thu 17
- [x] **ACC-093** · Merge both lanes; 7/7 screens PASS, 0 BLOCKED, 0 KNOWN
      GAP; Vipin review; deploy verified · **C** · due Fri 18
- [x] **ACC-095** · Contract schemas (K0) + shared shell: footer, logo
      filter, BMS link, `.d-h1b` · **CU** · due Tue 15
- [x] **ACC-096** · Master List M1–M8 at ≤0.8% · **CU** · due Wed 16
- [x] **ACC-097** · Passes P1–P7 at ≤0.8% · **CU** · due Thu 17
- [x] **ACC-098** · Queue (10 findings) + Control Room at ≤0.8% · **CU** · due Thu 17
- [x] **ACC-099** · Cursor lane sign-off, measured numbers in CURRENT-STATE · **CU** · due Fri 18

**Milestone A precondition:** `wipe-dummy` run, 0 `TEST — ` orgs remaining,
before ACC-031 mints the 38 real invite tokens.

## Phase 2 — Ready to send · Fri 18 – Sat 19 Sep

- [ ] **ACC-030** · Load all 38 orgs — kinds, quotas, contacts · **C/B** · due Fri 18
- [ ] **ACC-031** · Mint + label 38 invite tokens; export a WhatsApp-ready list · **C** · due Fri 18
- [x] **ACC-032** · Confirmation copy, duplicate-phone path, closed-org path · **C** · due Sat 19
- [x] **ACC-033** · `/desk` Control room on `boa_acc_desk_dashboard()` · **C** · due Sat 19

**Acceptance: Bhoopesh opens a link on his own phone, adds himself with a
vehicle, and watches the seat count move.** Not a demo on my machine.

> ## ▶ MILESTONE A — Sun 20 Sep · links go out
> No slack after this. A link sent on 24 Sep leaves four fewer days to chase 38
> companies, and **R2 (vendors simply not submitting) is the risk most likely to
> kill the gate.** First chase: Fri 25 Sep.

## Phase 3 — The desk · Mon 21 – Sat 26 Sep

Runs while submissions arrive.

- [x] **ACC-040** · Approval queue — filters, per-row type, bulk, *Approve all →*, reasons · **C** · due Tue 22
- [x] **ACC-041** · `boa_acc_decide` + `approve_org` + `ledger`/`reissue` tests · **C** · due Tue 22
- [x] **ACC-042** · Master list — search, CSV, In BMS / Not in BMS column · **C** · due Wed 23
- [x] **ACC-043** · Passes — server-rendered QR SVG, A4 print CSS, WhatsApp share · **C** · due Thu 24
- [x] **ACC-044** · `/desk/aaa` + nomination guard + `aaa.test.sql` · **C** · due Fri 25
- [x] **ACC-045** · `/desk/devices` — mint/revoke, raw token shown once · **C** · due Fri 25
- [ ] **ACC-046** · **Each approver runs the queue once.** Not for the first time on the day · **B/SN** · due Sat 26
- [x] **ACC-047** · Shared desk shell — sticky nav, live status bar, theme toggle · **C** · due Sat 26
- [x] **ACC-048** · Forgot-password link on `/desk/login`, using
      `resetPasswordForEmail` + the existing `/auth/confirm` recovery path ·
      **C** · due Mon 21. **Already done, confirmed 13 Sep during the
      rebase**: built independently on `origin/main` in `3750cc8
      feat(desk/login): add a forgot-password flow`, hardened by `1704833
      fix(auth): don't verify recovery/invite tokens on GET` (a real
      production bug — a mail-security link-prescanner was burning
      single-use recovery/invite tokens via `GET` before the recipient could
      click). Both already merged; no new work needed.
- [x] **ACC-049** · `/desk/users` Manage Users — list, invite (reuses
      `/api/admin/invite-operator`), activate/deactivate; lead/admin-checked
      in the database, self-deactivation and last-admin guards ·
      **C** · due Wed 23
- [x] **ACC-04B** · Profile menu (name, role, theme, Manage users, sign out)
      replacing the desk's loose theme button — desk screens only, own ADR
      if the design needs reconciling (ADR-014 is already taken by the v2
      reconciliation above) · **C** · due Thu 24

**Acceptance:** 100 real submissions approved through the real queue · 14 passes
print one per A4 and **a phone decodes the QR off the paper** · `pass_token`
provably absent before approval · AAA unstampable without a nomination ·
`test:visual` ≤0.8% on all four desk screens.

## Phase 4 — The gate · Mon 28 Sep – Sat 3 Oct

**The hardest week. Do not let it start late.**

- [x] **ACC-050** · `gate/db.ts` Dexie v1 · **C** · due Mon 28
- [x] **ACC-051** · Port `outbox-policy.ts` from bar-control + unit tests · **C** · due Mon 28
- [x] **ACC-052** · `gate/resolve.ts` — pure green/amber/red incl. pending-outbox amber · **C** · due Tue 29
- [x] **ACC-053** · `gate/scanner.ts` — BarcodeDetector + zxing-wasm fallback · **C** · due Tue 29
- [ ] **ACC-053b** · **Prove zxing-wasm on a real iPhone.** Not deferrable — see R1 · **V** · due **Tue 29**
- [x] **ACC-054** · `/gate/setup`, `/gate` transcribed, `force-static`, **+ sticker input** · **C** · due Wed 30
- [x] **ACC-055** · `/gate/vehicle` + `vehicle.test.sql` · **C** · due Thu 1 Oct
- [x] **ACC-056** · `/api/gate/*`; SW precache incl. the `.wasm` · **C** · due Thu 1 Oct
- [x] **ACC-057** · `aeroplane-mode.spec.ts` + the two failure-path tests · **C** · due Fri 2 Oct
- [ ] **ACC-058** · **Rehearsal: two real phones, one an iPhone, real aeroplane mode** · **V/B** · due **Sat 3 Oct**
- [ ] **ACC-059** · Print the paper fallback: approved list by org, blank issue sheets · **B** · due Sat 3 Oct
- [x] **ACC-060** · Optimise `boa-logo.png` — 290 KB is heavy for a gate precache · **C** · due Fri 2 Oct
- [ ] **ACC-061** · Mint device tokens for 4 phones · **B** · due Sat 3 Oct

**Acceptance:** cold start with the radio off renders the scanner and the full
cached roster · every step of the aeroplane-mode spec asserted in CI · **both
real phones signed off in `CURRENT-STATE.md`** · paper fallback physically
printed and at the desk.

## Phase 3b — the v2 redesign lane · Sun 20 Sep – Fri 3 Oct

**Added 20 Sep on Vipin's instruction, not a reordering.** `design/proposals/
boa_design_v2.html` is a complete v2 of the same seven screens and becomes the
pixel contract; v1 freezes as the domain + C8 colour record. **Read
`docs/CURSOR-V2.md` in full before claiming ACC-100** — it carries the gate
rework, three things that must not be changed silently, and ACC-109's hard stop.

This lane does not sit on the critical path. If ACC-030a lands mid-flight, the
org list wins: `task block` the redesign task with a reason and commit it.

- [x] **ACC-100** · Admit v2 as the pixel contract: move it into
      `design/source/`, vendor fonts + icons locally, add the capture readiness
      hook, re-point `capture-design-reference.mjs`, write ADR-017, update
      non-negotiable #1 in CLAUDE.md + AGENTS.md + `.cursor/rules`. Acceptance:
      28 PNGs captured from v2, CDN-vs-local diff recorded · **CU** · due Sun 20
- [x] **ACC-101** · Split the token gates: `check-design-tokens.mjs` check 1 →
      v2, check 2 stays on v1, widen the token-name regex to `--[a-z0-9-]+`,
      add v2's tokens to `app/globals.css`, add `@fontsource/archivo/600.css`,
      re-point or retire `audit-font-weights.mjs`. `design-contract.test.ts`
      must stay 13/13 with an empty diff · **CU** · due Mon 21
- [x] **ACC-102** · The v2 primitive layer: `app/v2.css`, `components/icon.tsx`
      (14 inline SVG glyphs, no CDN, no new package), `lib/use-reveal.ts`. No
      screen changes; `test:visual` must report the unchanged v1
      numbers · **CU** · due Tue 22
- [x] **ACC-103** · Shared shell: nav island, sliding pip, status pill, `.av`
      profile menu per ADR-015, burger drawer under 700px, v2 footer. `.tools`
      is not ported. `test:visual` run and intermediate failures recorded, per
      ADR-015's precedent · **CU** · due Wed 23
- [x] **ACC-104** · Control room on v2 at ≤0.8%, 4 variants · **CU** · due Thu 24
- [~] **ACC-105** · Queue on v2 at ≤0.8%, 4 variants. Read ACC-098's
      native-`<select>` writeup first · **CU** · due Sat 26
- [ ] **ACC-106** · Master list on v2 at ≤0.8%, 4 variants · **CU** · due Sun 27
- [ ] **ACC-107** · Passes on v2 at ≤0.8%, 4 variants; the `.qr-wrap svg` mask
      selector must survive · **CU** · due Mon 28
- [ ] **ACC-108** · Submission on v2, 4 variants. ADR-009 (no desk chrome) and
      ADR-016 (roster-backed list) hold; fold `motion.css` into the v2
      layer · **CU** · due Tue 29
- [ ] **ACC-109** · Gate + Vehicle on v2 at ≤0.8%, 4 variants, plus `test:e2e`
      aeroplane-mode green and the precache count recorded. Presentation only —
      no diff in `gate/db.ts`, `gate/roster.ts` or the outbox. **Hard stop: not
      green and rehearsed by 2 Oct → revert and ship gate on
      v1** · **CU** · due Thu 2 Oct
- [ ] **ACC-110** · Derive the six ungated screens (`orgs`, `aaa`, `devices`,
      `users`, `login`, `gate/setup`) plus `error`/`not-found` from the v2
      primitives. Not pixel-gated — nothing exists to gate
      against · **CU** · due Fri 3 Oct
- [ ] **ACC-111** · v2 sign-off: full gate green, guard-mutation proof, manual
      walkthrough at 390/900/1360 and light theme, dated CURRENT-STATE entry
      with measured numbers, DESIGN-SYSTEM rewritten for the new authoring
      model. Do not push or deploy · **CU** · due Fri 3 Oct

> ## ▶ MILESTONE B — Sun 4 Oct · the gate works
> **Freeze begins.** Hot fixes only, each with `db:state` before and after and a
> line in CURRENT-STATE.md. No deploys while phones hold queued writes.

## Phase 5 — Live · Sun 4 – Sat 10 Oct

- [ ] **ACC-070** · Daily 08:00 reconcile: bands issued vs ledger; NOT IN BMS chased from `/desk/master?in_bms=false` · **B** · every day
- [x] **ACC-071** · Watch `verify-deploy` (runs 08:00 IST daily) — production
  verifier passes 18/18; awaiting logged scheduled-run evidence · **C/V**
- [ ] **ACC-072** · Post-show: export the ledger, reconcile against paper · **B** · 11 Oct

## After the show

- [ ] **ACC-080** · **9 Nov 2026** — retention review. Re-confirm holding personal
      data until BOA 2027 planning, or narrow it: org names/contacts/quotas are
      what 2027 needs; individual crew phone numbers and plates are the standing
      liability. See OPERATIONS.md. · **V**

---

## Cut order, if time runs out

Cut from the top. Each line says what happens instead.

| Cut by | What | Fallback |
|---|---|---|
| any time | Light theme | Ship dark only. The token block is already written — half a day to restore. |
| 2 Oct | CSV export | Copy out of the master list. |
| any time | WhatsApp share button | Copy the `/p/<token>` link by hand. |
| 2 Oct | `/desk/aaa` screen | Insert the 18 rows by SQL. The guard in `boa_acc_decide` still holds. |
| 2 Oct | `/desk/passes` print sheet | Forward pass links; most crew will show a phone. |
| **8 Oct** | **`/gate/vehicle`** | Security runs a printed plate→sticker list 5–7 Oct. **Must be live before the 8 Oct load-in peak.** |

**Cannot be cut, at any price:** the submission surface · server-side quota ·
pass-token-only-after-approval · the offline scanner and its outbox · ledger
immutability · the `anon` lockdown.

## If Milestone A is going to slip

Decide by **Thu 17 Sep**, not on the 20th. In order of preference:

1. **Send links for the 10 largest orgs first.** They carry most of the 641
   people and the longest internal turnaround.
2. **Ship the submission surface without the Control room.** ACC-033 is
   presentation; the form is the critical path.
3. **Collect by spreadsheet for the stragglers and import.** Ugly, works, and
   keeps quota enforcement server-side where it matters.

Do **not** solve a slip by skipping the `curl` quota test. That test is the
difference between a quota and a suggestion.
