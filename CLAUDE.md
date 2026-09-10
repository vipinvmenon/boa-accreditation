# CLAUDE.md — BOA Accreditation

**Read `docs/CURRENT-STATE.md` first. Every session. Before anything else.**

This file is short on purpose. It does not describe the architecture — a second
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
| [docs/TOOLING.md](docs/TOOLING.md) | Cursor/Codex setup, MCP servers, the gates, deploy verification |

`design/source/` is the approved design, committed verbatim. It is the **UI
contract** and the **domain contract**. It is not inspiration.

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

## Dates that do not move

Links out **20 Sep** · gate live **4 Oct** · build **5–9 Oct** · show **10 Oct 2026**.
