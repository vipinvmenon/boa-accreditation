# BOA Accreditation — UI primitive & design-value inventory

Scope read in full: `app/globals.css`, `app/v2.css`, `app/ticket.css`, `app/motion.css`,
`app/hover.css`, `app/responsive.css`, `app/phosphor.css`, every `app/**/*.tsx` screen/chrome
file, every `components/**` file, `lib/design.ts`, `docs/DESIGN-SYSTEM.md`. Trivial
`page.tsx` wrappers (just `<DeskChrome><XScreen/></DeskChrome>`) are omitted from
file:line lists below since they add no styling.

Context the reader needs: this app is a *deliberate transcription* of a frozen design
(`design/source/boa_design_v2.html`) plus additions for a11y/offline. Two colour layers
are **intentionally** contradictory (C8, see DESIGN-SYSTEM.md) — those are not bugs and
are excluded from the "inconsistency" framing below except where noted. Several classes
(`.selbar`, `.ck`, `.sw`/`.toggle`, `.pick`, `.qrow`, `.org-h`, `.q-foot`, `.void`,
`.name-search-result` caret select) are **dead CSS** left over from the Queue/vendor
screens retired by ADR‑019 (22 Sep) — flagged where relevant because dead styling that
still matches new markup by accident is a latent inconsistency risk.

---

## 1. Buttons

Primitive: `.btn` (`app/v2.css:150`) — pill, `min-height:50px`, `padding:6px 6px 6px 22px`,
`border-radius:999px`, `font: var(--label) 13px/600/.12em/uppercase`. Variants layered via
extra classes:

| Variant | Class | Rule | File:line |
|---|---|---|---|
| Default (outline) | `.btn` | transparent bg, inset 1px `--rule` ring | v2.css:150 |
| Primary / go | `.btn.go` | `--bb: var(--grn)`, on-colour text | v2.css:156 |
| Gold | `.btn.gold` | `--bb: var(--gold)` | v2.css:158 (defined; **never used** in any `.tsx`) |
| Danger | `.btn.bad` | outline only, `--bf: var(--bad)` | v2.css:159 |
| Wide | `.btn.wide` | full width, centered | v2.css:164 |
| Big | `.btn.big` | `min-height:64px`, Anton 24px label | v2.css:162 |
| Solo (compact) | `.btn.solo` | `padding:6px 22px`, no icon slot | v2.css:151 |
| Icon-only badge | `.btn .ic` | 38×38 circular icon chip (`.btn.big .ic` 52×52) | v2.css:152, 163 |
| Numbered badge | `.btn .n` | inline count pill | v2.css:161 |
| Disabled | `.btn:disabled` | shell bg, ink3 text | v2.css:343 |
| Text/link button | `.linkbtn` | no pill, underline-less, arrow-translate hover | v2.css:288; used control-room-screen.tsx:239, login-form.tsx:291/319/360, inline-error.tsx:27 |
| Row action (dead) | `.void` | pill, 8px×12px pad, **no min-height, no current `.tsx` usage** (ACC-130 removed its call site) | v2.css:487 |
| Segmented control button | `.seg button` | see §2 | v2.css:168 |

Real `<button>`/`<a className="btn…">` call sites (23 total className="btn …" literals,
plus 5 template-literal `className={`st …`}`-style dynamic ones counted separately in §4):

- `app/error.tsx:38` `btn go solo hov-invert-grn`
- `app/global-error.tsx:85` `btn go solo hov-invert-grn`
- `app/desk/control-room-screen.tsx:203` `btn go`
- `app/desk/master/master-screen.tsx:174` `btn hov-invert-grn`, `:182` `btn`
- `app/desk/orgs/orgs-screen.tsx:171` `btn hov-invert-grn`
- `app/desk/users/users-screen.tsx:301` `btn go hov-invert-grn`, `:377` `` btn solo ${active?'bad hov-fill-bad':'hov-fill-grn'} ``
- `app/desk/passes/passes-screen.tsx:234` `btn`, `:247` `btn go`, `:299` `btn solo`, `:302` `btn solo`
- `app/desk/login/login-form.tsx:309` `btn go wide hov-invert-grn`, `:349` same, `:397` same
- `app/gate/page.tsx:295` `btn go big wide hov-invert-grn`, `:300` same, `:377` `btn go big hov-invert-grn`, `:377` `btn wide`
- `app/gate/vehicle/vehicle-screen.tsx:219` `btn go big hov-invert-grn` and `btn bad wide hov-fill-bad`
- `app/gate/person-search.tsx:106` `btn wide hov-outline-grn`, `:163` `btn wide`
- `components/states/inline-confirm.tsx:34` `` btn solo ${tone==='bad'?'bad hov-fill-bad':'hov-fill-grn'} ``, `:40` `btn solo`

**Tap targets:**
- `.btn` family: 50–64px — compliant.
- `.av` (profile-menu avatar button, nav of both `DeskChrome` and `GateChrome`,
  v2.css:104) — **38×38px, under the 44×44 floor**, on both desk and the gate's mobile
  chrome (`app/gate/gate-chrome.tsx:199`, `app/desk/desk-chrome.tsx:260`). DESIGN-SYSTEM.md
  item 6 explicitly promises "Tap targets ≥44×44 even where the design draws them
  smaller" — this one still doesn't meet it.
- `.status-error-retry` (v2.css:118, used `app/desk/desk-chrome.tsx:297`) — **min-height
  30px**, well under 44px; it is the *only* way to retry a failed dashboard-status fetch.
- `.burger` — 44×44, compliant (v2.css:107).
- Dead but latent: `.selbar .btn` 42px (v2.css:244), `.ck` 24×24 (v2.css:248) — no current
  render path (queue retired), so not live violations, but a future re-use of this CSS
  would silently reintroduce sub-44px controls.

**Inconsistencies (buttons):**
1. `.btn.gold` variant exists in CSS (v2.css:158) but is dead — nothing in `app/**` uses
   it; gold "warning/limited" affordance is instead done ad hoc via `.tag.gold` or inline
   `style={{color:'var(--gold)'}}`.
2. Two different "confirm strength" idioms for the same tone: `hov-fill-grn`/`hov-fill-bad`
   (filled-on-hover, used for outline-based Approve/Reject-style controls) vs
   `hov-invert-grn` (filled→outline on hover, used for solid `.btn.go`) — both real design
   intent per `app/hover.css`'s own comment, but a reader has to know which base style a
   button has before knowing which hover class is "correct" for it; nothing statically
   prevents pairing the wrong one (11 hover recipes, hand-picked per call site).
3. `.av` and `.status-error-retry` both under 44px while the design system doc states a
   hard floor — same class of bug in two different chrome pieces.
4. `.void` (row-level void action) is orphaned CSS with no min-height and no call site —
   a future dev could "fix" the visible ACC-130 gap by wiring it back up and ship a
   sub-44px tap target without any lint catching it.

---

## 2. Inputs

| Kind | Class | Height | Border/focus | File:line |
|---|---|---|---|---|
| Text field (labelled) | `.field input` | `min-height:52px` | `inset 1px --rule`, real `:focus` → 2px `--grn` inset | v2.css:319-321 |
| Utility text/select | `.utility-input` | `min-height:52px` | same, real `:focus` | v2.css:381-382 |
| Plain `<select>` | `.utility-select` | inherits `.utility-input` (52px) | **browser-default appearance** — no custom caret | v2.css:383; only live usage `app/desk/users/users-screen.tsx:286` |
| Pill select (dead) | `.pick select` | 44px, `appearance:none`, custom caret via `.pick i` | inset `--rule`, hover `--rule2` | v2.css:269-272; **no current `.tsx` renders `.pick`** (queue retired) |
| Search | `.search input` | no explicit height (padding `12px 0`, ~46px effective) | `:focus-within` → 2px solid `--grn` (not inset) | v2.css:295-299; used master-screen.tsx:178-181 |
| Serial/mono field | `.serial input` | padding `16px 14px`, mono 18px | `:focus-within` inset 2px `--grn` | v2.css:508-511; gate/page.tsx:377 |
| Plate input | `.plate-in` | padding `26px 20px` | static gold inset 1.5px, **`:focus-visible` only** (not `:focus`) | v2.css:522-529; vehicle-screen.tsx:175 |
| Name-search field | `.name-search .field input` | `min-height:48px` | inherits `.field` | v2.css:278 |
| Textarea | — | **none in the app** | — | — |
| Checkbox | `.ck` (custom ARIA) | 24×24, dead | — | v2.css:248-252; no `.tsx` usage, no real `<input type="checkbox">` anywhere in the codebase |
| Segmented control | `.seg` / `.seg button` | pill, `padding:10px 16px` | sliding `.thumb` bg | v2.css:167-172; live use only inside `.tools` (theme/mode switch, `app/desk/desk-chrome.tsx` toggle button reuses `.av`, not `.seg`) — **`.seg` itself has no confirmed live call site in the audited files**, only `.tools .seg` overrides exist |
| Toggle switch | `.sw` / `.toggle` | 50×30 knob | — | v2.css:327-332; **dead**, no `aria-checked`/`className="sw"` in any `.tsx` |

**Inconsistencies (inputs):**
1. Two parallel `<select>` styling systems exist (`.utility-select` = OS default chrome;
   `.pick select` = fully custom pill), but only the plain OS-styled one is actually wired
   up (`users-screen.tsx:286`) — the fancier, on-brand one is orphaned.
2. Focus feedback is inconsistent across text inputs: `.field`/`.utility-input`/`.serial`
   react to real `:focus` (mouse or keyboard) with an inset ring, `.plate-in` only reacts
   to `:focus-visible`, and `.search` uses a non-inset `0 0 0 2px` ring instead of the
   others' `inset 0 0 0 2px`. Three different focus-ring shapes/triggers for what is
   visually "the same" affordance.
3. Global `:focus-visible` is declared twice with different values: `app/globals.css:62`
   sets `outline-offset:2px`; `app/v2.css:9` (imported after) sets `outline-offset:3px` on
   the identical selector — the first is dead due to cascade order, silently.
4. `.ck` (checkbox) and `.sw`/`.toggle` (switch) are fully-styled, documented primitives
   with zero live consumers — an "input kind" inventory of the *rendered* app has no
   checkbox or toggle at all, despite the design system implying both exist.

---

## 3. Cards / panels / surfaces

Two-layer "double bezel" system, used everywhere:
- `.bz` (v2.css:145) — outer tray: `padding:6px`, `border-radius: var(--r-out)` (28px),
  bg `--shell` (a translucent tint), shadow `0 0 0 1px --hair, --lift`.
- `.pl` (v2.css:146) — inner plate: `border-radius: var(--r-in)` (22px), bg `--panel`,
  shadow `--hi, 0 0 0 1px --hair`, `overflow:hidden`.
- `.pad` (v2.css:147) — `padding:28px` content inset.

12 `.bz` + 13 `.pl` distinct className occurrences across screens (hero, stat, bandcard,
pass, control-skeleton-*, utility-skeleton-*, org rows, operator rows, gate `.result`,
gate `.split` panels, login `.utility-auth .utility-inner`).

Glass/blur surfaces (a third, separate surface language): `.island` nav pill,
`.status` pill, `.menu` overlay, `.selbar` (dead), `.tools`, `.profile-menu` — all use
`--glass` background + `backdrop-filter: blur(18–40px)` with **inconsistent blur radii**:
18px (`.selbar`, dead), 22px (`.island`, `.status`, `.tools`, `.profile-menu`), 40px
(`.menu`) — three distinct blur amounts for what is visually one "frosted chrome" idea
(v2.css:87, 112, 121, 242, 539, 626).

Pass ticket (`components/pass-ticket.tsx` + `app/ticket.css`) is a **fourth, independent
surface system** — `.tk`, `.tk-top`, `.tk-stub` — with its own always-dark palette
(`--tk-ink*`, `--tk-surface`, `--tk-gold`) that intentionally does not follow the
light/dark theme tokens (documented, not a bug).

**Inconsistencies (surfaces):**
1. Three unrelated "elevated surface" vocabularies coexist: bezel (`.bz`/`.pl`), glass
   (`.island`/`.menu`/`.tools`/`.profile-menu`), and ticket (`.tk-*`) — each with its own
   shadow/blur/radius values, none reusing the others' tokens directly (they each
   reference `--hair`/`--lift` but combine them differently).
2. Blur radius has three magic numbers (18/22/40px) with no shared variable.
3. `.utility-list` item rows reuse `.bz`+`.pl.pad` (orgs, users screens) while `.list .li`
   rows (control-room org preview, double-issue panel) and `.mrow` (master list) are flat
   rows with `box-shadow: inset 0 1px 0 var(--hair)` dividers instead — i.e. "a list of
   records" is drawn two different ways (card-per-row vs. divided-flat-row) depending on
   which screen you're on, with no obvious rule for which to use where.

---

## 4. Chips, tags, badges, status pills

| Component | Class | States / colour rule | File:line |
|---|---|---|---|
| Section tag | `.tag` / `.tag.gold` | default = `--grn`/`--grnbg`; `.gold` = `--gold`/`--goldbg`; **error state has no class variant** — `error.tsx:23`, `global-error.tsx:74` inline `style={{color:'var(--bad)', background:'var(--badbg)'}}` on the bare `.tag` instead of a `.tag.bad` | v2.css:136-137 |
| Status pill | `.st` + `.ok`/`.wait`/`.no`/`.mute` | ok=`--grn`/`--grnbg`, wait=`--gold`/`--goldbg`, no=`--bad`/`--badbg`, mute=`--ink3`/`--shell` | v2.css:180-184; used master-screen.tsx:244 (BMS), orgs-screen.tsx:226 (org status), double-issue-panel.tsx:26/53 ("no"), passes-screen.tsx:298 (send status via `STATUS_COPY` tone map) |
| Zone chip | `.zones span` / `.off` | held = solid `--shell` bg; not-held = `--ink3` text, strikethrough, no bg | v2.css:178-179; control-room-screen.tsx:143, gate/page.tsx:374, pass-ticket.tsx zone list (own markup, not `.zones`) |
| Band/tier chip | `.band` | colour set per-instance via `--c` custom prop, from `tierColour()`/`typeColour()` | v2.css:175-176 |
| Meter (progress, not a chip but same "state colour" idiom) | `.meter i` | colour via `--c`, default `--grn` | v2.css:185-187 |
| Print-qty stripe | `.bandcard .stripe` | colour via `--c` | v2.css:219 |
| Vehicle-check icon badge | `.checks .ok` / `.ok.x` | ok=`--grn`, fail(`.x`)=`--bad` | v2.css:532-533; vehicle-screen.tsx:193/213 |
| Double-issue label | `<span className="st no">` | always red/"no" | double-issue-panel.tsx:26/53 |
| WhatsApp send status | `STATUS_COPY` map → `.st ${tone}` | none/queued/sent/delivered/read/failed → mute/wait/wait/ok/ok/no | passes-screen.tsx:31-38, 298 |

Colour selection mechanism is **not uniform**:
- Some chips pick colour via a **CSS class name** (`.st.ok`, `.tag.gold`) resolved at
  build time.
- Others pick colour via a **CSS custom property `--c` set inline** per instance
  (`.band`, `.meter i`, `.bandcard .stripe`, `.zones` — well, `.zones` itself doesn't use
  `--c`, but `.pick::before`/`.gband`/`.bandbox` do), computed at render time from
  `tierColour(code, theme)`.
- One case (`.tag` error state) uses a **raw inline `style` object** bypassing both of the
  above.

**Inconsistencies (chips/badges):**
1. Three different mechanisms for "give this chip its semantic colour" (class variant /
   `--c` custom-prop / ad hoc inline `style`) with no documented rule for when to use
   which — a new status (e.g. a "voided" chip) could plausibly be added any of the three
   ways.
2. `.tag` has a first-class `.gold` variant but no `.bad`/`.error` variant, so the two
   files that need an error tag (`error.tsx`, `global-error.tsx`) duplicate the same
   inline style object independently rather than sharing one class.
3. "Collected"/"amber" scan-verdict colouring at the gate (`resolution.status === 'amber'`
   → `--gold`) is expressed as a raw ternary building a colour string
   (`app/gate/page.tsx:257`) rather than through the `.st`/`tag` colour-token system used
   everywhere else for the same ok/wait/no vocabulary.

---

## 5. Radii

| Value | Token / literal | Count | Where |
|---|---|---|---|
| `999px` (pill) | literal, no var | 30 | buttons, chips, nav, search, `.tag`, `.st`, `.zones span`, skeleton bars, etc. |
| `28px` | `--r-out` | 2 direct + implicit via `.bz` | globals.css:48, v2.css:145 (`.bz`), responsive.css:422 (`.auth-panel` mobile sheet — **hardcoded `28px 28px 0 0`, not `var(--r-out)`**) |
| `22px` | `--r-in` | 7 | v2.css `.pl`, control-skeleton-hero/stat/band, ticket.css `.tk-top` (**hardcoded `22px 22px 0 0`, not the var**), `.tk-stub` (**hardcoded `0 0 22px 22px`**) |
| `14px` | `--r-sm` | 14 | fields, skip-link, notices, `.name-search`, `.utility-input`, etc. |
| `10px` | literal | 1 | `.control-skeleton-band` context? actually `.checks .ok` (v2.css:532) |
| `8px` | literal | 3 | `.ck` (dead), passes-skeleton-logo, `.control-skeleton-hero-title` |
| `7px` | literal | 3 | various skeleton bars (`.passes-skeleton-name`, `.control-skeleton-stat-value`, `.control-skeleton-section-title`) |
| `4px` / `3px` / `2px` | literal | 1 / 4 / 1 | small dot/square swatches (`.band::before`, `.pick::before`) use 3px; `.passes-skeleton-logo`-adjacent uses 4px; burger bar 2px |
| `50%` | literal | 1 | `.av`, `.status .live b` (circles) |
| `40px` | literal | 2 | `body.mob .frame`/`.menu` mobile device frame corner |

**Inconsistencies (radii):**
1. `--r-out` and `--r-in` are defined as variables but are **re-declared as raw literals**
   in `app/ticket.css:34,41` and `app/responsive.css:422` instead of referencing the
   tokens — three separate 22px/28px literals that would silently drift from
   `--r-out`/`--r-in` if either token's value ever changed.
2. A large spread of small radii with no scale relationship: 2, 3, 4, 7, 8, 10, 14, 22, 28
   px all appear as one-offs alongside the three named tokens — most are skeleton-loader
   placeholders matching one specific element's real radius, but there is no shared
   "small/medium/large" scale beyond `--r-sm/-in/-out`.

---

## 6. Shadows

Two named composite tokens carry almost everything:
- `--hi` (highlight): `inset 0 1px 1px rgba(ink,0.07)` dark / `rgba(255,255,255,.9)` light
  (globals.css:25,38).
- `--lift` (elevation): `0 40px 80px -40px rgba(0,0,0,.75), 0 12px 24px -16px rgba(0,0,0,.6)`
  dark / softer warm-tinted version light (globals.css:26,39).

Distinct `box-shadow` value groups found (30 unique strings total across the CSS files):
- Hairline dividers: `inset 0 1px 0 var(--hair)` (12×), `inset 0 -1px 0 var(--hair)` (2×).
- Outline rings: `inset 0 0 0 1px var(--hair)` (7×), `var(--rule)` (6×), `var(--rule2)` (3×).
- Elevation: `0 0 0 1px var(--hair), var(--lift)` (9×) and the glass variant
  `0 0 0 1px var(--hair), var(--hi), var(--lift)` (2×, `.island`/`.tools`).
- Focus rings: `inset 0 0 0 2px var(--grn)` (3×), `0 0 0 2px var(--grn)` (1×, `.search`) —
  inset vs non-inset for the "same" focus affordance (see §2).
- One-off literal shadows not built from a token: `.sw::after` knob shadow
  `0 2px 6px rgba(0,0,0,.25)` (v2.css:329, raw rgba, no `--hair`/`--lift`), mobile
  `.auth-panel` sheet edge `0 -1px 0 rgba(227,187,114,.4), 0 -30px 60px rgba(0,0,0,.6)`
  (responsive.css:422, raw), and the pass ticket's own `filter: drop-shadow(0 24px 34px
  rgba(0,0,0,.55))` (ticket.css:18, a `filter`, not `box-shadow`, doing the same elevation
  job as `--lift` with a fourth distinct value).

**Inconsistencies (shadows):**
1. `--lift`/`--hi` are meant to be the two shared shadow tokens, but three call sites
   (`.sw::after`, `.auth-panel` mobile, `.tk` drop-shadow) hand-roll a fourth/fifth raw
   shadow value instead of composing from the tokens — none of these three are near each
   other in the file, so the drift isn't visible unless you grep for it (as done here).
2. Focus rings are inconsistently inset vs non-inset (see §2 #2) — same visual intent,
   two shadow shapes.

---

## 7. Spacing (padding / margin / gap)

`padding` alone has **>45 distinct literal values** in the CSS (from `0` to
`88px 8px 40px`); most common: `40px` (5), `28px 18px` (4), `16px 18px` (4), `26px` (3),
`24px` (3), `16px` (3), `18px 24px`/`18px 26px` (2 each), `15px 18px !important` (2, the
"queue row, same at every viewport" comment). `gap` has 25 distinct values, most common
`16px` (18), `10px` (16), `18px` (12), `8px` (10), `14px` (7), `12px` (6), `6px` (5).

There is **no spacing scale variable** anywhere (no `--space-1`, `--gap-sm`, etc.) — every
padding/gap is a bespoke pixel literal chosen per component, matching the frozen design's
own inline-style literals (by design, per DESIGN-SYSTEM.md — the app is a transcription).
The values do cluster loosely around an 2/4/6/8-multiple rhythm (4,6,8,10,12,14,16,18,20,
22,24,26,28,32,40px) but several odd-ones-out break it: `88px 8px 40px` (`.head`),
`60px 72px 48px` (`.auth-panel`), `9px`/`7px` (one-off), and `!important`-forced
`15px 18px` / `14px`/`14px` pairs in `responsive.css` that exist specifically to defeat
the responsive system's own breakpoint padding for one element (`.d-queue-cols`,
`.d-queue-bulk`) — a documented, deliberate exception, but still a literal outside the
rhythm.

**Inconsistencies (spacing):** the near-total absence of a spacing scale is the
inconsistency here — every screen re-derives its own padding/gap numbers from the
design's literal inline styles rather than from a shared scale, so two visually-similar
"card padding" moments (`.pad` 28px vs `.bandcard .pl` 26px vs `.stat .pl` "24px 24px
26px" vs `.control-skeleton-band` 26px vs `.utility-auth .utility-inner` 34px) differ by
2–10px each with no discernible reason beyond "that's what the mock had."

---

## 8. Type

**Families** (4, matches DESIGN-SYSTEM.md exactly, each via a CSS var):
`--display` = Anton (headings, `.h1`/`.h2`/`.verdict`/`.bandcard h3`/ticket names — always
`font-weight:400` but renders synthesised-bold, a documented open question), `--label` =
Oswald (nav, buttons, `.nm`, form labels — 400/500/600/700), `--body` = Archivo (body
copy, `.lede`), `--mono` = JetBrains Mono (`.mono`, serials, timestamps, plate, ticket
ref).

**Font-size** — over 45 distinct values across the CSS alone (see raw grep below), the
overwhelming majority in the 10–17px "label/meta" band:
`9.5px`(2) `10px`(7) `10.5px`(8) `11px`(12) `11.5px`(1) `12px`(14) `12.5px`(5) `13px`(17)
`13.5px`(2) `14px`(10) `14.5px`(2) `15px`(7) `16px`(5, incl. the deliberate iOS-zoom-floor
override) `17px`(3) `18px`(2) … up through the big Anton display sizes (24–120px, several
as `clamp()`), 15 of them `clamp()` expressions with viewport-relative bounds.

**Inline (non-CSS-file) font-size/family overrides** — a second, parallel type system
living in `style={{...}}` objects inside 3 screen files (bypassing the CSS files
entirely): `app/desk/orgs/orgs-screen.tsx:59-65,158-166`, `app/desk/users/users-screen.tsx:
51-57,244-253,320-327,353`, `app/desk/master/master-screen.tsx:168,171` — each hand-writes
`fontFamily: "'JetBrains Mono',monospace"` (10 occurrences) or `"'Oswald',sans-serif"`
(1 occurrence) plus its own `fontSize`/`letterSpacing`/`textTransform`/`color` literal
instead of using the `.mono`/`.nm`/`.utility-label > span` classes that do the identical
job elsewhere in the same app (e.g. `.mono` in `v2.css:141` is exactly
`font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase;
color:var(--ink3)` — orgs/users/master re-implement a near-clone of this by hand with a
raw `9.5px`/`11px`/`13px` instead of reusing `.mono`).

**Letter-spacing:** 14 distinct values, `0.12em` dominant (19 occurrences) — reasonably
consistent, but `0.13em` (2, only in the inline-style trio above) and `0.14em` (2) sit
suspiciously close to `0.12em` with no visible reason for the 0.01–0.02em delta other than
being separately hand-typed.

**Font-weight:** 700(20) / 600(15) / 400(12) / 500(1, Oswald medium, used once) /
`normal`(2, phosphor icon font) — one occurrence of `font-weight:600` written **without a
space** (`font-weight:600;` in `app/globals.css:77`) vs `font-weight: 600;` everywhere
else — cosmetic only, not a visual bug.

**Text-transform:** `uppercase` is the default everywhere labels/buttons/nav appear;
`.lede`/`.utility-copy`/body copy is sentence case (correct per ADR/CLAUDE.md button-label
casing rule). No inconsistency found here — this one is disciplined.

**Inconsistencies (type):**
1. A parallel, hand-rolled "mono meta label" style exists in 3 screen files (10+ inline
   `style` objects) duplicating `.mono`/`.utility-label > span` instead of reusing them —
   the clearest "same concept implemented two ways" finding in the whole audit.
2. Letter-spacing has near-duplicate values (0.12/0.13/0.14em) with no evident rule for
   which gets which, concentrated in the same inline-style trio above.
3. Font-size has three near-identical "meta caption" sizes in circulation — 10px, 10.5px,
   11px — used interchangeably for what reads as the same visual role (uppercase mono
   captions/labels) depending on which component happened to define it.

---

## 9. Colour

**CSS custom properties** — defined once, in `app/globals.css:17-42` (`[data-theme="dark"]`
/ `[data-theme="light"]` blocks): `--bg --panel --panel2 --ink --ink2 --ink3 --rule --rule2
--grn --gold --bad --grnbg --goldbg --badbg --on --hair --shell --glass --hi --lift --orb1
--orb2 --poster-op --logo-filter`, plus theme-independent `:root` tokens
(`--ease --display --label --body --mono --r-out --r-in --r-sm --z-nav --z-menu --z-tools
--z-grain`). This is Layer 1 of the documented C8 split.

**Layer 2** (`lib/design.ts` `PROP`) intentionally repeats 6 of these with *different*
values per theme (`ink2, rule, on, grnbg, goldbg, badbg`) — this is a **documented,
deliberate** divergence (C8), not counted as a bug here.

**Raw hex/rgb literals outside the two allowed token files** (`app/globals.css`,
`lib/design.ts`) — every other hex/rgba in the tree is one of:
- Exact restatements of a token value as a **style-attribute fallback**, e.g.
  `color: 'var(--ink2,rgba(242,239,226,0.72))'` — appears in `app/layout.tsx:94`,
  `app/global-error.tsx:69`, `app/auth/confirm/route.ts:65-69`,
  `app/desk/orgs/orgs-screen.tsx:64,163`, `app/desk/users/users-screen.tsx:56,250,256,325`,
  `app/desk/master/master-screen.tsx:168`. These fallbacks are **hardcoded to the dark
  theme's numbers** — if `--ink2`/`--ink3` were ever undefined (e.g. a stray unstyled SSR
  flash), the light theme would render dark-theme-coloured text. Low risk (the var is
  always defined) but a real bypass of the token system, and it is duplicated ~10 times
  instead of centralised once.
- `app/desk/users/users-screen.tsx:353` — `color: 'var(--ink,#F2EFE2)'`, same pattern.
- `app/gate/page.tsx:257` — three raw hex fallbacks in one ternary:
  `'var(--grn,#00F5A5)' / 'var(--gold,#E3BB72)' / 'var(--bad,#FF6B5A)'`.
- `app/p/[passToken]/pass-screen.tsx:36,44` and `app/v2.css:403,420` — `#0A0A0A` poster
  background literal (matches `--bg` dark value exactly; used because the pass page is
  fixed-dark, ADR-009, so arguably legitimate, but still a literal instead of `var(--bg)`).
- `app/ticket.css` — the ticket's own **separate palette** (`--tk-ink`, `--tk-surface`,
  etc.) is built entirely from raw `rgba()` literals by design (documented at the top of
  the file: "Colours are rgba() so the design-token gate … holds").

**Two greens / two golds / two reds (by design, not a bug):** dark-theme `--grn #00F5A5`
vs light-theme `--grn #05603F` — intentional per-theme recolour, consistent everywhere via
the variable. Not a literal duplication issue.

**Tier/type colours** (`lib/design.ts` `TYPES`/`TIERS`) are a **third colour system**
again: 8 tier colours (`#39E639,#F0169A,#F07A2A,#4371FF,#A64DFF,#F2D21C,#FF4A3D,#B8B8B8`)
plus 8 "light" variants, and a separate 3-entry legacy `TYPES` (`#00F5A5,#E3BB72,#F2EFE2`)
still exported and still driving `zoneChips()`/`gateBandCard()` colour helpers alongside
the newer 8-tier `ZONE_MAP_HEX` (6 more hexes: green/red/blue/yellow/purple/orange). None
of these 20+ literals are CSS variables — they are plain TS string constants consumed via
inline `style={{'--c': …}}`, which is the correct, sanctioned pattern (per-instance custom
property), but worth noting as a fourth independent "palette" living outside `globals.css`.

**Inconsistencies (colour):**
1. ~10 near-identical hardcoded rgba fallback literals for `--ink2`/`--ink3`/`--ink`/`--grn`
   /`--gold`/`--bad` scattered across 7 files, all assuming the dark theme — a single
   shared constant (or dropping the fallback, since the var is always defined) would
   remove this duplication.
2. Three unrelated colour systems coexist with no cross-reference: theme tokens
   (`globals.css`), the v1 3-type palette (`lib/design.ts` `TYPES`), and the v2 8-tier +
   6-zone palette (`lib/design.ts` `TIERS`/`ZONE_MAP_HEX`) — `TYPES` is documented as
   "frozen v1" but is still live code driving today's gate/control-room screens
   side-by-side with `TIERS`.

---

## 10. Icons

`components/icon.tsx` wraps the self-hosted Phosphor "Light" webfont
(`app/phosphor.css`) with 14 named glyphs declared in `IconName`, but only **8 are ever
rendered** by `<Icon name=…>` call sites in the audited files: `scan`(2), `magnifying-
glass`(2), `arrow-right`(2), `check`(2, one static + one dynamic ternary in
vehicle-screen.tsx), `sort-descending`(1), `printer`(1), `paper-plane-tilt`(1),
`download-simple`(1) — plus 2 more reached only via dynamic `name={theme==='dark'?'sun':
'moon'}` expressions (`desk-chrome.tsx:273`, `gate-chrome.tsx:199`) and one via
`name={cleared?'check':'x'}` (`vehicle-screen.tsx:193,213`). **`caret-down` and `plus`**
are declared in the `IconName` union and have a matching `.ph-light.ph-caret-down`/
`.ph-plus` CSS rule (`app/phosphor.css:43,49`) but are **never instantiated anywhere** —
dead icon variants shipped in both the font-subset and the type union.

Per-screen icon usage: Control room → `scan`, `sort-descending`; Master list →
`magnifying-glass`, `download-simple`; Passes → `paper-plane-tilt`, `printer`; Gate →
`scan`, `check`, `magnifying-glass` (via `PersonSearch`), `arrow-right` (via
`PersonSearch`); Vehicle → `check`/`x`, `arrow-right`; both chromes → `sun`/`moon`.

**Non-Phosphor "icon-like" marks** (a real inconsistency — the app has at least 4 other
ways of drawing an icon-shaped thing that aren't `<Icon>`):
1. Raw HTML entity arrow: `app/desk/orgs/orgs-screen.tsx:228` — `{org.submittedCount}
   people &rarr;` — a plain `→` character used exactly where `<Icon name="arrow-right"/>`
   is used one screen over (`person-search.tsx:159`) for the identical "this row opens
   something" affordance.
2. CSS-drawn burger icon: two bare `<i/><i/>` elements styled entirely by `.burger i` (no
   font glyph at all) — `desk-chrome.tsx:286`, `gate-chrome.tsx:206`.
3. CSS-drawn scan-frame corners/sweep: four `<i className="c"/>` + `<i/>` inside `.vf` —
   `gate/page.tsx:324-325` — pure CSS shapes, no font.
4. CSS-drawn zone-colour swatch: `<i style={{background:colour}}/>` —
   `components/pass-ticket.tsx:72` — a coloured square standing in for a legend icon.
5. CSS-drawn meter fill: `<i style={{'--w':…,'--c':…}}/>` — `control-room-screen.tsx:121`.

No emoji anywhere in the audited files.

**Inconsistencies (icons):**
1. `&rarr;` HTML entity vs `<Icon name="arrow-right">` component for the same "opens a
   detail view" affordance, in two different screens.
2. Two icon-union members (`caret-down`, `plus`) are dead weight — declared, fonted, never
   rendered.
3. Five distinct "draw a small glyph" techniques in the codebase (Phosphor `<Icon>`, raw
   HTML arrow entity, bare CSS-styled `<i>` shapes ×3 patterns) with no shared naming or
   location convention — a reviewer can't grep one place to find "every icon."

---

## 11. Motion

Two easing systems in parallel, both real and both still driving visible animation:
- **`var(--ease)`** = `cubic-bezier(0.32, 0.72, 0, 1)` (globals.css:45) — used for nearly
  every transition/animation in `v2.css`, `hover.css`'s comment references it but
  `hover.css` itself actually uses **no easing function at all** (`transition: color
  120ms, background-color 120ms, border-color 120ms;` — linear default, `hover.css:51`),
  which contradicts its own doc-comment claiming "120ms is the one explicit transition
  value in the design source … applied uniformly" (true for duration, silent on the
  missing easing curve).
- **`cubic-bezier(0.16, 1, 0.3, 1)`** — a second, unrelated easing curve used in
  `app/motion.css` (`.s-anim-in`, `.s-anim-in-strong`, `.s-color-fade`, `.s-toggle-knob`,
  `.s-btn-press`) and duplicated verbatim inside `app/v2.css:357-358` (the same two
  keyframes redefined a second time) and `app/ticket.css:109` (`tk-sweep`) and
  `app/v2.css:403,405` (`auth-settle`/`auth-rise`).

**Keyframes inventory:** `skeleton-shimmer` (1.4s, `--ease`), `ping` (2.4s, `--ease`),
`drift` (26s, `--ease`), `stag` (0.8s, `--ease`), `shake` (0.5s, `--ease`), `flash` (1s,
`--ease`), `land` (0.8s, `--ease`), `sweep` (2.6s, `--ease`), `s-rise-in` /
`s-rise-in-strong` (240/320ms, `cubic-bezier(.16,1,.3,1)` — **defined twice**, once in
`motion.css` once in `v2.css:355-358`), `tk-sweep` (4.5s, `cubic-bezier(.6,0,.3,1)` — a
**third** easing curve, ticket-only), `auth-settle`/`auth-rise` (1.4s/0.7s,
`cubic-bezier(.16,1,.3,1)`).

**`prefers-reduced-motion`:** respected globally and correctly —
`app/globals.css:85-90` zeroes every `animation-duration`/`transition-duration` to `1ms`
and forces `scroll-behavior:auto`. Two components additionally hand-roll their own
IntersectionObserver reduced-motion check (`gate-chrome.tsx:173`,
`control-room-screen.tsx:175`, `master-screen.tsx` reveal effect, `passes-screen.tsx:192`)
which is redundant with the CSS-level kill-switch but not harmful. `ticket.css:112`
separately guards `.tk-glare` (`opacity:0` too, not just duration:1ms — a stronger,
correct treatment since a 1ms-duration infinite sweep would still flash). `v2.css:418`
guards `.auth-art`/`.auth-panel` similarly.

**Inconsistencies (motion):**
1. Three distinct easing curves in production use (`--ease`, `cubic-bezier(.16,1,.3,1)`,
   `cubic-bezier(.6,0,.3,1)`) with no shared variable for the second and third — only
   `--ease` is tokenised.
2. `s-rise-in`/`s-rise-in-strong` keyframes and their `.s-anim-in`/`.s-anim-in-strong`
   classes are **defined twice, byte-for-byte**, in both `app/motion.css` and
   `app/v2.css:355-358` — `v2.css`'s own comment admits this ("folded from the former
   screen-only motion layer") but the duplicate in `motion.css` was never removed, so the
   rule exists twice in the shipped stylesheet.
3. `hover.css`'s hover-colour transitions have no eased curve at all, unlike literally
   every other transition in the app.

---

## 12. Layout

**Breakpoints** — three different mechanisms, not unified:
- Container queries on `.frame` (the v2 contract's own model): `@container app
  (max-width: 1100px)` (v2.css:548) and `@container app (max-width: 700px)` (v2.css:558).
- Real media queries at `768px` (`min-width`, in `responsive.css`, ×3: lines 32, 62, 179)
  driving the `s-`/`g-`/`d-` prefixed helper classes (`MOBILE_BREAKPOINT_PX` in
  `lib/design.ts:197`).
- A **third, one-off** breakpoint at `900px` (`max-width`, `v2.css:419`, login screen
  only) and a matching `700px` `max-width` pair in `v2.css:634-635` (footer) that
  duplicates the `700px` container-query number but as a real media query instead of a
  container query, for a component (`.site-footer`) that sits outside `.frame`'s
  container-query scope.
- `print` media queries: `ticket.css:116`, and an inline `<style>` block's own `@media
  print` inside `passes-screen.tsx:328` (a second, page-specific print stylesheet living
  in a `<style>` tag rather than the shared CSS files).

**Max-widths:** `--shell` via `SHELL_MAX_PX = 1280` (`lib/design.ts:198`, consumed as a
raw `1280px` literal in `responsive.css` 4×, not as a CSS var); `.frame` 1440px
(`v2.css:81`); mobile device frame 390px (`v2.css:82-83`, matches
`MOBILE_BREAKPOINT_PX`'s design-mock device width, coincidentally not the same number);
`.s-shell`/`.g-shell`/`.d-shell` mobile 420px; `.auth` panel 560px; `.tk` ticket 420px;
`.utility-auth .utility-inner` 460px; `.auth-inner` 416px; `.lede` prose 54ch;
`.auth-lede` 34ch; `.idle p` 38ch — **`SHELL_MAX_PX` (1280) is a named constant that is
never actually referenced as a variable in the CSS that implements it** (`responsive.css`
hardcodes `1280px` four times instead of importing/using the constant, so the two could
drift silently).

**Z-index:** four tokens (`--z-nav:40 --z-menu:60 --z-tools:80 --z-grain:90`,
`globals.css:49`) plus two raw literal z-indexes with no token: `z-index:1` (5 occurrences
— `.links button/a`, `.seg button`, `.list-head`, `.auth`, `.vf-start`) and `z-index:5`
(`.selbar`, dead). `--z-nav` itself is **declared but never referenced anywhere** — dead
token (the nav wrapper actually uses `--z-menu`).

**Inconsistencies (layout):**
1. Container queries (v2 native model) and real media queries (`s-`/`g-`/`d-` helpers,
   plus the login/footer one-offs) both implement "mobile vs desktop" for different parts
   of the same pages, at slightly different or duplicated breakpoints (700px appears as
   both a container query and a media query for adjacent components).
2. `SHELL_MAX_PX`/`MOBILE_BREAKPOINT_PX` are the two "shared" layout constants in
   `lib/design.ts` but neither is wired into the CSS as an actual custom property — both
   are hand-copied as literals into `responsive.css`, so the source of truth and its
   consumer can silently diverge.
3. `--z-nav` is dead; two raw `z-index` literals (`1`, `5`) exist alongside the four
   tokens with no naming, and `5` only exists for now-dead `.selbar`.

---

## 13. Components

### `components/` (shared primitives)

| File | Renders | Used by |
|---|---|---|
| `icon.tsx` | `<Icon name>` → Phosphor `<i>` | every screen, both chromes |
| `loading-skeleton.tsx` | `ScreenSkeleton`, `ControlRoomSkeleton`, `PassesSkeleton`, `UtilityScreenSkeleton` (re-exports `Skeleton` too) | control-room, passes, orgs/users/(aaa unseen)/devices skeletons |
| `pass-ticket.tsx` | `<PassTicket>` (`variant: 'live'|'sheet'`) | `/p/[passToken]` page and `/desk/passes` sheet — **the one genuinely shared, non-duplicated component in the app** |
| `site-footer.tsx` | `<SiteFooter>` | both `DeskChrome` and `GateChrome` |
| `states/skeleton.tsx` | `<Skeleton>` primitive | `loading-skeleton.tsx`, `login-form.tsx` |
| `states/empty-state.tsx` | `<EmptyState>` (uses `.empty`) | master, orgs, users, passes screens |
| `states/inline-error.tsx` | `<InlineError>` (`role="alert"`, optional retry) | control-room, master, orgs, users, passes |
| `states/inline-confirm.tsx` | `<InlineConfirm>` (destructive-action confirm, replaces `confirm()`) | users (deactivate), passes (send-all/resend) |

### App-local screen/chrome components

`app/desk/desk-chrome.tsx` (`DeskChrome`), `app/gate/gate-chrome.tsx` (`GateChrome`),
`app/desk/control-room-screen.tsx` (+ local `V2Count`, `V2Stat`, `V2BandCard`),
`app/desk/master/master-screen.tsx`, `app/desk/orgs/orgs-screen.tsx`,
`app/desk/users/users-screen.tsx`, `app/desk/passes/passes-screen.tsx`,
`app/desk/double-issue-panel.tsx`, `app/desk/login/login-form.tsx` (+ local
`LoginFormSkeleton`), `app/gate/page.tsx` (default export, the scan screen),
`app/gate/vehicle/vehicle-screen.tsx`, `app/gate/person-search.tsx`,
`app/gate/sync-status.tsx`, `app/gate/register-sw.tsx`, `app/p/[passToken]/pass-screen.tsx`,
`app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/p/[passToken]/not-found.tsx`.

### Duplicates / two-implementations-of-one-job

1. **Two chrome shells doing near-identical work**: `DeskChrome` and `GateChrome` each
   independently implement — byte-for-byte similar but not shared — the profile menu
   (open/close/outside-click/Escape), the mobile drawer (open/close/Escape/focus-return),
   the sliding nav `.pip` indicator (including the same `sessionStorage['boa-pip']`
   geometry-caching hack), and the theme toggle. `desk-chrome.tsx:126-232` and
   `gate-chrome.tsx:81-166` are near-duplicate logic with no shared hook — a real
   "same concept implemented twice" case (documented in `lib/design.ts` comments as
   deliberate for the *nav array* split, but the chrome *logic* duplication itself is not
   discussed/justified anywhere).
2. **Two "loading state" component families**: `components/loading-skeleton.tsx`'s
   per-screen skeleton compositions (`ControlRoomSkeleton`, `PassesSkeleton`,
   `UtilityScreenSkeleton`) vs. ad hoc inline skeleton markup built directly with
   `<LoadingSkeleton>`/`<Skeleton>` inside `master-screen.tsx:198-210` (a hand-rolled
   `.table-skeleton`/`.mrow` loop that is not one of the named skeleton components) and
   `login-form.tsx`'s own local `LoginFormSkeleton`. Three of four loading screens go
   through the shared file; Master list's table-loading state does not.
3. **Two empty-state idioms**: the shared `<EmptyState>` component (`.empty` class) used
   by master/orgs/users/passes vs. `app/gate/page.tsx:283-313`'s "no roster on this phone"
   screen, which is a full bespoke `<main>`/`<section className="utility-inner">` block
   with its own heading/CTA logic, not routed through `<EmptyState>` at all (arguably
   correct since it's a full-screen state, not an inline list-empty state, but it is a
   second distinct "nothing to show" visual pattern in the app with no shared vocabulary).
4. **Two "confirm before a WhatsApp/destructive action" call sites** (`users-screen.tsx`
   deactivate, `passes-screen.tsx` send-all/resend) correctly share `<InlineConfirm>` —
   *not* a duplicate, noted here only because it's the positive counter-example to #1–#3.

---

## Top 15 inconsistencies (ranked by user-visible impact)

1. **Two profile-avatar buttons under the 44px tap-target floor, on both desk and the
   gate's mobile chrome.** `.av` is 38×38px (`app/v2.css:104`), rendered in
   `app/desk/desk-chrome.tsx:260` and `app/gate/gate-chrome.tsx:199` — the gate is the
   volunteer-in-gloves surface DESIGN-SYSTEM.md's own "definition of done" (§6) promises
   ≥44×44 for. This is the highest-visibility miss because it's in the primary nav of
   every screen, every session.
2. **Dashboard-status retry button is 30px tall.** `.status-error-retry`
   (`app/v2.css:118`, used `app/desk/desk-chrome.tsx:297`) is the only recovery path when
   the top status bar fails to load — a small, easy-to-miss tap target for a
   fairly common failure state.
3. **Hand-rolled "mono meta label" style duplicated ~10 times instead of reusing `.mono`.**
   `app/desk/orgs/orgs-screen.tsx:59-65,158-166`, `app/desk/users/users-screen.tsx:
   51-57,244-253,320-327,353`, `app/desk/master/master-screen.tsx:168,171` — visibly
   affects whether captions across Organisations/Users/Master list line up pixel-for-pixel
   with the rest of the app; any future edit to `.mono` won't reach these.
4. **Two different focus-ring shapes/triggers for the same "you're editing this field"
   moment.** `.field`/`.utility-input`/`.serial` = inset ring on any `:focus`;
   `.plate-in` = outline on `:focus-visible` only; `.search` = non-inset ring
   (`app/v2.css:296,321,382,509,523`). Keyboard users will notice the inconsistency
   field-to-field.
5. **Global `:focus-visible` outline-offset defined twice with different values**
   (`app/globals.css:62` = 2px, `app/v2.css:9` = 3px) — the first is silently dead due to
   import order; a change to `globals.css`'s rule would appear to do nothing.
6. **`&rarr;` HTML entity used as an icon next to `<Icon name="arrow-right">` used for the
   identical affordance one screen over** — `app/desk/orgs/orgs-screen.tsx:228` vs.
   `app/gate/person-search.tsx:159` — visibly different glyph weight/style for "this row
   opens something."
7. **Three unrelated "elevated surface" systems** (bezel `.bz`/`.pl`, glass
   `.island`/`.menu`/`.tools`, ticket `.tk-*`) with three different blur radii (18/22/40px)
   for what reads to a user as one "frosted panel" language across the app.
8. **`.tag` has a `.gold` class variant but no error variant** — `error.tsx:23` and
   `global-error.tsx:74` each duplicate an inline `style={{color:'var(--bad)', background:
   'var(--badbg)'}}` instead of a `.tag.bad` class, so any future `.tag` restyle misses
   the error pages.
9. **Chip/badge colour is chosen three different ways** (class variant, inline `--c`
   custom prop, raw inline `style`) with no rule for which applies where — increases the
   chance a new status type gets a fourth, inconsistent treatment.
10. **`s-rise-in`/`s-rise-in-strong` keyframes and classes are defined twice, verbatim**,
    in `app/motion.css` and `app/v2.css:355-358` — no visible bug today (identical
    duplicate), but a future edit to one and not the other creates a real animation
    divergence between the screens that (accidentally) load one file vs. the other.
11. **Two parallel `<select>` styling systems** — the fully custom pill (`.pick select`,
    dead, `app/v2.css:269`) vs. the only live `<select>` in the app
    (`app/desk/users/users-screen.tsx:286`) using generic OS chrome via `.utility-select`
    — the one real dropdown in the whole product looks unstyled next to every other
    control.
12. **Near-duplicate meta font sizes in circulation for the same visual role** — 10px,
    10.5px, 11px all used for uppercase mono captions/labels interchangeably depending on
    component, with letter-spacing similarly split across 0.12/0.13/0.14em.
13. **`SHELL_MAX_PX`/`MOBILE_BREAKPOINT_PX` constants in `lib/design.ts` are never wired
    into the CSS as variables** — `responsive.css` hardcodes `1280px` four times instead;
    a change to the constant silently stops matching the stylesheet.
14. **Two independent chrome implementations (`DeskChrome`/`GateChrome`) duplicate the
    entire profile-menu/mobile-drawer/nav-pip logic**, including the same
    `sessionStorage` hack, rather than sharing one hook — doubles the surface area for a
    future nav bug to appear in only one of the two shells.
15. **Dead CSS for a checkbox (`.ck`, 24×24) and a toggle switch (`.sw`/`.toggle`, no
    `min-height`) remain fully styled with no live consumer** — low visibility today, but
    the next person who wires up either will ship a sub-44px control by construction,
    since nothing flags that this CSS predates the tap-target rule.

---

File written to:
`/private/tmp/claude-502/-Users-USER-My-Works-BANGALORE-OPEN-AIR-boa-accreditation/03360255-6f4c-4c8a-8e32-3c0824fc2c26/scratchpad/inventory.md`
