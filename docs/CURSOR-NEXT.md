# Cursor: pending work — ⚠️ SUPERSEDED, kept as a record

> **This file is history. Do not work from it.**
> Everything it lists as pending is now done: **ACC-093 and ACC-099 are both
> `[x]`**, and the counts below (`62/78`) are stale — see `corepack pnpm task`
> for the live figure.
>
> **The current handover is [`docs/CURSOR-V2.md`](CURSOR-V2.md)** — the v2
> redesign lane, ACC-100…ACC-111.
>
> Kept rather than deleted because its ACC-098 notes and its "rules that still
> apply" section are still accurate, and because deleting the record of what a
> previous lane was told is how this project loses the thread.

**Read `docs/CURRENT-STATE.md` first — same rules as any agent on this repo.**

Repo state as of this handoff: `86aa613`, clean tree, 18+ local commits, nothing
pushed to `origin/main` yet. `corepack pnpm task` showed 62/78 done, nothing
claimed in flight. *(Stale — both pending items below have since been ticked.)*

## What just changed

**ACC-098 (Queue visual fidelity) is done.** All 7 desk/gate screens now pass
`test:visual` at 4 variants each (0 blocked, 0 known gaps) — the first time
that's been true in this project. Full root-cause writeup is in
`docs/CURRENT-STATE.md`'s two most recent dated entries under Queue, if you
want the detail. Don't re-open it; it's verified done.

## Pending — do these in order, not in parallel (each depends on the last)

### 1. ACC-093 — final merge & sign-off
Everything it needs is now unblocked. Run the full gate:
```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
corepack pnpm check:sql
corepack pnpm test:db
corepack pnpm test:e2e
corepack pnpm test:visual
```
All must be green: **7/7 screens PASS, 0 BLOCKED, 0 KNOWN GAP.** Then:
- Guard-mutation proof: rename a fixture name in `scripts/visual-fixtures/desk.mjs`,
  confirm the affected screen fails `test:visual`, revert.
- Live walkthrough at 390px and in light theme on at least Queue and Master.
- Update `docs/CURRENT-STATE.md` with a dated entry, numbers you actually measured.
- **Do not push to `origin/main` or deploy.** That's Vipin's call to trigger, not
  an agent's. Stop after the gates are green and documented.

### 2. ACC-099 — Cursor lane sign-off
Bookkeeping: write the dated CURRENT-STATE.md entry recording your lane's
final numbers (shared shell, Master List, Passes — all already passing), then
`corepack pnpm task done ACC-099`.

### 3. ACC-030 / ACC-031 — blocked on Vipin, don't start yet
`ACC-030` (load the 38 real orgs) is blocked on `ACC-030a` (the real org list
from Bhoopesh — name/kind/quota/contact). `ACC-031` (mint + label 38 invite
tokens) is blocked on `ACC-030`. Don't touch either until Vipin says the org
list has landed — check `corepack pnpm task` for `ACC-030a`'s status before
starting.

## Still blocked on Vipin (informational, not yours to act on)

- `ACC-009b` — MCP server auth (supabase/vercel/github/playwright), non-blocking
- `ACC-090a` — `qa-visual` operator account — no longer actually blocking (the
  visual harness works via API fixtures with no login)
- `ACC-030a` — the 38-org list from Bhoopesh
- `ACC-026a` — real email addresses for Bhoopesh, Salman, 2 approvers

## Rules that still apply

- `corepack pnpm <script>` — `pnpm` is not on PATH.
- Non-negotiable #1: `design/source/boa_design_body.html` is the pixel contract.
- Non-negotiable #10: never tick a task without meeting its acceptance criteria;
  never write a CURRENT-STATE.md entry claiming a verification you didn't run.
- Claim work with `corepack pnpm task start ACC-nnn`, commit `docs/ROADMAP.md`
  immediately.
- Never push or deploy without Vipin's explicit go-ahead.
