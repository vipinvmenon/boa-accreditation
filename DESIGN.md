---
name: BOA Accreditation
description: The festival's own credential system — poster, woven bands, ticket — for the desk, the gate and the pass.
colors:
  bg-near-black: "#0A0A0A"
  bg-gradient-note: "body::before is a fixed radial+linear gradient, ~75% near-black / 25% green corner; see North Star"
  surface: "#101012"
  raised: "#16161A"
  tray: "rgba(242,239,226,.035)"
  bone: "#F2EFE2"
  bone-2: "rgba(242,239,226,0.74)"
  bone-3: "rgba(242,239,226,0.60)"
  bone-hair: "rgba(242,239,226,0.10)"
  bone-hair-strong: "rgba(242,239,226,0.22)"
  ritual-gold: "#E3BB72"
  gold-hair: "rgba(227,187,114,0.30)"
  poison-green: "#00F5A5"
  signal-red: "#FF6B5A"
  paper: "#EDEAE1"
  paper-surface: "#F6F4EC"
  paper-raised: "#FFFFFF"
  soot: "#14141A"
  soot-2: "rgba(20,20,26,0.78)"
  soot-3: "rgba(20,20,26,0.64)"
  soot-hair: "rgba(20,20,26,0.12)"
  gold-deep: "#5E4610"
  green-deep: "#05603F"
  red-deep: "#9E1F14"
typography:
  display-xl: { fontFamily: "Anton, Impact, sans-serif", fontSize: "clamp(56px, 6.2vw, 92px)", fontWeight: 400, lineHeight: 0.86 }
  display-lg: { fontFamily: "Anton, Impact, sans-serif", fontSize: "clamp(38px, 4.4vw, 56px)", fontWeight: 400, lineHeight: 0.9 }
  display-md: { fontFamily: "Anton, Impact, sans-serif", fontSize: "33px", fontWeight: 400, lineHeight: 0.95 }
  display-sm: { fontFamily: "Anton, Impact, sans-serif", fontSize: "21px", fontWeight: 400, lineHeight: 1 }
  number: { fontFamily: "Anton, Impact, sans-serif", fontSize: "39px", fontWeight: 400, lineHeight: 0.9, fontFeature: "tabular-nums" }
  label: { fontFamily: "Oswald, sans-serif", fontSize: "12px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "0.12em" }
  label-sm: { fontFamily: "Oswald, sans-serif", fontSize: "12px", fontWeight: 600, lineHeight: 1.2, letterSpacing: "0.12em" }
  body: { fontFamily: "Instrument Sans, Archivo, system-ui, sans-serif", fontSize: "14px", fontWeight: 400, lineHeight: 1.55 }
  body-sm: { fontFamily: "Instrument Sans, Archivo, system-ui, sans-serif", fontSize: "12.5px", fontWeight: 400, lineHeight: 1.45 }
  mono: { fontFamily: "JetBrains Mono, ui-monospace, monospace", fontSize: "12px", fontWeight: 500, lineHeight: 1.3, letterSpacing: "0.04em" }
rounded:
  xs: "4px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "30px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "14": "56px"
  "20": "80px"
motion:
  quick: "220ms"
  base: "300ms"
  slow: "440ms"
  ease-out: "cubic-bezier(.22, 1, .36, 1)"
  ease-hover: "cubic-bezier(.25, .8, .25, 1)"
components:
  button-primary: { backgroundColor: "{colors.poison-green}", textColor: "#0A0A0A", typography: "{typography.label}", rounded: "{rounded.pill}", height: "48px", padding: "0 20px" }
  button-secondary: { backgroundColor: "transparent", textColor: "{colors.bone}", typography: "{typography.label}", rounded: "{rounded.pill}", height: "48px", padding: "0 20px" }
  button-danger: { backgroundColor: "transparent", textColor: "{colors.signal-red}", typography: "{typography.label}", rounded: "{rounded.pill}", height: "48px" }
  field: { backgroundColor: "{colors.surface}", textColor: "{colors.bone}", typography: "{typography.body}", rounded: "{rounded.md}", height: "48px", padding: "0 16px" }
  chip: { backgroundColor: "{colors.raised}", textColor: "{colors.bone}", typography: "{typography.body-sm}", rounded: "{rounded.pill}", height: "36px", padding: "0 8px 0 16px" }
  card: { tray: { padding: "6px", rounded: "28px", backgroundColor: "{colors.tray}", ring: "1px rgba(242,239,226,.08)" }, plate: { inset: "6px", rounded: "22px", backgroundColor: "#101012 @ 78-88%" } }
  sheet: { backgroundColor: "glass, blur(28px) saturate(160%)", rounded: "{rounded.xl}", width: "480px" }
  status-pill: { typography: "{typography.label-sm}", rounded: "{rounded.pill}", height: "26px", padding: "0 12px 0 10px" }
  count-dot: { diameter: "26px", rounded: "{rounded.pill}", typography: "{typography.mono}" }
---

# Design System: BOA Accreditation

> **Status: proposed.** This file describes the built r10.5 proposals
> (`design/proposals/r8/tokens.css`, `design/proposals/r8/ui.css`, and the
> r8-*.html pages) as they stand, not as r8 was first pitched. `ui.css` is a
> base layer plus override sections r9 → r10.5; every value below is the
> value that actually wins on screen today, not the layer that first
> introduced it. It becomes the design contract when Vipin approves and an
> ADR supersedes ADR-017. Until then `design/source/boa_design_v2.html` and
> `docs/DESIGN-SYSTEM.md` remain the contract (CLAUDE.md non-negotiable #1).

## North Star

**"The Credential", dark first, mild liquid glass.** Everything in this
product is, or points at, a credential: a woven band, a ticket, a name on a
list. The page is near-black with a whisper of green in one corner, and every
card wears the *existing* v2 bezel remade as a soft glass plate — not the
flat, hairline-only v2 world, and not full Apple-style glass either.

**Background** (`body::before`, fixed, no `background-attachment: fixed`): a
gradient reading roughly 75% near-black / 25% green corner —
`linear-gradient(155deg, #070808 0%, #090A0A 60%, #0A0F0D 85%, #0C1A14 100%)`
plus a small radial green glow bottom-right. Behind it, a tiny pre-shrunk
ambient image (`img/ambient-40.png`, already scaled down) at `opacity: .1`
with **no live CSS filter** — softness comes from the small source, not
`blur()` at runtime. Light theme uses the paper-toned equivalent.

**Cards keep the existing v2 double bezel**, as two nested shapes:
- **Tray** (the element): `padding: 6px`, `border-radius: 28px`,
  `rgba(242,239,226,.035)` fill, 1px `rgba(242,239,226,.08)` ring, drop shadow.
- **Plate** (`::before`, `inset: 6px`): `border-radius: 22px`, fill
  `color-mix(in srgb, #101012 78%, transparent)` (78% solid is what r10.4/
  r10.5 leave standing) with a top-highlight gradient.
- **Mild liquid glass**: `backdrop-filter: blur(8px)` on the **plate only**,
  gated to `@media (hover: hover) and (min-width: 900px)` — never on phones,
  never at the gate.

**Sheets are stronger glass**: `blur(28px) saturate(160%)` on a translucent
dark gradient fill; the scrim behind them is `blur(3px)`. **The active nav
item** is a green glass pill: green gradient fill, `blur(10px) saturate
(150%)`, a green hairline ring, and green link text.

An operations tool used at night, outdoors, often offline, by people in a
hurry. Poster art appears where it identifies the product (sign-in, the
pass, the Control room hero, band shelf) and never behind a working list.

**Key characteristics:**
- Dark first, glass second: a near-black stage, a faint green corner, glass
  reserved for card plates (mouse + wide viewport only), nav, and sheets.
- Anton for names, numbers and verdicts; Oswald caps for labels; the body
  face is Instrument Sans (see Typography).
- Colour means something: tier colours, zone-map colours, green/gold/red for
  state — never used as chrome next to a card's own glass.
- One radius scale, one spacing scale, one motion scale. No one-offs.
- Hover moves are transform and opacity only — nothing else animates on
  hover, and nothing loops except the pass glare and skeleton shimmer.

## Colors

A near-black stage with bone text, one structural accent (gold) and one
action colour (poison green); everything else that is coloured is festival
data.

### Primary
- **Poison Green** (`#00F5A5`): the primary action and the "yes" state — the
  one filled button on a screen, a green gate verdict, "In BMS", "Delivered",
  the active nav pill. Light theme uses **Green Deep** (`#05603F`).

### Secondary
- **Ritual Gold** (`#E3BB72`): structure and attention — section labels,
  hairline edges of sheets and tickets (as **Gold Hair**, 30%), the "waiting"
  state. Light theme uses **Gold Deep** (`#5E4610`).

### Tertiary
- **Signal Red** (`#FF6B5A`): refusal and failure only. Light theme uses
  **Red Deep** (`#9E1F14`).

### Neutral
- **Near-Black** (`#0A0A0A`): the page colour token; the page itself renders
  the gradient in North Star, not a flat fill. **Surface** (`#101012`): the
  plate fill inside every card, table and sheet. **Raised** (`#16161A`):
  chips, hovered rows, menus, avatars.
- **Bone** (`#F2EFE2`): primary text. **Bone 2** (74%): secondary text.
  **Bone 3** (60%): captions and placeholders. **Bone Hair** (10%): dividers.
  **Bone Hair Strong** (22%): hover rings.
- Light theme: **Paper** (`#EDEAE1`) page, **Paper Surface** (`#F6F4EC`),
  **Paper Raised** (`#FFFFFF`), **Soot** (`#14141A`) text at 100/78/64%,
  **Soot Hair** (12%).

### Festival data colours (not tokens; data)
The eight tier colours and six zone-map colours live in `lib/design.ts`
(`TIERS`, `ZONE_MAP_HEX`) and arrive per element as `--c`. Never used for
chrome.

### Named Rules
**The Band Owns Its Colour Rule.** Where a tier or zone colour appears, no
accent colour sits beside it: no green button on a tier card, no gold label
on a band strip.

**The One Green Rule.** At most one filled green button per screen.
Everything else is outline or text — plus the one green nav pill for whatever
page is active, which is state, not an extra action.

## Typography

**Display font:** Anton (Impact fallback). **Label font:** Oswald 600,
tracked caps. **Mono font:** JetBrains Mono 500/700. All unchanged since r8.

**Body font: Instrument Sans** (chosen by Vipin, 28 Sep 2026, ACC-178),
through `--f-body: 'Instrument Sans', 'Archivo', system-ui, sans-serif`. It
must be self-hosted via `@fontsource` before it ships (the gate is offline),
so ACC-179 adds it. The Google Fonts `@import` and the `.proto` font toggle
in the proposal's `tokens.css` are proposal-only. Hanken Grotesk and Manrope
were the rejected candidates.

### Hierarchy (scale as built, ~10% down from the first r8 pitch)
- **Display XL** (`clamp(56px, 6.2vw, 92px)`, line-height .86): sign-in and
  the Control room hero number only.
- **Display LG** (`clamp(38px, 4.4vw, 56px)`, .9): one H1 per screen.
- **Display MD** (`33px`, .95): a person's name on the ticket, the sheet and
  the gate result.
- **Display SM** (`21px`, 1): tier names, card titles.
- **Number** (`39px`, tabular-nums): stat values.
- **Label** (Oswald 600, `12px`, `0.12em`, uppercase): buttons, section
  heads, nav, table headers, status pills.
- **Body** (body face, `14px`, 1.55): sentences.
- **Body SM** (body face, `12.5px`, 1.45): meta lines under a name, sentence
  case.
- **Mono** (JetBrains Mono 500, `12px`, `0.04em`): data typed or matched
  character by character, and the `.count-dot` badge number.

### Named Rules
**The 12px Floor Rule.** No text below 12px anywhere.

**The Caps Are Labels Rule.** Uppercase is for labels and buttons. Data is
sentence case.

## Layout

A 1440px frame, 40px gutters on the desk (20px under 700px), as a container
query on `.app` (`container: app / inline-size`), not a media query. Spacing
is a 4px scale: 4, 8, 12, 16, 20, 24, 32, 40, 56, 80. Cards pad 6px (tray) +
28px (plate), not a flat 24px. Sheets are 480px wide on desktop, full width
and bottom-anchored under 700px. Container breakpoints: 700px (phone), 900px
(glass-capable pointer devices), 1000/1100px (narrow desktop, per-page).

## Elevation & Depth

Depth comes from surface steps, hairlines, and a glass plate on
hover-capable, wide-enough devices. Solid surfaces are the default; glass is
an enhancement gated to `(hover: hover) and (min-width: 900px)`, never the
baseline.

### Shadow vocabulary
- **Edge** (`box-shadow: inset 0 0 0 1px var(--hair)`, plus a matching
  outer ring on the tray): every card and field at rest.
- **Lifted** (`box-shadow: inset 0 0 0 1px var(--gold-hair), 0 24px 48px
  -24px rgba(0,0,0,.6)`): the operator popover and menus.
- **Sheet glass**: `backdrop-filter: blur(28px) saturate(160%)` on a
  translucent gradient fill, `box-shadow: inset 0 0 0 1px rgba(255,255,255,.1),
  inset 0 1px 0 rgba(255,255,255,.16), -30px 0 80px -30px rgba(0,0,0,.8)`.
  Scrim: `background: rgba(0,0,0,.42)`, `backdrop-filter: blur(3px)`.
- **Card plate glass** (hover-capable + ≥900px only): `backdrop-filter:
  blur(8px)` over the 78% solid plate fill.
- **Floating** (`filter: drop-shadow(...)`): the pass ticket over the
  poster only.

### Named Rules
**The Hairline Rule, extended.** Edges are still 1px lines at rest. Glass is
earned by floating above real content behind it (a sheet over the page, a
card plate over the ambient gradient) — it is never added just to look
frosted, and it is never the only thing separating a surface from its
background.

**Reduced-transparency fallback.** `@media (prefers-reduced-transparency:
reduce)` removes the ambient layer and drops every glass surface (cards,
tables, sheets, menus, toasts, nav, inputs, chips) to `var(--surface-solid)`
with no `backdrop-filter`. This must ship as written — it is not optional
polish.

**Reduced-motion fallback.** `@media (prefers-reduced-motion: reduce)` and
`[data-motion="reduced"]` collapse every duration token to `1ms`; the
skeleton shimmer and ring/meter fill animations stop.

## Shapes

Gently rounded, never soft: 4px on swatches and focus corners, 10px on small
controls inside cards, 14px on fields and menus, 22px on the card **plate**,
28px on the card **tray**, 30px (`--r-xl`) on sheets and tables, pills for
buttons, chips and status. The bezel (tray + plate) is the standing shape for
every card, table and empty state — it is not retired, it is the current
system, rebuilt in glass.

## Motion

- **Durations:** quick `220ms`, base `300ms`, slow `440ms` (`120ms` instant
  for presses, `700ms` settle for the hero ring/meter fill).
- **Easing:** `--e-out: cubic-bezier(.22, 1, .36, 1)` for enters/opens/
  settles; `--e-hover: cubic-bezier(.25, .8, .25, 1)` for pointer-triggered
  change (card lift, button fill, chip/tab colour). A sampled spring
  (`--e-spring`) drives only the nav pill slide and sheet entrance.
- **On hover:** `transform` and `background-color`/`box-shadow` opacity only
  — cards lift 3px, buttons lift 1–2px and brighten, chips/rows tint. Never
  layout or size.
- **Loops:** the pass ticket glare and the skeleton shimmer only.

## Primitives

Thirteen primitives, class names as built in `r8/ui.css` — build from these,
not invented names.

1. **Button** — `.btn`/`.btn-primary`/`.btn-danger`/`.btn-ghost`/`.btn-sm`/
   `.btn-gate`/`.btn-block`/`.btn-link`. States: rest, hover (fill-wipe or
   lift), active (`scale(.97)`), disabled. React Bits **HoldButton** =
   `.hold`+`.hold-fill` (`--p` drives fill), for "Send N passes" and reissue.
2. **Field** — `.field` > `.input`. States: rest, hover, `:focus` (2px inset
   bone ring), `[aria-invalid]` (red ring + `.error`). `.input-mono` variant.
3. **Select** — `.select > select` + `.select::after` (Phosphor caret).
4. **Chip** — `.chip`/`.chip-edit`/`.chip-x`/`.chip-preset` (+`.count-dot`).
   Enter `chip-in`; exit `.leaving`.
5. **FilterBar** — `.filterbar` > `.filterbar-row` (search/selects) +
   `.chips` (active) + preset chips with counts (`r8-master.html` pattern).
6. **StatusPill** — `.pill`/`.pill-ok`/`.pill-wait`/`.pill-bad`. Always dot
   + label + colour, never colour alone.
7. **Card** — `.card` (tray+plate bezel). `.spot` adds React Bits
   **SpotlightCard** (pointer-following light, linked cards only).
8. **Sheet** — `.sheet` (+`.scrim`/`.sheet-head`/`.sheet-body`/`.sheet-foot`/
   `.grabber`). Right on desktop, bottom-sheet on phones (drag to close).
9. **Table** — `.table` (bezel) > `.thead` (sticky `top: 64px`, hides under
   700px) > `.tr` (hover tint + tier-swatch grow, collapses via `.row2`).
10. **EmptyState** — `.empty` (bezel), `.empty-error` variant.
11. **Skeleton** — `.sk` + `.sk-line`/`.sk-num`/`.sk-pill`/`.sk-dot`/`.sk-sq`/
    `.sk-hero`; one shimmer, respects reduced motion.
12. **Toast** — `.toasts` > `.toast` (`.bad` variant), slide/fade in and out.
13. **CountDot** — `.count-dot`: 26px pill carrying a tabular-nums mono
    count. React Bits **CountUp** drives it in; needs `motion`.

Also seen, reusing durable classes: React Bits **StatusMark** (`.mark` +
`<svg>` + `draw` keyframes, the gate's tick/bang/cross; needs `motion`) and
**GlareHover** (the sheen in `.bandc .art::after` on the band shelf,
`r8-control-room.html`, a TS-CSS variant, no runtime dependency).

## Components

Buttons, chips, status pills, cards and fields are the primitives above,
built exactly as listed; this section covers the page-level patterns that
sit on top of them (nav, ticket, sheet) and are not one-to-one with a single
primitive class.

### Navigation
A single glass bar (nav island: `border-radius: pill`, its own glass fill and
edge, floating with `top: var(--s-3)` rather than flush to the viewport top).
Logo, five items, operator avatar. **The active item is a green glass pill**
(`linear-gradient` green fill, green hairline ring, green text) that slides
between items (`--e-spring`). Counts ride on items as small badges. On
phones the items move into a glass sheet from the top.

### The Ticket (signature)
Unchanged since ADR-025: the band strip as the top edge, name in Display MD,
tier in its band colour, held zones as zone-map squares, a notched tear
line, the QR on a bone plate. Inside a sheet, the ticket itself goes glass
too (`--tk-surface: rgba(12,12,16,.5)`, blurred top/stub), so it reads as one
glass object floating over the glass sheet, not a solid card punched through
it.

### Sheet
Slides from the right on desktop (480px), rises from the bottom on phones
(drag to close). Strongest glass in the system (`blur(28px) saturate(160%)`);
scrim is `blur(3px)`. Detail for a row always opens here.

### Skeleton
Built from the same boxes as the widget it replaces; one slow shimmer;
cross-fades to content with no size change.

## Do's and Don'ts

### Do:
- **Do** put the festival's imagery (poster, bands, ambient gradient) where
  it identifies the product, and solid-plus-glass surfaces where people work.
- **Do** show held zones only, as zone-map squares, everywhere zones appear.
- **Do** use one H1 per screen.
- **Do** gate card-plate glass to `(hover: hover) and (min-width: 900px)` —
  phones and the gate get the solid 78% plate with no `backdrop-filter`.
- **Do** honour `prefers-reduced-transparency` (solid fallback) and
  `prefers-reduced-motion` (durations to `1ms`) exactly as written in
  `ui.css`.
- **Do** keep 44px hit areas, 56px at the gate.

### Don't:
- **Don't** put text on the poster or on a band strip.
- **Don't** use a green or gold accent next to a tier colour.
- **Don't** treat "liquid glass" as Apple's platform material — it is a web
  approximation (`backdrop-filter` + gradient sheen) and must say so anywhere
  it is discussed with stakeholders.
- **Don't** apply `backdrop-filter` on more than one nested layer at once
  (r9.1 already found this: double blur on cards was the jank; only the
  ambient layer and floating layers — nav, sheet, hero plate — get a live
  blur).
- **Don't** set any text below 12px, or data in uppercase mono.
- **Don't** animate anything but transform/opacity on hover, or loop
  anything except the pass glare and the skeleton shimmer.
- **Don't** use SF Pro or SF Symbols, or any system display face; icons are
  Phosphor Light only, self-hosted (`public/fonts/phosphor-light.woff2`), and
  the display/label faces are Anton/Oswald, never a platform system font.

## Not canonized

These are recorded as defects the build currently carries, not as rules for
future surfaces to copy: (1) the Google Fonts `@import` in the proposal's
`tokens.css` is proposal-only; ship Instrument Sans from `@fontsource`; (2) the r8
proposal chrome (`.proto`, the blue floating switcher) and the `.hero-kicker`
live-status line on the Control room hero are proposal/demo affordances, not
confirmed system components — do not extend the kicker pattern to other
pages until it is explicitly approved as a rule rather than a hero-specific
label.
