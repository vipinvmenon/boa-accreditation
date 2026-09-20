# Cursor: the v2 redesign lane

**Read `docs/CURRENT-STATE.md` first — same rules as any agent on this repo.**
Then read this file in full before claiming ACC-100. It carries findings that
cost a session to establish and that you cannot cheaply rediscover from the
code.

Handoff state: branch `design/scroll-animations`, `af86f75`, **26 commits ahead
of `origin/main` and nothing pushed**. `corepack pnpm task` shows 64/78 done,
nothing claimed in flight. The working tree is **dirty** — see "Before you
start".

This supersedes `docs/CURSOR-NEXT.md`, which described the ACC-093/ACC-099
sign-off lane. Both of those are now `[x]`.

---

## What this lane is

`design/proposals/boa_design_v2.html` is a complete v2 of all seven designed
screens. **It is not a refinement of v1 — it is a shape-language inversion.**
Measured, not assumed:

| | v1 (`design/source/boa_design_body.html`) | v2 |
|---|---|---|
| `border-radius` occurrences | **0** — hard square, everywhere | 47 (27 × `999px` pills, plus 28/22/14px radii) |
| `backdrop-filter` | 0 | glass nav island, status pill, select bar |
| Depth | flat 1px rules | `--lift` two-layer shadows, `--hi` inset highlight, ambient radial orbs, grain overlay |
| Motion | one `120ms` transition, on the nav button | scroll reveals, count-ups, sliding seg thumbs, meter fills, verdict shake, staggered menu |
| Authoring | 560 lines of inline `style` attributes | a real stylesheet: classes, `::before`, `@keyframes`, `@container`, `:has()`, `[aria-checked]` |
| Responsive | media query at **768px** | **container** queries at **1100px and 700px** on `.frame` |
| Nav | full-width sticky bar | floating pill island + status pill + burger drawer |

The app today is a faithful transcription of v1: ~4,500 lines of inline styles
across 15 route files, zero rounded corners, `PROP[theme]` literals threaded
through every screen. **All 7 screens currently pass `test:visual` with 0
BLOCKED and 0 KNOWN GAP** — the first time that has ever been true here
(ACC-098, your own lane). This work spends that. Go in knowing it.

Two things that make it cheaper than it looks, both verified:

1. **The brand tokens are byte-identical.** Diffing the two `[data-theme]`
   blocks: all 15 dark + 15 light values match v1 exactly. v2 *adds* 9 per
   theme (`--hair --shell --glass --hi --lift --orb1 --orb2 --poster-op
   --logo-filter`) plus a `:root` layer (`--ease`, three radii, font-role
   aliases, z-index scale). **Nothing was recoloured.**
2. **The domain contract is untouched.** Same 3 pass types, same 7 zones in the
   same order, same band names, same 7 nav labels, same copy voice.

---

## The decisions, already taken by Vipin — do not relitigate

1. **v2 becomes the pixel contract. v1 is frozen as the domain + colour
   record.** `design/source/boa_design_v2.html` becomes what non-negotiable #1
   points at. `boa_design_body.html` and `boa_design_bundle.html` stay committed
   and **stop changing** — they remain the authority for `TYPES`, `ALL_ZONES`,
   and the C8 two-layer colour record. This split is what keeps the 13
   `design-contract.test.ts` assertions and `check-design-tokens.mjs` check 2
   passing with **zero churn**. Write it up as **ADR-017**.
2. **Shell and primitives first, then one screen per task. `/gate` and
   `/gate/vehicle` last.**
3. **Icons: a local inline SVG set. No CDN, no new npm package.**
4. **The six ungated screens get derived from v2's primitives in a final task.**

### Three things you must not change silently

- **AAA band colour, light theme.** `lib/design.ts` `TYPES` pins AAA
  `colourLight: '#2A2A33'` and `design-contract.test.ts` asserts it against v1.
  v2 renders AAA as `var(--ink)` = `#14141A`. **Keep `#2A2A33`.** `TYPES` is the
  domain contract and a test pins it; v2's `--ink` is a convenience, not an
  intent. Record it in ADR-017 as a deliberate v2 amendment. **Do not "fix" the
  test.**
- **`.tools` and `body.mob` are preview furniture and must not ship.** v2's
  bottom-floating Web/Mob + theme bar sits *outside* `.frame` with
  `role="toolbar" aria-label="Preview"`. `body.mob` draws a 390px rounded device
  mock inside a 1440px page. v1's equivalent toggle was made to ship *because
  the reference captured it* — see CURRENT-STATE, 12 Sep, and the day it cost.
  **Do not repeat that.** Hide `.tools` at capture time for every screen, the
  way `PUBLIC_SCREENS` already hides the shell for submission, and put the theme
  control in the profile menu per ADR-015. State it in ADR-017 so the next agent
  cannot read the reference as intent.
- **Do not click "Mob" for the mobile capture.** `.frame` is
  `container: app / inline-size` and `@container app (max-width: 700px)` fires
  from the **viewport alone** at 390px. Clicking Mob adds the device mock
  instead. Set the 390×844 viewport and nothing else.

---

## The gate rework — do this before writing any UI

Load-bearing. Line numbers below were read first-hand and are real.

### `scripts/check-design-tokens.mjs` — split it, do not re-point it wholesale

Three checks, all currently reading `boa_design_body.html` (line 24):

- **Check 1** (lines 31–47) parses `[data-theme="dark|light"] { … }` from the
  design source and demands `app/globals.css` match byte-for-byte.
  → **Re-point check 1 at `boa_design_v2.html`.** Two consequences:
  - `app/globals.css` must gain all of v2's new tokens (22 *parseable* per
    theme, up from 15).
  - **The declaration regex is `(--[a-z0-9]+)\s*:\s*([^;]+);` — it does not
    match a hyphen in the token name**, so `--poster-op` and `--logo-filter` are
    silently skipped. Widen it to `--[a-z0-9-]+` and confirm the count reaches
    24/theme, or the gate quietly stops covering two tokens.
- **Check 2** (lines 49–75) parses the 11 `const x = dark ? '…' : '…';`
  `renderVals()` literals and compares them to `lib/design.ts` `PROP`.
  → **Leave check 2 reading `boa_design_body.html`.** v2 has no `renderVals()`;
  re-pointing it hard-fails at
  `fail('could not parse renderVals() colour literals')`. Add a comment saying
  *why* the two checks now read two different files, or the next agent will
  "tidy" it.
- **Check 3** (lines 77–110) bans bare `#RRGGBB` outside
  `HEX_ALLOWED = {lib/design.ts, app/globals.css, app/layout.tsx}`.
  → v2 carries one non-token hex: `.qr { background: #F6F4EC }`. Either token it
  or add the new stylesheet to `HEX_ALLOWED` with a stated reason. **Do not
  widen the allowlist to a directory.**

### `tests/unit/design-contract.test.ts` — no change

It reads `boa_design_body.html` for `ALL_ZONES`, `TYPES`, the 11 prop literals,
and the C8 disagreement spot-checks. v1 stays frozen, so all 13 keep passing.
**If a task makes you want to edit this file, stop** — that is the signal that
something is being reconciled that non-negotiable #1 forbids. `git diff` on it
must be empty at the end of ACC-101.

### `scripts/capture-design-reference.mjs` — the real work

Per ADR-008 the reference is generated by driving **the artefact's own
controls** in a real browser, never by re-implementing `renderVals()` in Node.
`BUNDLE` is hardcoded to `boa_design_bundle.html` (line 28) and the script waits
for `#__bundler_thumbnail` to clear and `[data-screen-label]` to appear. v2 has
neither.

- Point it at `design/source/boa_design_v2.html` via `file://`.
- Replace the bundler-thumbnail wait with a real readiness signal —
  `.screen.on[data-s]` present plus `await document.fonts.ready`. **Never a
  timeout.**
- **Nav driving already works unchanged.** v2's `SCREENS` generates buttons
  labelled `Control room / Queue / Master list / Submission / Passes / Gate /
  Vehicle` — the same seven strings the script already clicks by text, mapping
  to the same seven slugs. **`visual-check.mjs`'s `SCREENS` array needs no
  edit.**
- Hide `.tools` for every screen; extend `PUBLIC_SCREENS`' shell-hiding to v2's
  `.nav-wrap` for `submission` (ADR-009 — public surfaces carry no desk nav and
  no live ops numbers).
- Keep `FONT_STABLE_ARGS` from `scripts/lib/browser.mjs` on **both**
  `chromium.launch()` calls. **Do not touch `THRESHOLD = 0.008`**
  (`scripts/visual-check.mjs:55`) — DESIGN-SYSTEM's "CI-vs-local text rendering"
  section is the record of why loosening it is not the answer.

### Make v2 capturable offline — and prove the edit costs nothing

v2 loads fonts from `fonts.googleapis.com` and Phosphor icons from
`cdn.jsdelivr.net`. Both are blocked by the app's own CSP (`middleware.ts:6-8`:
`font-src 'self'`, `style-src 'self' 'unsafe-inline'`), and both make the
*reference* depend on a CDN and on different font binaries than the app ships.
Three minimal edits to the contract file, recorded in ADR-017:

1. Replace the Google Fonts `<link>` with local `@font-face` pointing at the
   repo's own `@fontsource` woff2 — the same files the app serves, so reference
   and app rasterise identical glyphs.
2. Replace the Phosphor CDN `<link>` with the local inline icon set.
3. Add the readiness hook the capture script needs.

**Prove it:** capture once with the CDN links intact, capture again after the
edits, pixel-diff the two sets, record the numbers. If they are not ~0, the
edits changed the design and the difference must be explained, not absorbed.

### Fonts — one real gap

`app/layout.tsx:37-47` imports Anton 400, Oswald 400/500/600/700, Archivo
400/700, JetBrains Mono 400/500/600/700. v2 sets `font-weight: 600` on
`.field label` and `.plist .who`, neither of which sets a family, so both
inherit Archivo → **add `@fontsource/archivo/600.css`** or the browser
synthesises it.

`scripts/audit-font-weights.mjs` parses inline `style` attributes out of the
design source. v2 has none, so **it will pass vacuously and prove nothing.**
Either re-point it at v2's CSS rules or say plainly in ADR-017 that the
font-weight gate is inert under v2 and the import list is hand-maintained. **Do
not leave a gate that passes while covering nothing** — that is the pattern
`boa-bar-control`'s `continue-on-error: true` job set.

### `scripts/build-gate-sw.mjs` — nothing to do, and here is why it matters

It precaches every emitted `.css`, `.js`, `.woff2` and `.wasm` from the build
output, so a new stylesheet and JS-inlined SVG icons are picked up
automatically. **This is precisely why icons must be inline SVG or a React
component, not a webfont or a sprite file:** a webfont needs an explicit
precache entry, and a missing entry rejects the whole `caches.addAll()` and
silently turns the offline gate off. That has already happened once here (see
CURRENT-STATE, "Production, verified 11 Sep").

---

## Before you start: the tree is dirty

Uncommitted at handoff:

- `design/source/boa_design_body.html` and `boa_design_bundle.html` — the 19 Sep
  control-room copy change (hero headline, wristband h2, AAA card), made on
  Vipin's instruction, with `design/reference/` regenerated and 7/7 measured.
- `app/motion.css`, `app/desk/queue/queue-screen.tsx`, `.claude/launch.json`,
  `data/orgs-placeholder.csv`, `docs/ORG-IMPORT.md`, `docs/CURRENT-STATE.md`.
- Untracked: `.playwright-mcp/` (local MCP scratch — do not commit).

`design/proposals/boa_design_v2.html` **is committed**, deliberately and
unmodified, so that `git mv` works in ACC-100 and — more importantly — so the
pre-edit original stays in history. That original is what you pixel-diff the
capturability edits against; without it in git there is nothing to prove the
edits cost ~0 against.

**Commit that work before branching.** A v2 branch on top of an uncommitted
edit to the *outgoing* pixel contract is how the next agent loses a day. While
you are in there, `docs/CURRENT-STATE.md` has the "19 Sep 2026 — 2 of 38 real
org names received" entry **duplicated verbatim** — collapse it to one.

---

## Schedule reality — read before claiming ACC-100

Today is **20 Sep**: Milestone A, links out to 38 orgs, "hard, no slack". It is
slipping for reasons unrelated to design — ACC-030 (load the 38 orgs) and
ACC-031 (mint invite tokens) are both blocked on **ACC-030a**, the real org list
from Bhoopesh. `corepack pnpm task` shows the two NEXT UP items are the blocked
ones, so this lane does not jump the queue.

But it competes for the same fortnight as gate-live on **4 Oct**, after which
the roadmap freezes to hot fixes only.

- ACC-100 → ACC-108 fit before 4 Oct if nothing else lands on this lane.
- **ACC-109 (`/gate` + `/gate/vehicle`) has a hard stop: 2 Oct.** If the two
  gate screens are not converted, `test:visual`-green, `test:e2e`
  aeroplane-mode-green **and** physically rehearsed (ACC-058) by 2 Oct, they
  stay on v1 for BOA 2026 and the app ships with two visual languages. That is
  the correct trade: the offline scanner is on the roadmap's "cannot be cut at
  any price" list and a redesign is not.
- **If ACC-030a lands mid-flight, the org list wins.** `corepack pnpm task
  block` the redesign task with a one-line reason and commit it.

---

## The tasks

Each is one `corepack pnpm task start` claim, one commit, one measured
verification. All are in `docs/ROADMAP.md` as **CU**.

### ACC-100 · Admit v2 as the pixel contract
- Commit the dirty tree first (above).
- `git mv design/proposals/boa_design_v2.html design/source/boa_design_v2.html`.
  Asset paths `../../public/assets/*` stay correct at the same depth — but
  `public/assets/` is **gitignored and generated**, so `corepack pnpm
  assets:extract` must run before any capture.
- Apply the three capturability edits. Nothing else.
- Write **ADR-017** in `docs/DECISIONS.md`: v2 is the pixel contract; v1 frozen
  as the domain + C8 record; the AAA `#2A2A33` amendment; `.tools`/`body.mob`
  are preview furniture; the two container breakpoints (1100/700) supersede the
  single 768px rule; the capturability edits and their measured cost. **Supersede
  ADR-008, do not rewrite it.**
- Update non-negotiable #1 in **`CLAUDE.md` *and* `AGENTS.md`** — they are kept
  byte-identical and `scripts/check-agent-docs.mjs` fails `lint` otherwise. Also
  `.cursor/rules/10-non-negotiables.mdc` and `.cursor/rules/20-ui.mdc`.
- **Acceptance:** `corepack pnpm design:reference` emits 28 PNGs driven from v2;
  the CDN-vs-local diff recorded with real numbers; `lint` green.

### ACC-101 · Split and re-point the token gates
- `check-design-tokens.mjs`: check 1 → v2, check 2 → v1 (frozen), widen the
  token-name regex, resolve the `#F6F4EC` hex.
- `app/globals.css`: add v2's new tokens for both themes, byte-identical to the
  contract. Keep the four sanctioned additions (16px form floor,
  `:focus-visible`, `.sr-only`, reduced motion) — **v2 has its own
  reduced-motion block, so reconcile to one; do not ship two.**
- Add `@fontsource/archivo/600.css` to `app/layout.tsx`.
- Re-point or explicitly retire `audit-font-weights.mjs`.
- **Acceptance:** `lint` green and its success line reports the new token count;
  `corepack pnpm test` still 13/13 on `design-contract.test.ts` with `git diff`
  on that file empty.

### ACC-102 · The v2 primitive layer
- New `app/v2.css`, imported from `app/layout.tsx`, carrying v2's component CSS
  verbatim: `.bz`/`.pl`/`.pad` double bezel, `.btn` (+ `.go .gold .bad .big
  .wide .solo`), `.seg` + `.thumb`, `.st`, `.meter`, `.band`, `.zones`, `.ck`,
  `.sw`, `.reveal`, `.field`, `.search`, `.linkbtn`, `.list`/`.li`, `.rv`,
  `body::before/::after` orbs + grain, and both `@container` tiers.
- `components/icon.tsx` — the 14 Phosphor Light glyphs as inline SVG
  (`arrow-right arrow-up-right caret-down check download-simple
  magnifying-glass moon paper-plane-tilt plus printer scan sort-descending sun
  x`). One component, `aria-hidden`, `currentColor`.
- `lib/use-reveal.ts` — `IntersectionObserver` + count-up as hooks,
  reduced-motion-aware.
- Nothing deleted, no screen changed.
- **Acceptance:** `typecheck`/`lint`/`test`/`build` green; `test:visual` still
  reports the pre-existing v1 numbers. The new CSS is unreferenced, so it cannot
  move a pixel — **if it does, a selector is leaking.**

### ACC-103 · Shared shell: nav island, status pill, mobile drawer
- Rewrite `app/desk/desk-chrome.tsx` and `app/gate/gate-chrome.tsx` onto the
  island: `.nav-wrap`/`.island`/`.brand`/`.links` + sliding `.pip`, `.status`
  pill, `.av` avatar carrying the ADR-015 profile menu (theme control moves in
  here), `.burger` + full-screen `.menu` drawer under 700px.
- `components/site-footer.tsx` → v2 footer. **`.tools` is not ported.**
- `NAV` in `lib/design.ts` is unchanged — same 7 labels, same routes.
- **Acceptance:** this chrome is shared by all four pixel-gated desk screens, so
  per ADR-015's own precedent `test:visual` is mandatory here with recorded
  numbers — even though the screen bodies are still v1 and will fail. **Record
  the intermediate failures honestly rather than skipping the run.**

### ACC-104 · Control room → ≤0.8%, 4 variants
`app/desk/control-room-screen.tsx`. The 12-column `.bento`, `.hero` with
`.hero-art` drift + `.hero-scrim`, six `.stat` tiles with `.meter` fills and
count-ups, `.aaa-card` gold gradient, three `.bandcard`s with `.stripe`
reveals, the `.list` org rows. Drop the inline-style block and the `PROP` import
as the classes take over.

### ACC-105 · Queue → ≤0.8%, 4 variants
`app/desk/queue/queue-screen.tsx`. `.seg` filter pill with sliding thumb, the
sticky glass `.selbar`, `.org-h`, `.qrow` grid with `.ck` and the `.pick`
select, `.q-foot` sums.

**Warning, from your own lane:** ACC-098 burned multiple sessions on the mobile
native `<select>`'s intrinsic grid sizing on *exactly this screen*, and its
writeup says "contract-safe fixes worsened results". v2 restyles that select
heavily (`appearance: none`, pill, `::before` colour dot). **Read ACC-098's
writeup in `docs/CURRENT-STATE.md` before starting, not after the first
failure.** This is the task most likely to blow its estimate.

### ACC-106 · Master list → ≤0.8%, 4 variants
`app/desk/master/master-screen.tsx`. `.search` pill, the 6-column `.mrow`, the
`.ser`/`.plate`/`.when` treatments, `.empty`, and both container tiers' column
collapses.

### ACC-107 · Passes → ≤0.8%, 4 variants
`app/desk/passes/passes-screen.tsx`. The 3-up `.pass` cards, `.bandbox`,
`.vehbox`, `.qr` light plate, hover lift. **The existing `.qr-wrap svg` mask in
`visual-check.mjs` must keep matching** — a locator matching nothing masks
nothing, and the QR would then diff on every run. Check the selector survives.

### ACC-108 · Submission → within its recorded ceiling, 4 variants
`app/s/[token]/submission-screen.tsx`. `.sub-grid`, `.quota` meter, `.field`s,
`.toggle` + `.sw` + `.reveal` grid-rows animation, `.plist` with the `land`
keyframe.
- **ADR-009 holds:** no desk chrome, no live ops numbers on a public surface.
- **ADR-016 holds:** "Your list" is the server-backed org roster.
- The `.s-seat-count` / `.s-seat-bar` masks must keep matching.
- Fold `app/motion.css`'s `s-*` recipes into the v2 layer rather than running
  two motion systems side by side.

### ACC-109 · Gate + Vehicle → ≤0.8%, 4 variants — **hard stop 2 Oct**
`app/gate/page.tsx`, `app/gate/vehicle/vehicle-screen.tsx`. The `.split`, the
`.vf` viewfinder with its four corner brackets and `sweep`, `.last` list,
`.result` panel with `.flood`/`.verdict`/`.gband`/`.note`/`.dock`/`.serial`,
`.plate-in`, `.checks`.
- **Non-negotiable #7 is absolute:** every read from Dexie, every write through
  the outbox. This is a presentation change only — **if your diff reaches
  `gate/db.ts`, `gate/roster.ts` or the outbox, it is out of scope.**
- `corepack pnpm test:e2e` (aeroplane-mode, including true cold service-worker
  navigation) must pass, and `build-gate-sw.mjs`'s precache count must be
  re-read and recorded.
- `@container` on `.frame` must not break the `force-dynamic` gate render.
- **Stop condition:** not green *and* rehearsed by 2 Oct → revert this task,
  ship gate on v1, note it in `CURRENT-STATE.md`. **Do not carry it into the
  freeze.**

### ACC-110 · Derive the six ungated screens
`app/desk/orgs`, `app/desk/aaa`, `app/desk/devices`, `app/desk/users`,
`app/desk/login`, `app/gate/setup`, plus `app/error.tsx` and
`app/not-found.tsx`. No design exists for any of these, so **none are
pixel-gated** — reuse the ACC-102 primitives and say so in the commit. None of
them import `PROP` today, so this is the cheapest conversion in the lane.
`app/desk/operators/page.tsx` stays a bare redirect.

### ACC-111 · Sign-off
- Full gate: `typecheck && lint && test && build`, `check:sql`, `test:db`,
  `test:e2e`, `test:visual`.
- **7/7 screens PASS, 0 BLOCKED, 0 KNOWN GAP** — or gate on v1 per ACC-109's
  stop condition, stated explicitly.
- **Guard-mutation proof:** rename a fixture name in
  `scripts/visual-fixtures/desk.mjs`, confirm the affected screen fails
  `test:visual`, revert. A gate nobody has seen fail is not a gate.
- Live walkthrough at 390px, at **~900px** (the `1100px` container tier —
  `visual-check` captures only 1360 and 390, so this tier has **no automated
  cover**), and in light theme.
- Dated `docs/CURRENT-STATE.md` entry, numbers actually measured.
- Rewrite `docs/DESIGN-SYSTEM.md`'s "How the design gets into the app" — it
  currently says "no component abstraction over the design's own markup", which
  v2's own authoring model reverses.
- **Do not push or deploy.** That is Vipin's call.

---

## Known gaps in this plan, stated rather than hidden

- **The `1100px` container tier has no automated cover.** A third viewport would
  mean 42 comparisons and a third reference set. Not in scope; the gap is real
  and ACC-111's manual walkthrough is the only thing standing in for it.
- **`docs/ARCHITECTURE.md`'s Rendering table still calls `/` "a deliberate dead
  end"**, which ADR-013 reversed on 12 Sep. Unrelated to v2, worth a line while
  ACC-110 is in `app/page.tsx`'s neighbourhood.

## Rules that still apply

- `corepack pnpm <script>` — **`pnpm` is not on PATH.**
- Claim work with `corepack pnpm task start ACC-nnn` and **commit
  `docs/ROADMAP.md` immediately**. An uncommitted `[~]` is invisible to every
  other tool.
- Non-negotiable #10: never tick a task without meeting its acceptance
  criteria; **never write a CURRENT-STATE.md entry claiming a verification you
  did not run.**
- `test:visual` is required for any UI change. **When a screen fails, open the
  `.diff.png` in `test-results/visual/`. Never regenerate the reference to make
  it pass** — that is the exact failure mode `boa-bar-control` shipped.
  Regeneration is legitimate exactly once, in ACC-100, and the diff against the
  previous capture must be recorded.
- **Never push or deploy without Vipin's explicit go-ahead.**
