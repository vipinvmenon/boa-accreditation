# Design system

The approved pixel design is `design/source/boa_design_v2.html`, committed
verbatim. The v2 stylesheet and markup are the visual contract. The committed
`boa_design_body.html` remains frozen as the domain and C8 colour record:
`DCLogic`/`renderVals()` are the authority for zones, types and prop literals.
`boa_design_bundle.html` is the original recovered artefact, and
`boa_design_source.html` is the unpacked whole including font CSS.

**It is the contract. Reproduce it; do not reinterpret it.**

## How the design gets into the app

The v2 authoring model is a shared primitive stylesheet plus small React screen
components. `app/v2.css` carries the contract's classes, container queries,
motion and responsive rules; `components/icon.tsx` carries the approved local
inline SVG glyphs; screen files compose those primitives with data returned by
the real API schemas. This is an implementation of the v2 class structure, not
a redesign or a generic utility system.

`app/globals.css` carries the contract's theme tokens and the documented
accessibility additions. `lib/design.ts` holds only values that genuinely must
be shared. The v1 files remain committed and unchanged where they record the
domain and C8 prop layer; they are not a second visual target.

## C8 — the two colour layers

**The design carries colour in two places and they disagree on six values. Both
are correct. Transcribing both is the requirement; reconciling them is the bug.**

| Layer | Where | Wins when |
|---|---|---|
| 1 | the `<helmet>` `[data-theme]` blocks → `app/globals.css` | the markup resolves a value through `var(--x, …)` |
| 2 | the literals in `renderVals()` → `lib/design.ts` `PROP` | the value arrives as a prop: `{{ s.colour }}`, `{{ z.fg }}`, `{{ o.typeColour }}`, `{{ f.bg }}`, `{{ p.rowBg }}`, `{{ n.bg }}` |

The six that differ, dark theme:

| Token | Helmet (layer 1) | Prop (layer 2) |
|---|---|---|
| `--ink2` | `rgba(242,239,226,0.72)` | `#A6C9B4` |
| `--rule` | `rgba(242,239,226,0.16)` | `rgba(166,201,180,0.18)` |
| `--on` | `#0A0A0A` | `#0D0D12` |
| `--grnbg` | `rgba(0,245,165,0.10)` | `rgba(0,245,165,0.08)` |
| `--goldbg` | `rgba(227,187,114,0.10)` | `rgba(227,187,114,0.08)` |
| `--badbg` | `rgba(255,107,90,0.10)` | `rgba(255,107,90,0.09)` |

There is a *third* value in one place: the Control room stat label is written
`var(--ink3, rgba(166,201,180,0.58))`, a fallback that never resolves because
`--ink3` is always defined. It is dead code in the live DOM. **Transcribe it
verbatim anyway.** A fallback that is never used costs nothing; a fallback
someone "corrected" is a diff against the contract.

`scripts/check-design-tokens.mjs` enforces both layers against the source on
every `corepack pnpm lint`.

## Fonts

Four families, four jobs, never mixed.

| Family | Job | Weights |
|---|---|---|
| Anton | big numbers and screen titles | 400 — the only weight it ships |
| Oswald | every UI cap, label, button, nav item, data line. Always tracked | 400 / 500 / 600 / 700 |
| Archivo | body copy and sentence-case descriptive text only | 400 (+700 for `<strong>`) |
| JetBrains Mono | meta lines, tokens, serials, timestamps, number plates | 400 / 500 / 600 / 700 |

Note `boa-bar-control` uses only the first three. **JetBrains Mono is new in this
design** and carries every piece of machine-readable text on every screen.

They are loaded through **`@fontsource`, not `next/font`**, and that is
deliberate. `next/font` generates an obfuscated family name (`__Anton_abc123`)
exposed as a CSS variable. The design writes its stacks as literals —
`font-family:'Anton',sans-serif` — inside the inline styles we are contracted to
transcribe verbatim. Under `next/font` every one of those literals would resolve
to nothing and fall back to a system face: approximately right in review, wrong
in every glyph. `@fontsource` declares the real family names and self-hosts the
woff2, so the design's own strings work untouched and the CSP stays
`font-src 'self'` with no Google origin.

**Every weight the design declares must be imported.** An unimported weight does
not fail loudly — the browser synthesises it and the screen renders at a subtly
wrong weight that survives review and is discovered on paper.
`scripts/audit-font-weights.mjs` proves this on every lint by parsing the v2
stylesheet's family/weight declarations and checking them against the
`@fontsource` imports.

### The Anton bold question — OPEN

Every `<h1>` and `<h2>` in the design carries `font-family:'Anton'` with **no
`font-weight`**, so the UA stylesheet applies `bold` (700). Anton ships 400 only.
Verified in a real browser on 10 Sep: the computed weight on our `<h1>` is `700`
against a 400-only face, i.e. **the browser is synthesising bold** — and the
approved artboard is doing the same thing, for the same reason.

We therefore do **not** set `font-synthesis: none`, unlike bar-control, because
turning synthesis off would be a visual deviation from the artefact.

This is settled against the rendered reference by `corepack pnpm test:visual`,
not by opinion. If the reference shows unsynthesised Anton, the fix is
`font-weight: 400` on those headings — a change to the transcription, made
against evidence, and recorded here.

### CI-vs-local text rendering — CLOSED, 13 Sep 2026

`corepack pnpm test:visual`'s `THRESHOLD = 0.008` (`scripts/visual-check.mjs`)
absorbs "font antialiasing between the bundle's own woff2 and @fontsource's,
and nothing more" — but from the line-height fix commit onward, GitHub
Actions' `design fidelity` job failed on `gate` and `vehicle` at 1.8–3.6%
while the identical command passed locally on macOS at 0.13–0.67%, on two
unrelated commits with byte-identical failure percentages (deterministic, not
flaky).

Both `capture-design-reference.mjs` (the approved bundle) and
`visual-check.mjs` (our app) run in the **same CI job, same run**, each
launching its own `chromium.launch()` to screenshot a different document, so
a real cross-platform difference has to come from something that diverges
between those two launches on that one Linux runner. Downloaded CI's own
`visual-diffs` artifact (run 34770874991) and opened the `.diff.png` files
directly rather than guessing: every screen showed fringing on essentially
every glyph, on every line of text, while vector chrome — the sticky-nav
borders, the divider rules, the outcome-tab underline — stayed pixel-identical
between the reference and our app. A real layout or colour regression shows
as solid mismatched blocks or shifted/missing elements; 100% of text and 0%
of vectors is the signature of AA/hinting nondeterminism, not a defect in
either document.

Root cause: on Linux, Chromium's default LCD-subpixel text path is not
guaranteed to rasterize identically across two separate process launches —
FreeType's hinting can round differently depending on GPU/software
rasterizer state at each process's start. macOS's CoreGraphics backend
smooths this over, which is why the same command never showed it locally.

Fix (`scripts/lib/browser.mjs`, `FONT_STABLE_ARGS`, applied to both
`chromium.launch()` calls): force both launches onto the same deterministic,
non-LCD, grayscale text path —
`--font-render-hinting=none --disable-lcd-text
--disable-font-subpixel-positioning --force-color-profile=srgb`. Verified on
a scratch branch (`fix/ci-visual-parity`, CI run
[34775382247](https://github.com/vipinvmenon/boa-accreditation/actions/runs/34775382247)):
`gate` and `vehicle` now pass in the same CI environment at 0.10–0.65%,
matching local numbers. `THRESHOLD` itself was not touched — the fix is in
the harness, not a loosened gate.

## Responsive

v2 uses container queries on `.frame`, at `1100px` and `700px`, rather than
the frozen v1 `768px` media-query model. The 390px capture is therefore made
by setting the viewport; the preview's Web/Mob furniture is not clicked or
shipped. The `~900px` tier is a real manual-check requirement because the
automated visual harness captures only 1360px and 390px.

## Active nav item

`renderVals()` computes the active nav item's colours once (lines 624-632),
shared by every screen: `background: grnbg` (an 8-10% green tint, not a solid
fill) and `color: dark ? grn : ink` — light theme uses near-black `ink` for
the label, not green, for contrast against the pale tint. Both `GateChrome`
and `DeskChrome` render `NAV` independently (gate/desk have different routes
visible), so this logic is duplicated rather than shared — keep both in sync
by hand if it changes; `DeskChrome` previously rendered a **solid** green
background with `on`-coloured text instead (fixed 12 Sep 2026).

## Hover states

The design source's own preview tool reads a non-standard `style-hover`
attribute and swaps styles on mouseenter/leave; it never transcribes
literally, but the 19 distinct hover treatments it encodes are real design
intent, not review furniture. Until 12 Sep 2026 the shipped app implemented
none of them — only the generic `a:hover { color:#E3BB72 }` transcribed
verbatim from the helmet stylesheet, which is wrong for at least the nav
links (the source specifies `color:var(--ink)` on hover there, not gold) and
would have been invisible on "Manage list →" (gold text on its own gold
background).

`app/hover.css` defines one reusable class per distinct recipe (8 cover all
19 instances) rather than one class per button, applied via `className` on
every button/link that has one. Two recipes — `hov-fill-grn`/`hov-fill-bad` —
aren't literal `style-hover` values; they cover controls whose base style in
this app already sits at the design's *outline-on-hover* look (queue's
Approve/Reject render a permanent coloured outline, not the design's neutral
outline that only colours on hover), where an outline→outline hover would be
invisible. Filling on hover keeps the affordance without redesigning that
base style, which is a separate, larger divergence this pass did not attempt.
`vehicle-screen.tsx`'s "Turn away — log reason" has no design counterpart at
all (the mock has no refuse outcome) but reuses `hov-fill-bad` for the same
reason "Reject" does.

Colour/background on these elements is set per-instance inline (active,
selected, enabled state), which beats any stylesheet rule regardless of
specificity — so the `:hover` rules in `hover.css` carry `!important`,
scoped to these classes only. `120ms` is the one explicit `transition` value
in the source (the nav button); applied uniformly rather than invented anew
per element.

## Additions to the design, and their justification

The design is a canvas: it has no keyboard, no small screens and no accessibility
surface. Four additions are made in `app/globals.css`, each minimal:

1. `font-size: 16px` floor on form controls — below this iOS zooms on focus.
2. `:focus-visible` ring in `--grn` — a canvas has no keyboard; an approver on a
   laptop does. `:focus-visible` only, so a thumb tap leaves no ring.
3. `.sr-only` — for labels the design conveys by position alone.
4. `prefers-reduced-motion` — standard.

Anything beyond these is a change to the contract and needs Vipin, not an edit.

## Definition of done for any UI task

1. Rendered against `design/reference/` at ≤0.8% (`corepack pnpm test:visual`).
2. Both themes, both sides of the 768px breakpoint.
3. No hardcoded fixture data in a screen file — it reads the data layer.
4. `corepack pnpm lint` green, meaning both colour layers still match source.
5. Every declared font weight imported.
6. Tap targets ≥44×44 even where the design draws them smaller.
