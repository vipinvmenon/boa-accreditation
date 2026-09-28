# Redesign r10: the build plan

> **Status: ADR-027 accepted 28 Sep 2026 (ACC-178). Next: ACC-179.** Until
> ACC-179 lands, the gates still read `design/source/boa_design_v2.html`, so no
> screen work starts before it.

This is the one document every agent on the redesign reads: Claude Code,
Cursor, and any subagent either of them spawns. It says what we are building,
in what order, who builds each part, with which model, and how the parts come
back together without stepping on each other. Task state lives in
`docs/ROADMAP.md` under **Phase RD** (ACC-178 to ACC-193), and nowhere else.

**Read with:** `DESIGN.md` (the spec: tokens, primitives, do's and don'ts),
`docs/ux-audit-r2.md` (why: findings F-01 to F-37, remove list R-01 to
R-39), and the proposal page for your screen.

---

## 1. What is fixed

| | |
|---|---|
| **The design** | `design/proposals/r8-*.html` and `design/proposals/r8/` as of r10.5, reviewed with Vipin screen by screen from 28 Sep. ACC-179 freezes them into `design/source/r10/`. |
| **Hard dates** | Gate live **Sun 4 Oct**. From 4 Oct: hot fixes only. Everything in this plan lands by **Sat 3 Oct** or is cut. |
| **Gate hard stop** | If the `/gate` redesign is not green by **Sat 3 Oct 18:00 IST**, the gate ships unchanged (on v2). No discussion on the day. |
| **Gate behaviour** | Frozen. Every read from Dexie, every write through the outbox, no new network path (non-negotiable #7). `tests/e2e/aeroplane-mode.spec.ts` passes after every gate commit. |
| **Libraries** | `motion` (import from `motion/react`) is allowed. On the gate it must be in the service-worker precache and respect reduced motion. React Bits: TS-CSS variants only, copied into the repo, no Tailwind. No three, ogl or WebGL. |
| **Icons and fonts** | Phosphor Light only. No SF Pro or SF Symbols (licensed for Apple platforms). Fonts via `@fontsource`, not `next/font` (DESIGN-SYSTEM.md explains why). |
| **Approved pieces kept as they are** | The pass as a ticket (`components/pass-ticket.tsx`, ADR-025), the poster sign-in (ADR-026), the footer (ACC-176b). They are reskinned onto the new tokens and not re-laid out. |
| **Everything else in CLAUDE.md** | Still holds. The redesign changes non-negotiable #1 only (ADR-027). |

## 2. Decisions

| # | Decision | Status |
|---|---|---|
| D1 | r10 replaces v2 as the pixel contract (ADR-027, supersedes ADR-017's pixel clause; v1 stays the domain and C8 record) | **Accepted 28 Sep (Vipin)** |
| D2 | Body font: Instrument Sans (default), Hanken Grotesk or Manrope. Display stays Anton, labels Oswald, mono JetBrains Mono | **Instrument Sans, chosen 28 Sep (Vipin).** Self-hosted via `@fontsource` in ACC-179. Builders still use `var(--f-body)` only |
| D3 | `test:visual` references are regenerated **from the built r10 app** once Vipin has signed each screen off (ACC-191), then held at ≤0.8% as a regression gate. The pixel match against the proposal HTML is a side-by-side review, not a script | Sanctioned 28 Sep (Vipin), once per screen after sign-off |
| D4 | While screens migrate one at a time, a migrated screen's `test:visual` fails against the v2 reference. That failure is expected and recorded in the task's commit, never "fixed" by editing the reference early | Part of ADR-027 |
| D5 | Passes: bulk print is dropped. Gate: the result appears in place, above the fold (F-01). Users: role change is added | Decided by Vipin during review |
| D6 | Liquid glass is a web approximation: `backdrop-filter`, a 1px edge, an inner highlight. The widget blur runs only on `(hover:hover) and (min-width:900px)`. There is **no** backdrop blur on phones or on the gate | Decided by Vipin during review (r10.4) |
| D7 | Proposal elements with no data source are **not built** until a task adds the source. Never hardcode a proposal number (`check-bundle-content.mjs` fails on it) | Rule |

## 3. How the port works

### 3.1 Where things go

| From (proposal) | To (app) | Built in |
|---|---|---|
| `r8/tokens.css` | `app/r10/tokens.css` | ACC-180 |
| `r8/ui.css`, collapsed to final values (no r9 to r10.5 layer history, no `!important`) | `app/r10/base.css` (shell, background, bezel, glass), `app/r10/primitives.css` | ACC-180 |
| `r8/ui.js`: `openSheet`, `toast`, `countUp`, `hold`, drag-to-close | React primitives in `components/r10/` using `motion/react` | ACC-181a/b |
| `R8.shell` (nav island, footer, ambient) | `components/r10/shell/` plus `app/desk/desk-chrome.tsx` | ACC-182 |
| `r8-<screen>.html` | `app/desk/<screen>/<screen>-screen.tsx` (rewritten in place) | ACC-183 to 190 |
| `r8/data.js` | **Nothing.** Screens read `/api/desk/*` or Dexie as they do now | never |

### 3.2 Scope, so v2 and r10 can live side by side

Every migrated screen's root element carries `className="r10"`, and all r10
CSS is nested under `.r10`. Unmigrated screens keep `app/v2.css` untouched.
Nothing is deleted until every screen has moved (ACC-192). This lets screens
merge one at a time, in any order, without breaking the ones not yet done.

### 3.3 The 13 primitives

Button (with a HoldButton variant), Field, Select, Chip, FilterBar,
StatusPill, CountDot, Card (Spotlight), Sheet, Table, EmptyState, Skeleton,
Toast. Specs are in `DESIGN.md` → Primitives. The live reference is
`design/proposals/r8-primitives.html`. A screen task **uses** primitives and
never forks one. If a primitive is missing something, the screen task records
it in its commit, and the orchestrator adds it to the primitive in a separate
commit.

### 3.4 What each screen has data for today

| Screen | In the data layer now | Proposal-only (needs a source first, or is cut) |
|---|---|---|
| Control room | `lib/schemas/dashboard.ts`: bands not collected, stickers, BMS, AAA, orgs with quota and used ("furthest behind") | "At the gates today" counts per gate, and the latest-issues feed → **ACC-183a** adds them. The week timeline is static dates from CLAUDE.md, which is allowed |
| Master list | `master.ts`, org filter, BMS flag | none known |
| Passes | `pass.ts`, send state | preset counts derive from the list |
| Organisations | `org.ts` | none known |
| Users | `operator.ts` | role change needs the existing operators API to accept a role; check before building |
| Gate / Vehicle | Dexie cache, outbox | none. **No new reads.** |

## 4. Waves and lanes

`C` is a Claude Code agent and `X` is a Cursor agent. Model notes are in §5.
All due dates are IST. The full acceptance criteria for each task are on its
line in ROADMAP.md.

```
Mon 28  W0  ACC-178 (Vipin) ─▶ ACC-179 contract + tooling
Tue 29  W1  ACC-180 tokens/base ─▶ ACC-181a (C) ║ ACC-181b (C) ─▶ ACC-182 shell      Cursor: ACC-147, then ACC-188
Wed 30  W2  ACC-183 Control room (C) ║ ACC-183a data (C) ║ ACC-184 Master (X) ║ ACC-186 Orgs (X)
Thu  1  W2  ACC-185 Passes (C) ║ ACC-187 Users (X) ║ ACC-188 sign-in, pass, cold screens (X)
Fri  2  W3  ACC-189 Gate (C, only after ACC-147 is done) ║ ACC-190 Vehicle (C)
Sat  3  W4  ACC-191 references ─▶ ACC-193 re-crawl + critique  ║  ACC-192 cleanup (cut first)
            18:00 gate hard stop
```

| Task | What | Lane | Agent | Depends on |
|---|---|---|---|---|
| ACC-178 | Accept ADR-027, choose the body font, sanction the reference regeneration | Vipin | — | — |
| ACC-179 | Freeze the contract, flip non-negotiable #1, re-point the token gate, parallel claims in `task.mjs`, add dependencies | C | `rd-builder` (effort high) | 178 |
| ACC-180 | `app/r10/` tokens and base CSS, scoped `.r10` | C | `rd-builder` | 179 |
| ACC-181a | Button, HoldButton, Field, Select, Chip, FilterBar, StatusPill, CountDot | C | `rd-builder` | 180 |
| ACC-181b | Card, Sheet, Table, EmptyState, Skeleton, Toast, CountUp | C | `rd-builder` | 180 |
| ACC-182 | Desk shell: nav island, footer, background, page frame | C | `rd-builder` | 181a, 181b |
| ACC-183 | Control room | C | `rd-builder` (effort high) | 182 |
| ACC-183a | Dashboard: gate counts today and latest issues (read-only, pgTAP, Zod) | C | `rd-builder` (effort high) | 179 |
| ACC-184 | Master list: FilterBar chips, clear-all, org filter, sticky header, person sheet | X | `cursor-rd-builder` | 182 |
| ACC-185 | Passes: preset chips, glass sheet with the ticket, ACC-160's count and confirm | C | `rd-builder` | 182 |
| ACC-186 | Organisations | X | `cursor-rd-builder` | 182 |
| ACC-187 | Users, with role change | X | `cursor-rd-builder` | 182 |
| ACC-188 | Reskin sign-in, pass page, 404, error, invalid pass (layouts unchanged) | X | `cursor-rd-mechanic` | 180, and ACC-147 finished |
| ACC-189 | Gate: result in place, no glass, behaviour frozen | C | `rd-gate` + `rd-reviewer` | 182, **ACC-147** |
| ACC-190 | Vehicle (absorbs ACC-166) | C | `rd-gate` + `rd-reviewer` | 182 |
| ACC-191 | Regenerate `test:visual` references from the built app | C | `rd-mechanic` | 183 to 190 signed off |
| ACC-192 | Delete dead v2 CSS and unused fonts; the token gate reads r10 only | C | `rd-builder` | 191 |
| ACC-193 | Re-crawl 1440/390 dark/light; critique and accessibility pass; update CURRENT-STATE | C | `rd-mechanic` crawls, the orchestrator critiques | 191 |

**The split is by page (Vipin, 28 Sep).** Each page belongs to exactly one
tool, for every task that touches it, so the two tools never edit the same
file. Claude Code owns the foundation that every page uses (tokens,
primitives, shell), plus the pages with the most risk: the Control room (a new
RPC), Passes, and the gate and vehicle (the offline invariant). Cursor owns
the Master list, Organisations, Users, and the reskinned pages whose layouts
are already approved. If one tool runs out of limits, the other may take its
page, but only after the owner has run `task block` on it.

### 4.1 Page ownership

| Page | Route | Tool | Tasks | Files only this tool edits |
|---|---|---|---|---|
| **Foundation** | (all) | **Claude** | 179 to 182, 191 to 193 | `app/r10/**`, `components/r10/**`, `app/dev/r10/**`, `app/layout.tsx`, `app/desk/desk-chrome.tsx`, `components/site-footer.tsx`, `components/states/**`, `components/loading-skeleton.tsx`, `package.json`, `scripts/**`, `design/reference/**`, `tests/e2e/chrome-interactions.spec.ts` |
| Control room | `/desk` | **Claude** | 183, 183a | `app/desk/page.tsx`, `app/desk/control-room-screen.tsx`, `app/desk/double-issue-panel.tsx`, `app/api/desk/dashboard/**`, `lib/schemas/dashboard.ts`, new migrations and pgTAP for 183a |
| Passes | `/desk/passes` | **Claude** | 185 | `app/desk/passes/**`, `app/api/desk/passes/**` |
| Gate | `/gate` | **Claude** | 189 | `app/gate/*` except `vehicle/`; visual only. Cursor's ACC-147 edits it first and must be `[x]` before 189 starts |
| Vehicle | `/gate/vehicle` | **Claude** | 190 | `app/gate/vehicle/**` |
| Master list | `/desk/master` | **Cursor** | 184 | `app/desk/master/**`, `tests/e2e/org-filter.spec.ts`, `tests/e2e/desk-tiers.spec.ts` |
| Organisations | `/desk/orgs` | **Cursor** | 186 | `app/desk/orgs/**` |
| Users | `/desk/users` | **Cursor** | 187 | `app/desk/users/**`, `tests/e2e/users.spec.ts` |
| Sign-in | `/desk/login` | **Cursor** | 188 | `app/desk/login/**`, `tests/e2e/login-return-path.spec.ts` |
| Pass, 404, errors | `/p/[token]`, not-found, error | **Cursor** | 188 | `app/p/**`, `components/pass-ticket.tsx`, `app/ticket.css`, `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx`, `tests/e2e/pass-page.spec.ts` |

Two edges to watch:
- **The ticket** is Cursor's (`pass-ticket.tsx`, `ticket.css`). Claude's
  Passes sheet only renders it and styles it from outside, under
  `.r10 .passes .sheet`. If the sheet needs a prop or class the ticket lacks,
  Claude asks in the ACC-185 report, and Cursor adds it.
- **A page that needs a shared file changed** (a primitive, the shell, a
  token) says so in its task report. It never edits the file. Claude makes
  the change on main, and the page rebases onto it.

## 5. Agents and models

The definitions are committed, so both tools load them automatically:
`.claude/agents/rd-*.md` (Claude Code) and `.cursor/agents/cursor-rd-*.md`
(Cursor). Cursor also reads `.claude/agents/`, which is why the Cursor ones
carry their own prefix.

| Role | Claude Code | Cursor | Used for |
|---|---|---|---|
| **Orchestrator** | The main session: **Opus**, high effort | The main chat, on your pick | Claims, spawning, merging, one review per risky diff. Writes no screen code |
| **Builder** | `rd-builder`: **Sonnet**, medium (high for 179, 183, 183a) | `cursor-rd-builder`: `inherit`, so pick Sonnet in the model menu | Tokens, primitives, shell, screens |
| **Gate builder** | `rd-gate`: **Sonnet**, high | not used, because the gate stays in Claude Code | ACC-189, ACC-190 |
| **Mechanic** | `rd-mechanic`: **Haiku**, low | `cursor-rd-mechanic`: `composer-2` | Reskins, reference regeneration, crawls, renames |
| **Reviewer** | `rd-reviewer`: **Opus**, high, read-only | `cursor-rd-reviewer`: `claude-opus-5[effort=high]`, read-only | One pass over `git diff main...` for 179, 183a, 189 and 190, and any diff touching `lib/`, `supabase/` or `scripts/build-gate-sw.mjs` |
| **Verifier** | `rd-verify`: **Haiku**, low | `cursor-rd-verify`: `composer-2` | Runs the gates and returns only the failures |

### Token rules (these matter more than the model choice)

1. **Subagents do not read `docs/CURRENT-STATE.md`.** It is 5,800 lines. The
   orchestrator reads it once per session. A subagent spawned for one RD task
   reads this file, its task line, the named `DESIGN.md` sections, its
   proposal page, and the file it is replacing. Nothing else unless it hits a
   question.
2. **Never open** `design/source/boa_design_v2.html`, `boa_design_bundle.html`,
   `docs/ux-audit/screens-r2/`, or the proposal history files
   (`ux-directions*.html`). They are large and are not the contract.
3. **One screenshot round per task**: 1440 and 390, dark, taken together.
   Fix everything it shows, then confirm once. No open-ended polishing.
4. **Gates run in the verifier, not the builder.** The builder's context
   gets back only failing test names and their first error lines.
5. **Reviews see the diff only.** One reviewer pass per risky task, not one
   per commit.
6. **One task, one agent, one worktree.** A builder does not "also fix" a
   neighbouring screen. It notes the problem in its commit message instead.

## 6. Running in parallel without collisions

1. **Claim on main, build in a worktree.**
   ```bash
   corepack pnpm task start ACC-184
   git add docs/ROADMAP.md && git commit -m "chore(ACC-184): start" && git push
   git worktree add ../boa-rd-ACC-184 -b rd/ACC-184
   ```
   Claude Code subagents get a worktree automatically (`isolation: worktree`
   in their definition). In Cursor, run the worktree command in the terminal
   and open that folder, or use Cursor's own parallel-agent worktrees.
2. **Ports:** each worktree runs `corepack pnpm dev -p 30NN`, where NN is the
   last two digits of the task ID (ACC-184 uses 3084). The main checkout
   keeps 3000.
3. **File ownership:** §4.1 is the rule. A task edits only the files of the
   page it owns, and page-specific CSS goes under `.r10 .<page>` in that
   page's folder. The foundation row belongs to Claude.
4. **Merging:** the orchestrator merges in wave order. For each branch:
   `git rebase main`, the verifier runs the gates, then fast-forward to main
   and `corepack pnpm task done ACC-nnn`. If two tools finish at once, the
   first to push wins and the second rebases. Roadmap edits are one line
   each, so they rebase cleanly.
5. **Out of limits mid-task:** `corepack pnpm task block ACC-nnn "where it
   stopped"`, commit and push the worktree branch, then commit the roadmap on
   main. The other tool picks it up from the branch.

## 7. Definition of done for every RD task

- It renders from the data layer. Nothing from `r8/data.js`, and no
  hardcoded counts.
- `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
  passes (`task done` enforces this).
- The e2e specs for its screen pass: `org-filter`, `users`,
  `chrome-interactions`, `desk-tiers`, `login-return-path`, `pass-page`.
  Selectors may change where the markup changed. Assertions may not weaken.
- Gate tasks: `aeroplane-mode.spec.ts` and `two-phone-sync.spec.ts` pass,
  and `motion` is in the service-worker precache (`public/gate/sw.js`, generated by `scripts/build-gate-sw.mjs`).
- One screenshot pair (1440 and 390, dark) is attached to the commit
  description or the PR, next to the proposal page at the same size.
  Light mode is checked in ACC-193.
- `prefers-reduced-motion`: nothing moves. `prefers-reduced-transparency`:
  every glass surface falls back to solid.
- Accessibility: focus visible, 44×44 targets on phones, text at 4.5:1
  (F-14's light `--ink3` is fixed in ACC-180 tokens), and the sheets trap
  focus and close on Escape.
- `test:visual` for the screen is **expected to fail** until ACC-191 (D4).
  Record the number in the commit and move on.

## 8. Cut order, if time runs out

Cut from the top; each line is independent:

1. ACC-192 cleanup (move it to after the show)
2. ACC-183a gate feed (the Control room renders without that card)
3. ACC-188 reskins of sign-in, pass and cold screens (they keep v2 tokens; the layouts are already approved)
4. ACC-187 Users, ACC-186 Organisations (they stay on v2 inside the new shell)
5. ACC-189/190 gate and vehicle: **automatically at Sat 3 Oct 18:00**

Never cut: ACC-179 to ACC-182 (every screen depends on them), and ACC-191 for
any screen that shipped (without it, `test:visual` stays red).

## 9. Collisions with the critical path (read before claiming)

- **ACC-147** (the check-in desk for up to 10 issuers, due 30 Sep) edits
  `/gate`. ACC-189 must not start until ACC-147 is `[x]`. If ACC-147 slips
  past Fri 2 Oct, ACC-189 is cut and the gate ships unchanged.
- **ACC-160** ("Send all unsent" gets a count and a confirm) and **ACC-185**
  (Passes) touch the same screen. If ACC-160 is not done when ACC-185 starts,
  ACC-185 carries ACC-160's acceptance and both close together.
- **ACC-166** (vehicle at 390px) is absorbed by ACC-190.
- **Non-RD tasks follow the page split too:** ACC-160 (Passes) goes to
  Claude, and ACC-167 (pass copy) goes to Cursor, because it edits `lib/pass-copy.ts` and
  the pass page.
- **ACC-177** (primitives after the show) is superseded by ACC-181a/b if
  Phase RD lands.
- **ACC-144** (WhatsApp send) is unaffected, but it is ahead of this lane in
  priority. Do not take an agent off ACC-144 or ACC-147 to speed up RD.

## 10. Spawn prompts

**Claude Code, orchestrator** (paste into a new Opus session):

> Read `docs/REDESIGN.md` and run wave Wn. For each task in the wave: claim
> it on main, then spawn `rd-builder` (or the agent named in §4) with the
> task ID and nothing else. The agent brief carries the rules. While they
> run, do not read their files. When one returns, run `rd-verify` on its
> branch, then `rd-reviewer` if §5 says so, merge per §6, and run
> `task done`. Report one line per task.

**Cursor, orchestrator** (Agent chat, any model):

> Read `docs/REDESIGN.md`. Take the Cursor pages in §4.1 whose tasks are
> unblocked and not claimed. For each one: claim it on main, create its worktree per §6,
> and delegate it with `/cursor-rd-builder ACC-nnn`. Then run
> `/cursor-rd-verify ACC-nnn` on the branch. Merge per §6.

**Any agent, single task, no orchestrator:**

> Build ACC-nnn per `docs/REDESIGN.md`. Read only what §5 rule 1 lists.
