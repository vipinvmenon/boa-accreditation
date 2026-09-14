# AGENTS.md — BOA Accreditation

**Read `docs/CURRENT-STATE.md` first. Every session. Before anything else.**

This file is identical to `CLAUDE.md` and is short on purpose. It does not describe the architecture — a second
description of the system is how `boa-bar-control` broke once already. It says
where the truth lives and what you may not do.

## The truth lives in `/docs`

| File | Read it when |
| --- | --- |
| [docs/CURRENT-STATE.md](docs/CURRENT-STATE.md) | **Always, first.** What is done, what is not, what is next |
| [docs/PRODUCT.md](docs/PRODUCT.md) | Any question about what we are building or why |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Before touching structure, routing, or layering |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | Before touching the schema or the ledger |
| [docs/SECURITY.md](docs/SECURITY.md) | Before touching auth, tokens, RLS, or grants |
| [docs/OFFLINE-SYNC.md](docs/OFFLINE-SYNC.md) | Before touching the gate, the cache, or the outbox |
| [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) | Before touching **any** UI |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | The BMS loop, the gate runbook, retention |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Before proposing an architecture change |
| [docs/ROADMAP.md](docs/ROADMAP.md) | To find your task ID and its acceptance criteria |
| [docs/SETUP.md](docs/SETUP.md) | Credentials, logins, `bootstrap` — the unblock checklist |
| [docs/TOOLING.md](docs/TOOLING.md) | Cursor/Codex setup, MCP servers, the gates, deploy verification |

`design/source/` is the approved design, committed verbatim. It is the **UI
contract** and the **domain contract**. It is not inspiration.

## Starting a session — do this before anything else

You inherit the repository, not the previous agent's conversation. Everything
you need is committed; nothing you need is in someone's scrollback.

```bash
corepack pnpm task          # what is in flight, what is next, what is blocked
git log --oneline -5        # what the last agent actually did
```

Then read `docs/CURRENT-STATE.md`.

1. **If something is IN FLIGHT (`[~]`), pick that up.** Do not start a new task.
   `git log` and `git diff` show how far it got.
2. **Otherwise take the first NEXT UP task.** The roadmap decides the order, not
   you. If the order is wrong, say so — do not quietly reorder it.
3. **Claim it:** `corepack pnpm task start ACC-nnn`, then commit
   `docs/ROADMAP.md` so the next agent can see it is taken.
4. **Finish it:** `corepack pnpm task done ACC-nnn`. This runs typecheck, lint
   and test and refuses to tick the box if any of them fail — non-negotiable #10
   made mechanical rather than remembered.
5. **Out of time, or blocked?** `corepack pnpm task block ACC-nnn "why"` and
   commit. That single line is what lets the next agent — Claude, Cursor or
   Codex — resume instead of restart.

**Never leave a task in flight without committing that fact.** An uncommitted
`[~]` is invisible to every other tool.

## Non-negotiables

Violating any of these is a defect regardless of how good the reason seemed.

1. **`design/source/boa_design_body.html` is the pixel contract.** Reproduce it.
   A visual deviation is a defect, not a preference. Its two colour layers
   disagree on six values **on purpose** — see DESIGN-SYSTEM.md, C8. Reconciling
   them is the bug, not the fix.
2. **The check-in ledger is append-only.** A reissue appends, a void appends.
   Enforced by an `ENABLE ALWAYS` trigger, not by convention.
3. **Authorisation is enforced in the database.** Client-side checks are a
   usability affordance, never a control.
4. **`anon` has zero table grants and zero function EXECUTE.** Prove it in
   `supabase/tests/privileges.test.sql`, for every table and every function.
5. **No `pass_token` before approval. Ever.** It is a `CHECK` constraint, not a
   convention, so it holds even when an RPC is wrong.
6. **Never pre-assign a wristband or vehicle-sticker serial.** They are typed at
   the gate as the physical article is handed over, or left blank.
7. **The gate must work with the radio off.** Every read from the Dexie cache,
   every write through the outbox. No fast path, online or not.
8. **Zod at every boundary. No `any`. No `select *`. `timestamptz` always.**
   Integer money, if money ever appears. It should not.
9. **Collect nothing beyond name, phone, role and vehicle registration.** No ID
   number, no Aadhaar, no photo, no address, no date of birth.
10. **Never mark a task done without meeting its acceptance criteria**, and
    **never write a document asserting a verification you did not perform.**

## How the sibling project got here — do not repeat it

`boa-bar-control` shipped an architecture built on assumptions about a design
nobody had unpacked, then wrote a second document claiming the architecture had
been checked against artefacts that had never been opened. Those assumptions
hardened into the schema and the routes. Later, design QA was a same-viewport
screenshot pair — and the cheapest way to pass a screenshot comparison is to
hardcode the screenshot's values.

The lessons, as rules:

- If a source looks missing, unpack it or ask. The design here arrived as a
  self-unpacking bundle and *was* recovered — `scripts/extract-assets.mjs` and
  `design/source/` exist so nobody has to do it twice.
- Never write a document asserting a verification you did not perform.
- A screenshot is not acceptance. The screen must render from the data layer.
- If you cannot verify a claim, say so plainly in `CURRENT-STATE.md`.
- Ask the database, do not ask a document: `corepack pnpm db:state`.

## Quality gates

**`pnpm` is not on the PATH on this machine.** Every script runs as
`corepack pnpm <script>`. Bare `pnpm` fails with `command not found` — never
hand the user a command that starts with `pnpm`.

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
corepack pnpm check:sql     # migrations — static arity check, no database needed
corepack pnpm test:db       # pgTAP against a real PostgreSQL
corepack pnpm test:e2e      # includes the aeroplane-mode suite
corepack pnpm test:visual   # design fidelity against design/reference/
corepack pnpm db:state      # what the database actually contains
```

A task is not done until these pass. "It should work" is not a gate.

## Model and effort — advisory, not a gate

This cannot be enforced from a repo file — model and effort are a session
setting, not something `CLAUDE.md` can override. Treat this as the default
judgement call, not a rule `task done` checks:

- **Default: Sonnet, medium effort.** Route handlers, RPCs, schemas, tests,
  most of one ROADMAP task — this is the bulk of the work here.
- **Escalate to Opus / high effort** only for the genuinely hard moments: the
  offline outbox / gate-sync design (OFFLINE-SYNC.md), an RLS or privilege
  question that isn't a copy of an existing pattern, reconciling a design
  ambiguity in DESIGN-SYSTEM.md, or a bug that survives a first debugging
  pass. Don't leave it on for the routine work that follows.
- **Drop to low effort / Haiku** for mechanical work: renames, boilerplate,
  log-line edits, doc formatting.
- **Read files, don't paste them.** Point at `docs/*.md` and migration files
  by path; grep for the section needed rather than loading a whole doc when
  only one table or one function matters.
- If a task is running long or blowing through context for no clear reason,
  say so rather than pushing through — that is itself a signal to check
  whether the wrong model/effort is loaded for what remains.

## Dates that do not move

Links out **20 Sep** · gate live **4 Oct** · build **5–9 Oct** · show **10 Oct 2026**.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
