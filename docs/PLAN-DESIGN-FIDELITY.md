# Design fidelity: Claude / Cursor parallel plan (14–19 Sep 2026)

**Goal:** Submission, Master List and Passes (plus Queue and Control Room)
reproduce `design/source/boa_design_body.html`, **proved by `test:visual`**,
not by reading code.

**Done means:**
- All 7 screens × 2 themes × 2 viewports pass at ≤0.8%.
- 0 BLOCKED and 0 KNOWN GAP.
- Every screen renders from the data layer.
- Deadline **Fri 18 Sep**, so links can go out on 20 Sep.

**Why this exists:** Master, Passes, Queue and Control Room have never been
pixel-compared, because the harness had no operator login. Submission passed
only because of a 32% `KNOWN_GAPS` exemption. Code-reading audits kept missing
differences, so Vipin kept finding them by eye.

## Decisions (Vipin, 14 Sep)

1. **Submission "Your list"** shows the server roster for the token's org:
   name, role, status. No phones.
2. **Submission uses the design's two-step flow.** "Add to list" holds a
   person as a draft; "Submit N for approval →" sends the drafts.
3. **Remove** Master's All / Not in BMS / In BMS tab row and the per-card
   "Send on WhatsApp" button. Their function is kept:
   - The status bar's "N not in BMS" links to `?in_bms=false`.
   - Per-person links stay in the bulk WhatsApp message.

## Step 0: Vipin, before anything else

- Invite a `qa-visual` approver at `/desk/users` and set its password.
- Put `VISUAL_OPERATOR_EMAIL` and `VISUAL_OPERATOR_PASSWORD` in `.env.local`
  in **both** checkouts.
- Add both as GitHub Actions secrets.

## Working rules

- **Separate worktrees and branches:**
  - Claude: `design/claude-harness-submission`
  - Cursor: `design/cursor-desk-screens`
  - Rebase on `main` daily. Claude merges first when there is a conflict.
- **File ownership is exclusive.** To change the other side's file, add a
  line under "Requests" below. Never edit it directly.
- Before any push: `corepack pnpm typecheck && corepack pnpm lint && corepack
  pnpm test && corepack pnpm build`.
- **Rebuild before `test:visual`.** It serves whatever `.next` holds; a stale
  build has faked a pass here before.
- In `docs/CURRENT-STATE.md`, record only numbers you measured.
- Roadmap IDs: Claude **ACC-090–094**, Cursor **ACC-095–099**
  (`docs/ROADMAP.md`, Phase 1b).

## The shared contract (lands first)

Cursor's first push (K0), within the first hour:
- **`lib/schemas/master.ts`** gets `gateLabel: z.string().nullable()` and
  `decidedAt: z.string().nullable()`. API routes return `null` for now.
- **`lib/schemas/pass.ts`** gets a response schema
  `{ passes: (Pass & { qrSvg: string })[] }`.

Claude:
- **`lib/schemas/submission.ts`** gets
  `rosterRowSchema = { fullName, roleText, status: 'approved'|'submitted'|'rejected' }`.
- **`GET /api/s/[token]`** returns `{ org, roster }`.

---

## CLAUDE lane

**Owns:** `scripts/visual-check.mjs`, `scripts/visual-fixtures/**`,
`scripts/capture-design-reference.mjs`, `scripts/check-bundle-content.mjs`,
`supabase/**`, `app/s/**`, `app/api/s/**`, `lib/schemas/submission.ts`,
`docs/DECISIONS.md`, `docs/SECURITY.md`, this file.

### ACC-090 · C1 · Visual harness that measures every screen (Tue 15)

**Desk fixtures** in `scripts/visual-fixtures/desk.mjs`:
- Copied from the design's own `MASTER`, `SHEET` and status-bar numbers.
- Parsed with the real Zod schemas.
- Served through `page.route('**/api/desk/{master,passes,dashboard,operators,queue}')`,
  the same pattern as the existing Dexie seeding for the gate.

**Submission fixture:** the design's 4 people, seeded through real RPCs and
wiped in `finally`.

**`KNOWN_GAPS` percentages become named `MASKS`.** Only these regions:
- the QR codes (the design draws a fake pattern)
- Submission's seat count and bar (the design says 14 used but lists 4)
- the profile-menu slot (ADR-015)

**Guards:**
- A design fixture name found in `app/`, `lib/` or `components/` fails
  `check-bundle-content`.
- `test:visual` refuses to run on a stale build.

**Output:** a review page at `test-results/visual/index.html`, and baseline
numbers published below.

### ACC-091 · C3 · `boa_acc_org_roster(p_token)` + pgTAP + privileges + ADR-016 (Wed 16)

### ACC-092 · C4 · Submission screen (Wed 16–Thu 17)

- Drafts saved in `localStorage` per token.
- "Submit N for approval →" sends the drafts one by one, with a result on
  each row:
  - `duplicate_phone`: mark the row already registered and drop it.
  - `quota_exceeded`: stop; the remaining drafts are kept.
- Check the per-token throttle first.
- Roster merged into "Your list": approved `grn`, submitted `gold`, rejected
  `bad`, Draft `ink3`.
- Remove `submission` from `KNOWN_GAPS`.

### ACC-093 · C5 · Merge, full gates, 7/7 PASS, Vipin review, deploy (Fri 18)

---

## CURSOR lane

**Owns:**
- `app/desk/**` (except `app/desk/users`)
- `app/api/desk/{master,passes,queue,dashboard}/**`
- `app/responsive.css`, `app/hover.css`
- `lib/design.ts`, `lib/format.ts` (new)
- `components/site-footer.tsx` (new)
- `app/gate/gate-chrome.tsx` (footer swap only)
- `lib/schemas/{master,pass,queue}.ts`
- `docs/DESIGN-SYSTEM.md`

Until C1's baseline lands, work from the findings below. After that, run
`corepack pnpm build && corepack pnpm test:visual --only <screen>` after
every item.

### ACC-095 · K0 contract + K1 shared shell (Tue 15)

- **K0:** the contract above.
- **D1 — no footer.** `app/desk/desk-chrome.tsx` renders none, but the Master
  and Passes references show one. Create `components/site-footer.tsx` from
  `app/gate/gate-chrome.tsx:49`. Use it in DeskChrome and GateChrome.
  (Claude swaps Submission's copy.)
- **D2 — logo filter** (design line 822). Dark theme:
  `drop-shadow(0 0 16px rgba(0,245,165,0.45))`. Light theme: `none`.
  - Thread it through `lib/design.ts`, never as a hex literal in CSS.
  - `app/desk/passes/passes-screen.tsx:73` currently does the reverse
    (`invert(1)` in light, nothing in dark).
  - Check the header logo too.
- **D3.** Make the status bar's "N not in BMS" a link to
  `/desk/master?in_bms=false`.
- **`.d-h1b`** in `app/responsive.css`: 34px on mobile,
  `clamp(38px,4.4vw,58px)` on desktop (design `h1b`, line 818). It replaces
  `.passes-h1` and the hardcoded H1s.

### ACC-096 · K2 Master List (Tue 15–Wed 16)

Compare `app/desk/master/master-screen.tsx` against design lines 214–244 and 703–725.

- **M1.** H1 `clamp(42px,7vw,68px)` (line 96) → `.d-h1b`.
- **M2.** Remove the tab nav (lines 118–133). Read `?in_bms=` from the URL.
- **M3.** Export CSV (line 113): padding `16px 18px`, and no `buttonStyle`
  (which forces 44px height and `10px 16px` padding).
- **M4.** Type cell (line 152): `gap:9px; min-width:0`. With no type, show
  "—" and an ink3 swatch, not the raw status.
- **M5.** Band column:
  - Voided or rejected rows show **"Voided"** in `bad`. Currently they show
    "Not issued".
  - Serials show as `#0412`.
- **M6.** Collected column must read `09 Oct 14:02 · Gate 1` /
  `08 Oct 11:15 · Desk` / `Not collected` / `Rejected 05 Oct` (in `bad`).
  - Today it reads `Issued 09 Oct, 14:02`: no gate, a stray comma, no date
    on rejected rows, and the wrong colour.
  - The API (`app/api/desk/master/route.ts`) should add
    `boa_acc_checkin.gate_label` and the person's decision timestamp. Read
    `supabase/migrations/202609121800_boa_acc_decide.sql` for the column
    name; don't edit it.
  - Add a single formatter to `lib/format.ts` with
    `timeZone:'Asia/Kolkata'`.
  - The CSV includes the gate label.
- **M7.** Loading, empty and error `<p>`s (lines 135–137) become table-style
  rows: `15px 18px`, mono 10.5px, ink3.
- **M8.** Drop `paddingBottom:64px` and `minHeight:100vh` (line 90).

### ACC-097 · K3 Passes (Wed 16–Thu 17)

Compare `app/desk/passes/*` against design lines 319–386 and 740–756, 807–809.

- **P1.** Header padding `38px 34px` (line 51) → `.d-pad-sec`.
- **P2.** Remove the per-card WhatsApp button (lines 106–108).
- **P3.** On mobile, use the title "One person, one pass" and the mobile
  blurb (design 808–809). Switch with a CSS media query, not JavaScript.
- **P4.** QR: 117px on screen (a 13×9px grid) inside a white box with 16px
  padding, so the box is 149px.
  - Today it's `min(100%,260px)`, which makes every card about 110px taller
    than the design.
  - Print size ≥35mm. Keep the literal-white quiet zone.
- **P5.** Copy the band box's inner flex wrapper (design 352–356).
- **P6.** Empty state row: "No approved passes yet — approve in the queue →".
  Hide "Print 0 passes".
- **P7.** Move QR generation from `app/desk/passes/page.tsx` into
  `GET /api/desk/passes`, returning `qrSvg`. `PassesScreen` fetches
  client-side with loading and error rows, so the harness can supply
  fixtures.
- Print preview: A4, one card per page.

### ACC-098 · K4 Queue + Control Room (Thu 17)

- Queue: the 10 findings in `docs/DESIGN-QA-2026-09-14.md`, using that
  document's default resolutions.
- Control Room: fix whatever the harness measures above 0.8%.

### ACC-099 · Cursor sign-off (Thu 17 / Fri 18)

- Every owned screen passes ≤0.8% on all 4 variants in Cursor's own run.
- Numbers go in CURRENT-STATE.md.

---

## Timeline

| Day | Claude | Cursor |
|---|---|---|
| Mon 14 | This doc → start C1 | K0 contract |
| Tue 15 | C1 harness + baseline | K1 shell, K2 Master |
| Wed 16 | C3 roster RPC, start C4 | K2 measured, K3 Passes |
| Thu 17 | C4 Submission ≤0.8% | K3 measured, K4 Queue/Control Room |
| Fri 18 | C5 merge, 7/7 PASS, review, deploy | Integration fixes in own files |
| Sat 19 | Buffer | Buffer |

## Baseline numbers (measured by C1, 15 Sep 2026)

`corepack pnpm build && corepack pnpm test:visual`, branch
`design/claude-harness-submission`. **7/7 screens compared, 0 blocked.** Limit
0.8% everywhere except Submission's transitional 32% (removed by ACC-092).

| Screen | dark/web | light/web | dark/mob | light/mob | Height ref → got (web) |
|---|---|---|---|---|---|
| control-room | 3.41% | 3.42% | 2.92% | 2.94% | 2190 → 2121 |
| queue | 9.52% | 9.40% | 9.67% | 9.81% | 1164 → 1203 |
| master | 10.88% | 10.72% | 6.01% | 5.79% | 1009 → 1059 |
| submission | 29.99% | 29.97% | 26.65% | 26.57% | 1224 → 936 (known gap) |
| passes | 65.43% | 142.55% | 42.92% | 120.52% | **redirects to /desk/login** until P7 |
| gate | 0.37% ✅ | 0.36% ✅ | 0.67% ✅ | 0.66% ✅ | match |
| vehicle | 0.15% ✅ | 0.13% ✅ | 0.31% ✅ | 0.29% ✅ | match |

**How to measure (Cursor):**
- Run `corepack pnpm build && corepack pnpm test:visual -- --screen master`
  (or another screen name).
- Open `test-results/visual/index.html` for reference | actual | diff.
- The harness refuses a stale build.

**No login needed.** Desk screens get the design's data through `/api/desk/*`,
served in the browser from `scripts/visual-fixtures/desk.mjs`. The screens
still fetch and Zod-parse normally. ACC-090a is optional.

**Named masks** (painted magenta in both images before diffing). Cursor: fold
these into DESIGN-SYSTEM.md.
- **`button[aria-label="Operator menu"]`**, on every desk screen. ADR-015: the
  profile menu sits in the design's theme-button slot.
- **`h2:has-text("on site")`**, on Control Room. The design lists 7 orgs under
  a "38 companies" heading; real data can't be both.
- **`.qr-wrap svg`**, on Passes. The design draws a fake pattern; real passes
  carry real QR codes.

**Fixture contract:** `tests/unit/visual-fixtures.test.ts` parses every fixture
with the screens' own schemas on each commit. If K0 or P7 change a schema, add
a Request rather than editing the fixture.

## New findings from the first real captures (not in the code audit)

- **D4 · The status bar denominator is wrong** (`desk-chrome.tsx`).
  - It shows `bandsIssued / sum(org quotas)`, which reads "184 / 210".
  - The design's "184 / 612" is bands issued over **approved**
    (`dashboard.approvedTotal`).
  - → ACC-095.
- **M9 · Master is not centred.**
  - The design's `<main>` centres the 1280px shell, so rows start at x=58 on a
    1360px viewport.
  - Master's shell sits flush left: rows start at x=18.
  - Control Room centres itself; check Queue and Passes too.
  - Best fixed once, in DeskChrome's content wrapper. → ACC-095/096.
- **D1 confirmed.** Control Room is 69px shorter than the design, and the
  footer is missing.

## Requests (cross-lane changes — add a line, the owner does it)

- Claude → Cursor: fold the three masks above into `docs/DESIGN-SYSTEM.md`
  ("Additions to the design").
