# Design system

The approved design is `design/source/boa_design_body.html`, committed verbatim.
Markup is lines 1–560; the data and state model is the `DCLogic` class at lines
563–864. `boa_design_bundle.html` is the original artefact it was recovered from,
and `boa_design_source.html` is the unpacked whole including the font CSS.

**It is the contract. Reproduce it; do not reinterpret it.**

## How the design gets into the app

Transcribed inline styles, plus one small stylesheet. **No Tailwind, no CSS
modules, no component abstraction over the design's own markup.**

That looks like the wrong choice, so here is why it is not. The design is 560
lines in which *every* value is an inline `style` attribute written as
`var(--token, literal-fallback)`. Tailwind would mean inventing ~200
arbitrary-value classes (`text-[10.5px] tracking-[0.09em]`); CSS modules would
mean inventing ~300 class names for markup that has none. Both are *translations*,
and every translation is a place for the rendered result to drift from the
approved artefact without the diff showing it.

`boa-stok-form` reached the same conclusion and states it well:

> Every `style` object below is the design's own inline `style` attribute,
> transcribed rather than reinterpreted. It is repetitive on purpose: a shared
> component or utility class would read better but would let the rendered result
> drift from the approved design without the diff showing it.

So: `app/globals.css` is the design's own `<helmet>` stylesheet and nothing else.
`lib/design.ts` holds only values that genuinely must be shared. Everything else
is transcribed where it appears.

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
`scripts/audit-font-weights.mjs` proves this on every lint, scoped per style
attribute so a `font-weight` from a neighbouring rule cannot be misattributed.

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

## Responsive

The design's Web/Mob toggle (`vpTabs`) is a **design-review affordance and is not
shipped**. Every `mob ? A : B` in `renderVals()` becomes a real media query at
`768px` (`MOBILE_BREAKPOINT_PX`), and `shellMax` becomes `max-width: 1280px`
(`SHELL_MAX_PX`). Both live in `lib/design.ts`.

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
