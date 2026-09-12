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
      playwright). `claude`, then `/mcp` → Authenticate each. **NO LONGER
      BLOCKING** — migrations run through the Supabase Management API using the
      CLI token, so this is now a convenience. **V** · *when convenient*
- [x] **ACC-009c** · `SUPABASE_DB_URL` **verified working locally, 11 Sep.**
      Took two rounds to get right — worth recording so nobody repeats them:
      (1) the password had three literal `@` characters, breaking URL parsing;
      (2) the next paste was missing the `@` between password and host
      entirely. `corepack pnpm db:state` and `corepack pnpm test:db` both ran
      for real against the live Postgres 17.6 over the pooler and passed.
      **Remaining, still on Vipin:** the GitHub Actions secret was added
      *before* this connection string was confirmed correct, so it likely
      still holds one of the two broken versions. Update the
      `SUPABASE_DB_URL` **repo secret** to match the exact value now working
      in `.env.local` — a secret that merely exists is not the same as one
      that is correct; CI has not proven it yet. **V** · *before 20 Sep*
- [x] **ACC-010b** · Vercel scope confirmed **fine**. `vercel link` reports
      orgId `team_rDgA7v4RmDHjA3gFRapQoccp` — the same team as the siblings. The
      `vipin-menon` slug in the dashboard URL only looks personal. **Done 11 Sep.**
- [ ] **ACC-030a** · The 38 organisations: name, kind, quota, contact name,
      contact phone. **V/B** · *needed 17 Sep*
- [ ] **ACC-026a** · Email addresses for Bhoopesh, Salman, 2 approvers.
      `auth.users` is currently 0, so nobody can sign in to the desk at all.
      **Interim decision, 11 Sep:** all four operator accounts will be created
      with `vipinmenon16@gmail.com` as a placeholder so ACC-026 is not blocked
      on real addresses. Swap in real emails before invite links go out on
      20 Sep — a placeholder identity signing off an AAA approval is not
      acceptable past that date. **V** · *real addresses needed 16 Sep*
- [ ] **ACC-028** · `BACKUP_ENCRYPTION_KEY` GitHub secret. Replaces PITR
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
- [x] **ACC-007** · Root dead end, 404, error boundary
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
- [ ] **ACC-028** · `BACKUP_ENCRYPTION_KEY` secret for the nightly encrypted
      backup (replaces PITR — see above) · **V** · due Thu 17

**Acceptance — all four, or Phase 1 is not done:**
1. A real link on the production domain accepts 3 people.
2. It **refuses the 23rd against a quota of 22 when called directly with `curl`** — not through the UI.
3. It refuses the 61st submission in an hour.
4. `test:db` green and **required** in CI; `test:visual` on Submission ≤0.8% in both themes.

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

- [ ] **ACC-040** · Approval queue — filters, per-row type, bulk, *Approve all →*, reasons · **C** · due Tue 22
- [x] **ACC-041** · `boa_acc_decide` + `approve_org` + `ledger`/`reissue` tests · **C** · due Tue 22
- [ ] **ACC-042** · Master list — search, CSV, In BMS / Not in BMS column · **C** · due Wed 23
- [ ] **ACC-043** · Passes — server-rendered QR SVG, A4 print CSS, WhatsApp share · **C** · due Thu 24
- [ ] **ACC-044** · `/desk/aaa` + nomination guard + `aaa.test.sql` · **C** · due Fri 25
- [x] **ACC-045** · `/desk/devices` — mint/revoke, raw token shown once · **C** · due Fri 25
- [ ] **ACC-046** · **Each approver runs the queue once.** Not for the first time on the day · **B/SN** · due Sat 26

**Acceptance:** 100 real submissions approved through the real queue · 14 passes
print one per A4 and **a phone decodes the QR off the paper** · `pass_token`
provably absent before approval · AAA unstampable without a nomination ·
`test:visual` ≤0.8% on all four desk screens.

## Phase 4 — The gate · Mon 28 Sep – Sat 3 Oct

**The hardest week. Do not let it start late.**

- [ ] **ACC-050** · `gate/db.ts` Dexie v1 · **C** · due Mon 28
- [ ] **ACC-051** · Port `outbox-policy.ts` from bar-control + unit tests · **C** · due Mon 28
- [ ] **ACC-052** · `gate/resolve.ts` — pure green/amber/red incl. pending-outbox amber · **C** · due Tue 29
- [ ] **ACC-053** · `gate/scanner.ts` — BarcodeDetector + zxing-wasm fallback · **C** · due Tue 29
- [ ] **ACC-053b** · **Prove zxing-wasm on a real iPhone.** Not deferrable — see R1 · **V** · due **Tue 29**
- [ ] **ACC-054** · `/gate/setup`, `/gate` transcribed, `force-static`, **+ sticker input** · **C** · due Wed 30
- [ ] **ACC-055** · `/gate/vehicle` + `vehicle.test.sql` · **C** · due Thu 1 Oct
- [ ] **ACC-056** · `/api/gate/*`; SW precache incl. the `.wasm` · **C** · due Thu 1 Oct
- [ ] **ACC-057** · `aeroplane-mode.spec.ts` + the two failure-path tests · **C** · due Fri 2 Oct
- [ ] **ACC-058** · **Rehearsal: two real phones, one an iPhone, real aeroplane mode** · **V/B** · due **Sat 3 Oct**
- [ ] **ACC-059** · Print the paper fallback: approved list by org, blank issue sheets · **B** · due Sat 3 Oct
- [ ] **ACC-060** · Optimise `boa-logo.png` — 290 KB is heavy for a gate precache · **C** · due Fri 2 Oct
- [ ] **ACC-061** · Mint device tokens for 4 phones · **B** · due Sat 3 Oct

**Acceptance:** cold start with the radio off renders the scanner and the full
cached roster · every step of the aeroplane-mode spec asserted in CI · **both
real phones signed off in `CURRENT-STATE.md`** · paper fallback physically
printed and at the desk.

> ## ▶ MILESTONE B — Sun 4 Oct · the gate works
> **Freeze begins.** Hot fixes only, each with `db:state` before and after and a
> line in CURRENT-STATE.md. No deploys while phones hold queued writes.

## Phase 5 — Live · Sun 4 – Sat 10 Oct

- [ ] **ACC-070** · Daily 08:00 reconcile: bands issued vs ledger; NOT IN BMS chased from `/desk/master?in_bms=false` · **B** · every day
- [ ] **ACC-071** · Watch `verify-deploy` (runs 08:00 IST daily) · **C/V**
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
