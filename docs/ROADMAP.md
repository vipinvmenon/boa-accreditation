# Roadmap

Task IDs are `ACC-nnn`. Commit with the ID: `feat(ACC-012): submission quota`.
One task at a time. **Do not decide what to build next — this file decides.**
A task is not done until its acceptance criteria are met and the gates pass.

| Milestone | Date | Meaning |
|---|---|---|
| **A** | **Sun 20 Sep** | 38 invite links go out. Hard date, no slack. |
| **B** | **Sun 4 Oct** | The gate works offline. First trucks ~5 Oct. |
| Show | 10 Oct | Freeze from 4 Oct: hot fixes only. |

---

## Phase 0 — Foundation · 10–12 Sep — **DONE**

| ID | Task | Status |
|---|---|---|
| ACC-001 | Recover the design from the bundle; commit to `design/source/` | ✅ |
| ACC-002 | Scaffold Next 16 / React 19 / TS strict / pnpm | ✅ |
| ACC-003 | Transcribe both colour layers; `check-design-tokens.mjs` gate | ✅ |
| ACC-004 | Fonts by `@fontsource`; `audit-font-weights.mjs` gate | ✅ |
| ACC-005 | `extract-assets.mjs` — logo + poster out of the bundle | ✅ |
| ACC-006 | `build-gate-sw.mjs` from the real build manifest | ✅ |
| ACC-007 | Root dead end, 404, error boundary | ✅ |
| ACC-008 | `/docs` set, CLAUDE.md, AGENTS.md | ✅ |
| ACC-009 | **Create the Supabase project** | 🟡 project `tjbfvuboyvaephtewjwq` exists and is live. Still needs: keys in `.env.local`, MCP auth, `SUPABASE_DB_URL` in Actions secrets |
| ACC-010 | **Create the Vercel project + DNS** | ⛔ blocked on Vipin/Sal |
| ACC-011 | `db-test.mjs`, `db-state.mjs`, `sql-arity-check.py`, `lib/db-url.mjs` | ▢ needs ACC-009 |
| ACC-012 | `build-design-reference.mjs` + `visual-check.mjs`; settle the Anton bold question | ▢ |
| ACC-013 | CI workflow — app / database / design jobs, database **required** | ▢ needs ACC-009 |

## Phase 1 — Schema and the public surface · 12–17 Sep — **CRITICAL PATH**

| ID | Task |
|---|---|
| ACC-020 | `202609110001_boa_acc_core.sql` — 9 tables, enums, `pass_only_when_approved` CHECK, `ENABLE ALWAYS` immutability triggers |
| ACC-021 | `..._lock_down_privileges.sql` — anon has nothing; column-list grants that omit `pass_token` |
| ACC-022 | `privileges.test.sql` — every table and every function, both roles |
| ACC-023 | `boa_acc_mint_invite` / `boa_acc_org_view` / `boa_acc_submit` + `quota`, `tokens`, `throttle` tests |
| ACC-024 | `/api/s/[token]` + ported `lib/rate-limit.ts` |
| ACC-025 | `/s/[token]` — the Submission screen, transcribed, both themes |
| ACC-026 | `/desk/login` + `/api/admin/invite-operator`; invite Bhoopesh, Salman, 2 approvers |
| ACC-027 | `/desk/orgs` minimal — create org, set quota, mint link, copy |

**Acceptance:** a real link on the production domain accepts 3 people and
**refuses the 23rd against a quota of 22 when called directly with `curl`**;
refuses the 61st in an hour; visual ≤0.8%; `test:db` green and required in CI.

## Phase 2 — Ready to send · 17–19 Sep

| ID | Task |
|---|---|
| ACC-030 | Load all 38 orgs — kinds, quotas, contacts |
| ACC-031 | Mint and label 38 invite tokens; export a WhatsApp-ready list |
| ACC-032 | Submission confirmation copy, duplicate-phone path, closed-org path |
| ACC-033 | `/desk` Control room reading `boa_acc_desk_dashboard()` |
| ACC-034 | Enable PITR |

**Acceptance:** **Bhoopesh opens a link on his own phone, adds himself with a
vehicle, and sees the seat count move.** 38 links ready.

> ### ▶ Milestone A — Sun 20 Sep

## Phase 3 — The desk · 20–26 Sep

| ID | Task |
|---|---|
| ACC-040 | Approval queue — filters, per-row type, bulk, *Approve all →*, rejection reasons |
| ACC-041 | `boa_acc_decide` + `approve_org` + `ledger`/`reissue` tests |
| ACC-042 | Master list — search, CSV, the In BMS / Not in BMS column |
| ACC-043 | Passes — server-rendered QR SVG, A4 print CSS, WhatsApp share |
| ACC-044 | `/desk/aaa` + nomination guard + `aaa.test.sql` |
| ACC-045 | `/desk/devices` — mint/revoke, raw token shown once |

**Acceptance:** 100 real submissions approved through the real queue; 14 passes
print one per A4 and **a phone decodes the QR off the paper**; `pass_token`
provably absent before approval; AAA unstampable without a nomination.

## Phase 4 — The gate · 26 Sep – 3 Oct

| ID | Task |
|---|---|
| ACC-050 | `gate/db.ts` Dexie v1 |
| ACC-051 | Port `outbox-policy.ts` from bar-control; unit tests |
| ACC-052 | `gate/resolve.ts` — pure green/amber/red incl. the pending-outbox amber case |
| ACC-053 | `gate/scanner.ts` — BarcodeDetector + zxing-wasm fallback |
| ACC-054 | `/gate/setup`, `/gate` — transcribed, `force-static`, **+ the sticker input** |
| ACC-055 | `/gate/vehicle` + `vehicle.test.sql` |
| ACC-056 | `/api/gate/*` and the SW precache incl. the `.wasm` |
| ACC-057 | `aeroplane-mode.spec.ts` + the two failure-path tests |
| ACC-058 | **Rehearsal on two real phones, one an iPhone.** Not optional |
| ACC-059 | Print the paper fallback: approved list by org, blank issue sheets |
| ACC-060 | Optimise `boa-logo.png` (290 KB is heavy for a gate precache) |

**Acceptance:** cold start with the radio off renders the scanner and the full
cached roster; every step of the aeroplane-mode spec asserted in CI; both phones
signed off in CURRENT-STATE.md; 4 device tokens minted.

> ### ▶ Milestone B — Sun 4 Oct

## Phase 5 — Live · 4–10 Oct

Freeze. Hot fixes only, each with `db:state` before and after. Daily 08:00
reconcile: bands issued vs ledger, NOT IN BMS chased.

## Cut order, if time runs out

Light theme → CSV export → WhatsApp share → `/desk/aaa` screen → print sheet →
`/gate/vehicle` (survivable only to 8 Oct; security runs a printed plate→sticker
list for 5–7 Oct).

**Cannot be cut:** the submission surface, server-side quota, pass-token-only-
after-approval, the offline scanner and its outbox, ledger immutability, the anon
lockdown.
