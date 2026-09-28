# UX audit, round 2 — BOA Accreditation

_28 Sep 2026. Phase 1 of the redesign brief (Vipin, 28 Sep). No app code changed.
Gate live 4 Oct, show 10 Oct: six days to gate live._

Round 1 is [`ux-audit.md`](ux-audit.md) (27 Sep). Since then the pass became a ticket
(ADR-025), sign-in became the poster (ADR-026) and the footer was rebuilt (ACC-176b).
Those three are **approved** and are the reference for the new look; they are audited
here only where they touch something else.

## How this was reviewed, and what was not

| What | How | Evidence |
|---|---|---|
| Every route, 1440×900 and 390×844, dark and light | Playwright against a local production build (`scripts/ux-crawl.mjs`) | 101 PNGs in [`ux-audit/screens-r2/`](ux-audit/screens-r2/), indexed in its README |
| Empty, API-500, offline, empty-cache, menus open, org-filter walkthrough | Same script | same folder, `*-empty-*`, `*-500-*`, `gate-offline-*`, `orgfilter-*` |
| Every UI primitive and design value, with counts and file:line | Read-only source sweep | [`ux-audit/inventory-r2.md`](ux-audit/inventory-r2.md) (full), summarised in §1 |
| Contrast | Computed from the tokens in `app/globals.css:17-42` | §7 |
| Impeccable detector | `impeccable detect --json app components` | 1 finding (Arial in the confirm email, `app/auth/confirm/route.ts:65`) |

**Not a real session.** The brief asked for the `qa-visual` operator (ACC-090a). It does
not exist: ACC-090a is still blocked on Vipin and `.env.local` has no
`VISUAL_OPERATOR_*`. Every desk and gate screen here is the **real shipped component**
fed **fixture data** through mocked `/api/desk/*` and `/api/gate/*` responses and a seeded
Dexie cache — the same method `test:visual` and `tests/e2e` use. The pass page used a
local PostgREST stub. **No production data, no real person, no live QR** appears in any
screenshot. What this cannot show: real row counts (612 people), real latency, the real
WhatsApp in-app browser, a real phone outdoors, or a screen reader. Those remain
unverified.

**The first "light" shots were dark.** The app ignores the OS colour scheme
(`app/layout.tsx:88` renders a static `data-theme="dark"`; light is reachable only from
the operator menu and is not persisted). The crawl was fixed to set `data-theme="light"`
the way the toggle does, and all 32 light shots were re-taken (replacing the dark duplicates). That the app ignores the
OS setting is itself finding **F-31**.

**Playwright MCP failed to connect** in this session; the crawl used the repo's own
`@playwright/test`.

---

## 1. Inventory of UI primitives

Full detail with every file:line is in [`ux-audit/inventory-r2.md`](ux-audit/inventory-r2.md).
This is the summary that drives §5 and Phase 2's token set.

### 1.1 The counts

| Primitive | What exists | Count | Where it drifts |
|---|---|---|---|
| **Button** | `.btn` pill (50px) + 10 modifier classes (`go`, `gold`, `bad`, `wide`, `big`, `solo`, `.ic`, `.n`, `:disabled`, `.linkbtn`) + 11 hover recipes (`hover.css`) | 23 call sites, 14 distinct class combinations | `.btn.gold` never used (`v2.css:158`); `.void` orphaned, no min-height (`v2.css:487`); which hover class goes with which base is hand-picked per call site |
| **Tap targets under 44px** | `.av` avatar 38×38 (`v2.css:104`, `desk-chrome.tsx:260`, `gate-chrome.tsx:199`); `.status-error-retry` 30px (`v2.css:118`, `desk-chrome.tsx:297`) | 2 live | Both are in chrome, so both are on every screen including the gate |
| **Input** | `.field input` 52px, `.utility-input` 52px, `.search` ~46px, `.serial` mono, `.plate-in`, `.name-search` 48px | 6 styles | Three focus-ring shapes: inset-on-`:focus` (`v2.css:321,382,509`), outline-on-`:focus-visible` (`v2.css:523`), non-inset ring (`v2.css:296`) |
| **Select** | `.utility-select` (OS default chrome) — live once (`users-screen.tsx:286`); `.pick select` custom pill — dead (`v2.css:269`) | 1 live, 1 dead | The on-brand select is the dead one |
| **Checkbox / toggle** | `.ck` 24×24, `.sw` 50×30 | 0 live | Styled, documented, unused; any re-use ships a sub-44px control |
| **Surface** | Bezel `.bz`+`.pl` (12+13 uses); glass (`.island`, `.status`, `.menu`, `.profile-menu`, `.tools`); ticket `.tk-*` | 3 systems | Blur 18 / 22 / 40px (`v2.css:87,112,121,242,539,626`); a list of records is card-per-row on Orgs and Users but divided flat rows on Master and Control room |
| **Chip / tag / pill** | `.tag` (+`.gold`), `.st` (`ok`/`wait`/`no`/`mute`), `.band` (`--c`), `.zones span` (+`.off`), `.checks .ok` | 5 families | Colour is chosen three ways: class variant, inline `--c`, raw inline `style` (`error.tsx:23`, `global-error.tsx:74`, `gate/page.tsx:257`) |
| **Radius** | tokens `--r-out` 28, `--r-in` 22, `--r-sm` 14; literals 999 (×30), 10, 8, 7, 4, 3, 2, 50%, 40 | 3 tokens + 9 literals | 22/28 re-typed as literals in `ticket.css:34,41` and `responsive.css:422` |
| **Shadow** | tokens `--hi`, `--lift`; 30 distinct `box-shadow` strings | 2 tokens | Hand-rolled: `.sw::after` (`v2.css:329`), `.auth-panel` (`responsive.css:422`), ticket `drop-shadow` (`ticket.css:18`) |
| **Spacing** | No scale. `padding` >45 distinct literals; `gap` 25 | 0 tokens | "Card padding" is 24, 26, 28 or 34px depending on the screen |
| **Type size** | 4 families via tokens (Anton, Oswald, Archivo, JetBrains Mono); >45 distinct sizes incl. 15 `clamp()` | 0 size tokens | Captions at 9.5 / 10 / 10.5 / 11 / 11.5px; tracking .12 / .13 / .14em for the same role |
| **Inline type** | Hand-rolled "mono caption" `style={{}}` objects that re-implement `.mono` (`v2.css:141`) | 10+ | `orgs-screen.tsx:59-65,158-166`, `users-screen.tsx:51-57,244-256,320-327,353`, `master-screen.tsx:168,171` |
| **Colour** | Theme tokens (`globals.css`); 3-type legacy `TYPES`; 8-tier `TIERS` + 6-zone `ZONE_MAP_HEX` (`lib/design.ts`) | 4 palettes | ~10 `var(--ink2, rgba(242,239,226,.72))` fallbacks hard-coded to the **dark** value; legacy `TYPES` still drives `zoneChips()` and `gateBandCard()` |
| **Icon** | Phosphor Light webfont, 14 glyphs declared (`components/icon.tsx`), 11 rendered | 11 live | `caret-down`, `plus` dead; `&rarr;` entity as an icon (`orgs-screen.tsx:228`) beside `<Icon name="arrow-right">` for the same affordance (`person-search.tsx:159`) |
| **Motion** | `--ease` + two un-tokenised curves; 14 keyframes | 3 curves | `s-rise-in` defined twice (`motion.css`, `v2.css:355-358`); `hover.css:51` transitions have no easing; one decorative infinite loop (`drift`, `v2.css:193`) |
| **Breakpoints** | Container queries 1100/700; media 768, 900, 700; print ×2 | 5 | 700 is both a container and a media query for adjacent parts; `SHELL_MAX_PX` (1280) is re-typed as a literal 4× in `responsive.css` |
| **Z-index** | `--z-nav` 40 (dead), `--z-menu` 60, `--z-tools` 80, `--z-grain` 90; literals 1 (×5), 5 | 4 tokens | `--z-nav` is never used |
| **Components** | Shared: `Icon`, `PassTicket`, `SiteFooter`, `EmptyState`, `InlineError`, `InlineConfirm`, `Skeleton` + 4 per-screen skeletons | 11 | `DeskChrome` and `GateChrome` duplicate the menu, drawer, nav pip and theme logic (`desk-chrome.tsx:126-232` vs `gate-chrome.tsx:81-166`); Master list hand-rolls its own table skeleton (`master-screen.tsx:198-210`) |

### 1.2 What is consistent, and should be kept

- Four type families, each behind a variable; uppercase for labels and sentence case for
  body, applied with discipline.
- `EmptyState`, `InlineError` and `InlineConfirm` are shared and used everywhere; there
  is no `alert()` or `confirm()` in the app.
- `prefers-reduced-motion` is respected globally (`globals.css:85-90`), and the ticket
  glare and sign-in art go further and hide the effect, not just shorten it.
- `PassTicket` is the one component shared between two surfaces (the holder's pass and
  the desk sheet). It is the model for every primitive in Phase 2.

---

## 2. Remove list

Everything below is duplicated, redundant or unnecessary. "Remove" means the element
goes; where something replaces it, that is said.

### Chrome (every desk and gate screen)

| # | Element | Where | Reason |
|---|---|---|---|
| R-01 | Status-bar "Build 05-09 Oct, show 10 Oct" | `desk-chrome.tsx:291` | The footer now says "Build 5 to 9 October" and "Show 10 Oct 2026" on the same screen (ACC-176b) |
| R-02 | Status-bar "184 / 612 bands issued" | `desk-chrome.tsx:299` | Repeats the Control room's "Bands issued" card directly under it, and on other screens it is a number nobody acts on. The status bar goes; see R-03 |
| R-03 | Status-bar "14 not in BMS" link | `desk-chrome.tsx:300` | It is a hidden filter entry point (it is how operators land in a filtered Master list without choosing to). The count moves to a badge on the Master list nav item and a preset chip in the filter bar (§4) |
| R-04 | "Accred / desk" micro-wordmark beside the logo | `desk-chrome.tsx:245` | ADR-026 removed the same wordmark from sign-in as noise; the logo is enough |
| R-05 | The tag pill above every H1 ("Control room", "Master list", "The pass", "Import matching", "Desk operations", "Crew check-in") | each screen's `.head` | The screen is named three times: nav highlight, tag, H1. "Import matching" and "The pass" also disagree with the nav's own labels |
| R-06 | "Accred desk" and status bar on the **gate** | `gate-chrome.tsx` | The gate status bar shows "14 not in BMS" — a hardcoded literal (`app/gate/page.tsx`, `bmsPending={14}`) and not an issuer's concern. The gate keeps one strip: gate, operator, sync |
| R-07 | Avatar fallback initials "VI" | `desk-chrome.tsx:268` | Shows Vipin's initials for every operator until `/api/desk/operators` returns. Show an empty circle skeleton instead |

### Control room

| # | Element | Reason |
|---|---|---|
| R-08 | "Open the gate scanner" button in the hero | Desk leads are not issuers; Gate is already in the nav. It is the only primary button on the screen and it sends the reader away |
| R-09 | "Eight bands. No ninth." heading | A slogan computed from the data (`bandsHeading()`); it tells the reader nothing the eight cards don't |
| R-10 | Struck-through zone chips on the eight tier cards | The approved pass (ADR-025 amendment) shows **held zones only**. The Control room still shows all six with refused ones struck through — two rules for the same data |
| R-11 | "38 companies on site" section | A section whose only content is a heading and a link. The Organisations stat card already carries the number and can carry the link |
| R-12 | Organisations card detail "31 not yet listed" | `submittedOrgs − orgs.length`; no operator can say what it means |
| R-13 | Hero headline "29 waiting on a decision" | Approval happens in the response sheet (ADR-019); nothing on this screen or any other lets the desk decide. The headline becomes the number the desk *can* act on — see F-02 |
| R-14 | Second `/api/desk/dashboard` fetch | The chrome and the screen each fetch it (`desk-chrome.tsx:48`, `control-room-screen.tsx:255`); one request, shared |

### Master list

| # | Element | Reason |
|---|---|---|
| R-15 | Lede "Append-only. A reissue adds a row…" | An implementation note for developers, not an instruction to an operator |
| R-16 | "No vehicle", "Not issued", "Not collected" written in every empty cell | 612 rows of repeated grey text. An empty cell (or an en dash) reads faster; the column header says what is missing |
| R-17 | Combined filter banner + one "Show everyone" link | Replaced by removable chips and a clear-all (§4) |
| R-18 | Scroll-reveal on the search bar, banner and table (`.rv`, 1100ms `visualReady` timer) | Motion on a work surface that delays the thing the operator came for (§3) |

### Organisations

| # | Element | Reason |
|---|---|---|
| R-19 | Lede naming `data/orgs.json`, `scripts/replace-placeholder-orgs.mjs`, `docs/ORG-IMPORT.md` | Developer instructions on an operator screen. Move to `docs/ORG-IMPORT.md` only |
| R-20 | "All orgs" sub-heading | Repeats the H1 |
| R-21 | "14 people →" at the row's end | Repeats "sent 14" in the same row; the whole row is the link |
| R-22 | Org status pill (`open` / `approved` / `submitted` / `closed`) | Belongs to the retired invite-link flow (ADR-019) and quotas were abolished (ACC-140g). "Open" in green and "Approved" in gold reads as a ranking that no longer means anything |

### Passes

| # | Element | Reason |
|---|---|---|
| R-23 | The grid of every full ticket | 612 full tickets with 612 QR codes in one scrolling grid, no search and no filter. The job here is "who has not got their pass yet", which is a list. The ticket opens in a sheet from a row (§5 F-07) |
| R-24 | "Print N passes" as the primary button | Passes go out on WhatsApp (ADR-019); a 612-page print is not a desk task. Print stays on the single-pass sheet. **Confirm with Vipin** |
| R-25 | Lede "Print and cut, or forward the per-person link. Zones are printed so the desk never has to look up…" | Describes the retired paper workflow |
| R-26 | "WhatsApp is not configured yet" as a line under the heading | Becomes the Send button's own disabled state and a one-line banner, not both |

### Users

| # | Element | Reason |
|---|---|---|
| R-27 | "Cannot change your own status" on your own row | "(you)" already says it; omit the button instead |
| R-28 | "…then sign in at /desk/login" | A URL path in copy |
| R-29 | "Desk operations" tag | See R-05 |

### Gate and vehicle

| # | Element | Reason |
|---|---|---|
| R-30 | H1 "Three outcomes. No fourth." and its lede | 370px of a 844px phone before the viewfinder; the issuer has seen it a thousand times by midnight. The verdict card below the fold is the cost (F-01) |
| R-31 | "Crew check-in" tag | Assumes crew; the gate checks all eight tiers |
| R-32 | Two sync indicators: "Online \| 3 queued" in the card meta and "Not synced yet" from `SyncStatus` | They can disagree on one screen ("Online" and "not synced yet"). One sync line |
| R-33 | "6 issued today" and "Ledger append-only" footer inside the scan card | The first repeats the status bar, the second is an implementation note |
| R-34 | Idle card "Waiting for a scan / Ready / Hold the pass code inside the frame. Works with the radio off." | Repeats "Point at the pass code" 400px above it |

### Code with no visible effect (remove while the primitives are built)

| # | What | Where |
|---|---|---|
| R-35 | Dead CSS from the retired queue: `.selbar`, `.ck`, `.sw`/`.toggle`, `.pick`, `.qrow`, `.void`, `.plist`, `.btn.gold` | `app/v2.css` |
| R-36 | Dead icons `caret-down`, `plus`; dead token `--z-nav` | `components/icon.tsx`, `app/phosphor.css:43,49`, `globals.css:49` |
| R-37 | Duplicate `s-rise-in` keyframes; duplicate `:focus-visible` rule | `motion.css` vs `v2.css:355-358`; `globals.css:62` vs `v2.css:9` |
| R-38 | Legacy 3-type `TYPES` palette still driving `zoneChips()` and `gateBandCard()` | `lib/design.ts` — one tier palette (`TIERS`) |
| R-39 | ~10 hard-coded dark-theme fallbacks in `var(--ink2, rgba(...))` | 7 files (inventory §9) |

---

## 3. Motion plan

**Rule:** motion appears only when something changed state, to confirm an action, or to
show where something came from or went. Nothing loops except the approved pass glare
(ADR-025: it marks a live pass, which is the point). Every entry has a reduced-motion
form that keeps the state change and drops the movement. Library: `motion/react`
(precached on the gate, no runtime network). One timing scale (Phase 2 tokens):
`instant 100ms · quick 160ms · base 220ms · slow 320ms`; easings `out` =
`cubic-bezier(.16,1,.3,1)`, `in-out` = `cubic-bezier(.65,0,.35,1)`, and one spring
(`stiffness 420, damping 36`) for things that move with a finger.

### Keep, add or change

| Where | Motion | Reason (one sentence) |
|---|---|---|
| Nav pill (desk, gate) | Active pill slides to the new item, `base`, spring | Shows where you went from where you were, which is the one thing a nav change should say. (Exists; move to `motion` layout and delete the `sessionStorage` pip hack) |
| Buttons — hover | Fill wipes in from the left over `quick` on outline buttons; solid buttons lift 1px and brighten 6% | A hover that changes the button's material tells a mouse user it will act, without moving the layout |
| Buttons — press | Scale to .97 over `instant`, spring back | Confirms the tap landed before the network answers, which matters most on a slow gate |
| Rows (Master, Orgs, Users, Passes list) — hover | Row tints to the raised surface and the row's tier swatch grows 1.3×, `quick` | Tells the operator which row the click will open and draws the eye to its tier, without a decorative side stripe |
| Clickable cards (Control room stats, tier cards) — hover | Spotlight border that follows the pointer (React Bits **SpotlightCard**), `quick` fade in and out | Marks the card as a link and matches the pass ticket's light; static cards get no hover so hover means "clickable" |
| Links with arrows | Arrow nudges 3px right, `quick` | The arrow is the affordance, so it is the thing that moves |
| Control room numbers | Count up from 0 on the **first** load of a session only (React Bits **CountUp**), `slow`×2 | Shows the numbers are live and fresh; later refreshes change silently so a glance never waits |
| Skeletons | Shaped like the widget they stand in for (below); one shimmer sweep every 1.6s, cross-fade to content over `quick` with no size change | The page's layout is readable before the data arrives, and nothing jumps when it does |
| Filter chips | A chip scales in from .9 over `quick` when added, collapses its width when removed; the result count ticks | Shows the filter was applied and what it did to the count, in the place the eye already is |
| List reflow after a filter | Rows that stay slide to their new position (`layout`, `base`); rows that leave fade | The operator keeps track of a row they were watching instead of re-reading the list |
| Sheet (row detail, pass preview) | From the right on desktop, from the bottom on the phone, spring; backdrop fades `base`; drag down to close on touch | Shows the detail belongs to the row it came from, and the gesture is the one a phone user expects |
| Toast | Rises 12px and fades in over `base`; leaves over `quick`; pauses while hovered | Confirms a send or copy without taking focus |
| Inline confirm | Cross-fade between the button and the confirm pair, `quick` | Shows the button became a question rather than disappearing |
| WhatsApp send status | Pill colour and label morph (queued → sent → delivered), `base` | The state change is the information; a morph makes it noticed |
| Gate verdict | Result panel floods green/amber/red over `quick`; the verdict word arrives with **no delay** (today: 120ms delay + 800ms blur-in, `v2.css:517`); amber pulses once; red shakes once (exists); `navigator.vibrate` 1 / 2 / 1 long | The issuer has three seconds; colour and haptics answer before reading does |
| Gate result mark | React Bits-style status mark: tick, bang or cross drawn over `base` | A shape that can be read at arm's length and by colour-blind issuers, beside the colour |
| "Issue band" on an **amber** (reissue) result only | Hold to confirm, 700ms ring (React Bits **HoldButton** pattern) | A deliberate gesture for the one action that creates a double issue; the green path stays a single tap, because a hold on every one of 612 people costs minutes at the gate |
| Sync line | Queued count animates down as the outbox drains; one tick when it reaches zero | The issuer can see the radio came back without reading a timestamp |
| Theme switch | Colours cross-fade over `base` (View Transitions where supported) | Avoids a white flash in a dark tent |
| Sign-in, pass | As approved in ADR-025 / ADR-026 | Unchanged |

### Remove

| Where | Why |
|---|---|
| `drift` 26s infinite on the Control room poster (`v2.css:193`) | Decorative loop; it moves the only image behind the most important number |
| Scroll-reveal `.rv` stagger on Master list, Passes, Gate (`master-screen.tsx:95-115`, `gate/page.tsx`) | Delays content on work screens; Master holds a 1100ms `visualReady` timer |
| `.stag` 120ms delay + 800ms blur-in on the gate verdict (`v2.css:517`) | The verdict is the product; it must be instant |
| Viewfinder `sweep` running while the camera is off (`v2.css:469`) | A scanning animation over a camera that is not scanning says the wrong thing; run it only while the camera is live |
| `ping` on the status "live" dot (`v2.css:114`) | Dead since ACC-130 removed the pip; delete |

### Skeletons, per widget (your note, 28 Sep)

The shared `Skeleton` primitive takes a **shape**, not a width. Each widget ships its own
skeleton built from the same boxes as the real thing, so the swap is a cross-fade with
zero layout shift.

| Widget | Skeleton |
|---|---|
| Stat card | Caption bar (60px), number block at the display size (2 digits wide), meter track |
| Hero | Poster already painted (static asset), headline block 2 lines, date line |
| Tier card | Band strip in the tier's colour at 20% (the colour is known before the data), title bar, count block |
| Master list row | Name bar + org/phone bar, tier dot + label, serial, plate, BMS pill outline, date — each at its column's real width |
| Filter bar | Search field outline, chip outlines at real widths |
| Org / user row | Name bar, meta bar, action pill outline |
| Pass row / pass sheet | Row: as Master. Sheet: band strip, name block, zone dots, QR square with a 1px border |
| Gate result | The idle panel itself (it is never loading; the cache is local) |
| Operator avatar | Empty circle, no initials (R-07) |

---

## 4. Master list filters

### 4.1 Every field that can be filtered

| Filter | Values | Source today | Needs |
|---|---|---|---|
| **Search** | name, phone, company, plate, band serial, pass ref | `?q=` → API (`app/api/desk/master/route.ts`) | exists |
| **Organisation** | one or more orgs | `?org=` → API, exact id (ADR-021) | exists (single); multi-select is UI only |
| **Tier** | the 8 tiers in `TIERS` (AAA, Artist, Stage, Promoters, Crew, Photo, Eddie's, GA) | `typeCode` on every row | UI only |
| **Status** | Approved · Collected · Not collected · Voided · Rejected | `status` + `collectedAt` on every row ("Collected" is a band in the ledger, not a person status) | UI only |
| **BMS** | Entered · Pending | `?in_bms=` → API | exists |
| **Vehicle** | Has vehicle · Sticker issued · Sticker pending · No vehicle | `vehicleReg`, `stickerNo` on every row | UI only |
| **Days valid** | Build · Show · Build + show | `boa_acc_person.day_validity` | API must return `day_validity` (already granted to `authenticated`, `lock_down_privileges.sql:106`); no grant change |
| **Role** | free text from the form ("Rigger", "FOH engineer") | `boa_acc_person.role_text` | API must return `role_text` (already granted); filter by search, and as a chip with the top 12 roles |

The API reads every person on each call already (`route.ts:84-98`), so everything past
`org`, `in_bms` and `q` is filtered client-side over the returned rows. At 612 rows that
is instant. Every filter is mirrored in the URL (`?org=a,b&tier=crew&status=collected…`)
so a filtered list can be shared, reloaded and exported, and **Export CSV exports exactly
what is on screen** (today it already honours `q`, `in_bms`, `org`).

### 4.2 The filter bar

- One row: search field, then an **Add filter** button that opens a menu of the eight
  filters above. On phones the menu is a bottom sheet.
- Each active filter is a **chip**: `Organisation: Chakra Sound & Light ×`,
  `Tier: Crew, Stage ×`, `BMS: Pending ×`. The × removes only that filter. Clicking the
  chip body re-opens its picker.
- **Clear all** appears after the chips when two or more are active.
- The count sits beside the chips: **"14 of 612"**.
- Preset chips live in the empty filter bar as suggestions: *Not in BMS (14)*,
  *Not collected (428)*, *Has vehicle (52)*. The chrome's "14 not in BMS" link (R-03)
  becomes the first preset.
- Arriving from Organisations adds an ordinary organisation chip with its ×. Nothing about
  that chip is special.

### 4.3 The "org filter cannot be cleared" bug

**Not reproduced on this build with fixtures.** The walkthrough
([`orgfilter-*.png`](ux-audit/screens-r2/), `org-filter-walkthrough.json`) went
Organisations → row → `/desk/master?org=<id>` ("Showing Chakra Sound & Light only"), and
both "Show everyone" (`master-screen.tsx:174`) and the Master list nav link
(`desk-chrome.tsx:255`, bare `href`) cleared it. What the walkthrough *did* find:

1. **There is no way to clear one filter.** With `?org=` and `?in_bms=` both set,
   `masterFilterSummary()` (`lib/format.ts:80-126`) renders one sentence and one "Show
   everyone" that clears both. An operator who wants "this org, everyone" must clear
   both and start again.
2. **The way out is not where the filter is.** The org filter is stated as a sentence in
   11px mono caps, and the only control is a pill 200px to the right that says "Show
   everyone", which does not read as "remove this filter". On a phone
   (`orgfilter-1-filtered-mobile-dark.png`) the sentence, the count and the button wrap
   onto three lines.
3. **The status-bar "not in BMS" link adds a filter from every screen**, so an operator
   can arrive filtered without having chosen to.

If you hit a case where no control cleared it, the likely paths are (a) the deployed
build predating ACC-154 (25 Sep), or (b) an org with no people, where the banner reads
"No one from this organisation yet". **Tell me the steps and I'll reproduce it before
Phase 3.** The chip design in §4.2 removes the whole class of problem either way:
every filter is a chip, and every chip has its own ×.

---

## 5. Findings

Severity is judged against the dates: **Critical** = wrong behaviour at the gate or wrong
information to a pass holder or the desk; **High** = hurts a core job or trust;
**Medium** = friction with a workaround; **Low** = polish.
Effort: **S** < half a day, **M** ≤ 2 days, **L** > 2 days.

| ID | Screen | Issue | Why it matters | Sev | Eff | Fix |
|---|---|---|---|---|---|---|
| F-01 | `/gate` 390 | The result panel (verdict, person, band, **Issue** button) renders **below the fold**: it starts ~y=1180 on an 844px phone (`gate-mobile-dark.png`). Nothing scrolls it into view after a scan (`app/gate/page.tsx` has no `scrollIntoView`) | The issuer scans and sees no answer without scrolling, every single time. This is the core three-second job | Critical | M | On the phone, the result replaces the viewfinder in place (one panel, two states); on desktop keep the split. Layout only — Dexie reads and outbox writes untouched |
| F-02 | `/desk` | Hero headline "29 waiting on a decision" names a task the app cannot do (approval is in the sheet, ADR-019) | The biggest words on the desk point at the wrong job | High | S | Hero = the number the desk works: "428 not collected" before gate live, "14 not in BMS" when that is non-zero; each links to the preset filter |
| F-03 | `/gate`, `/gate/vehicle` | `bmsPending={14}` is a hardcoded literal (known since ACC-165) | A number shown as fact that is not computed | High | S | Remove from the gate (R-06); on the desk it comes from the dashboard |
| F-04 | `/desk/master` | No visible column headers (ADR-023 deferred them to protect `test:visual`) | Eight columns of mono text with no labels; "#0412" vs "KA 05 MJ 8871" vs a date must be inferred | High | S | Sticky header row. The v2 contract is being superseded, so ADR-023's reason falls away |
| F-05 | `/desk/master` 390 | Tier, BMS and collected columns are hidden at 390; only name and band serial remain (`desk-master-mobile-dark.png`) | A lead checking on a phone at the venue cannot see the two things they check | Medium | M | Phone row: name + tier dot on line 1, org · BMS pill · collected on line 2 |
| F-06 | `/desk/master` | Filters limited to search, one org, and BMS via URL; no chips, no clear-one (§4.3) | The org filter reads as stuck; the list can't answer "crew, not collected, has vehicle" | High | M | §4.2 |
| F-07 | `/desk/passes` | Every approved person renders as a full ticket with a live QR in one grid; no search, filter or paging | At 612 people this is thousands of pixels of QR codes; finding one person's send status is a scroll hunt | High | M | A list (name, tier, send status, last sent) with the same filter bar as Master; row opens the ticket in a Sheet with Send / Resend / One-tap |
| F-08 | `/desk/passes` | "Send all unsent" is a bulk outward action (ACC-160 is open) | 612 WhatsApp messages from one click; the count sits in a tiny pill | High | S | Count in the label ("Send 43 unsent passes"), confirm sheet listing the first 5 names, then hold-to-send |
| F-09 | `/desk/orgs` | Response is cast, not Zod-parsed (`orgs-screen.tsx`: `as { orgs: … }`); a malformed 200 throws `orgs.length` and lands on `app/error.tsx` (`error-boundary-*.png`) | Non-negotiable #8; a bad payload takes the whole screen down instead of showing an inline error | High | S | `orgRowWithCountsSchema.array().safeParse` like every sibling |
| F-10 | 404 (`/nope`) | CSP errors in the console: `/_not-found` is prerendered with a build-time nonce that never matches `middleware.ts`'s per-request nonce | Scripts on the 404 are blocked; today it renders, but any interactive element added there (the help link) would not run | Medium | S | Make the not-found route dynamic, or exempt it from the nonce |
| F-11 | Chrome | Avatar 38×38 and status Retry 30px under 44px (inventory §1) | The avatar is the only way to sign out or switch theme at the gate | Medium | S | 44px hit area; visual can stay 38 |
| F-12 | Chrome | Avatar shows "VI" for everyone while loading (R-07) | Every operator briefly sees someone else's initials | Low | S | Empty circle skeleton |
| F-13 | All screens | Light theme ignores the OS setting and isn't persisted; `data-theme="dark"` is static (`layout.tsx:88`) | An issuer who chose light in sunlight gets dark again on every load | Medium | S | Follow `prefers-color-scheme` by default; the menu choice persists in `localStorage` (a per-device convenience, not state) |
| F-14 | Light theme | `--ink3` on `--bg` is **3.3:1** (`globals.css:32`); it is the colour of every mono caption, meta line and "Not collected" | Fails WCAG 1.4.3 for 11px text; outdoors it disappears | High | S | Light `--ink3` to `rgba(20,20,26,.64)` (≥4.6:1) in the new token set |
| F-15 | All | Captions at 10–11px uppercase mono with .12em tracking are the main secondary text everywhere | Small caps mono is slow to read and, in light mode, fails contrast (F-14) | Medium | M | One caption size (12px) in the type scale; sentence-case meta lines where the text is data, not a label |
| F-16 | `/desk` | Tier cards show refused zones struck through; the pass shows held zones only (R-10) | Two rules for the same fact across two surfaces | Medium | S | Held zones only, in zone-map colours, as on the pass |
| F-17 | `/desk/orgs` | Row status pill "open/approved" and "14 people →" (R-21, R-22) | Legacy states read as meaningful | Low | S | Remove |
| F-18 | `/desk/orgs` | Content column is 980px centred; every other desk screen is full-width 1440 | The desk changes width between tabs | Low | S | One content width for list screens |
| F-19 | `/desk/users` | Role `<select>` uses OS chrome; the one custom select in CSS is dead | The only select in the app looks foreign | Low | S | `Select` primitive |
| F-20 | `/desk/users` | Operators list shows no email and role cannot be changed; deactivate is the only action | An admin who invited the wrong role must deactivate and re-invite | Medium | M | Row opens a Sheet: email, role (change), active. Needs an RPC — **out of scope unless you want it** |
| F-21 | `/gate` | Two sync indicators that can disagree (R-32) | "Online" and "Not synced yet" on one card; the one signal an offline-first gate must get right | High | S | One sync line: `Synced 2 min ago · 3 waiting` / `Offline · 3 waiting` |
| F-22 | `/gate` | Verdict animates in after a 120ms delay over 800ms with a blur (`v2.css:517`) | The answer is on screen ~0.9s later than it could be | Medium | S | §3 |
| F-23 | `/gate` | Hardware-scanner input is `sr-only` with `tabIndex={-1}`; focus returns to it after each person, but a screen reader announces "Pass-code input for hardware scanner" with no instruction | Minor for a sighted issuer, confusing for anyone else | Low | S | `aria-describedby` with one sentence |
| F-24 | `/gate/vehicle` | Round-1 UX-13/14/15 (CTA overflow at 390, sync label on the card border, 38px menu) | Checked: no horizontal overflow now; the 38px avatar remains (F-11) | Low | S | F-11 |
| F-25 | Every desk screen | Tag pill + H1 + nav highlight (R-05) and developer ledes (R-15, R-19, R-25) | The first 400px of every screen restates where you are | Medium | S | H1 only, with one line of operator copy where it adds something |
| F-26 | `/desk` | Poster `drift` loop and scroll-reveal stagger (§3) | Decorative motion on a work surface | Low | S | §3 |
| F-27 | All | Hover states are colour-only at 120ms linear (`hover.css:51`); no press state except the vehicle toggle | Buttons and rows feel inert; nothing confirms a press on a slow network | Medium | S | §3 hover and press |
| F-28 | All | Skeletons are width-only bars (`LoadingSkeleton width="42%"`); the Control room skeleton is a set of pills, not cards | The layout jumps when data lands; skeletons don't say what is coming | Medium | M | §3 per-widget skeletons |
| F-29 | All | No spacing scale; three surface systems; four palettes (§1) | Every screen re-decides; drift is structural | High | M | Phase 2 token set and primitives |
| F-30 | `/desk/*` signed out | 4–5 API calls 401 before the client redirects (round-1 UX-12, still true) | A flash of chrome on every expired session | Low | M | Server-side session check in the desk layout |
| F-31 | Crawl | The app ignores `prefers-color-scheme` (the finding behind F-13) | — | — | — | — |
| F-32 | `/desk` 390 | Mobile menu is a full-screen overlay listing six items including Gate and Vehicle for a desk lead | Fine as is; noted because the gate items could be grouped | Low | S | Group "Desk" and "Gate" in the menu |
| F-33 | Error page | `app/error.tsx` shows a red tag via inline style (inventory §4) and offers only "Try again" | No way back to a working screen or to help | Low | S | Primary "Try again", secondary "Back to Control room", help line from the footer |
| F-35 | `/desk` 390, menu open | The phone menu's backdrop is translucent: "29 waiting on a decision" and the green gate button show through "Organisations", "Gate" and "Vehicle" (`desk-mobile-menu-open-mobile-dark.png`) | Two layers of large text on top of each other on the one control that moves you around | High | S | Opaque sheet (`--bg` at 96% + blur) above all page content |
| F-36 | 404, error, invalid pass, voided pass | Centred card on flat black: no logo, no footer, no action. The generic 404 (`/nope`) says "This link is not valid", which is the pass wording, for any mistyped desk address (`404-desktop-dark.png`) | A pass holder with a bad link and an operator with a bad URL both hit a dead end; round-1 UX-19 is still open | High | S | Poster backdrop like sign-in, the footer, and two actions: "Message the accreditation desk" (ACC-173) and, for staff, "Go to sign in". Separate copy for a bad pass link vs a missing page |
| F-37 | `/desk` 390 | The Control room is 5,392px tall on a phone: eight tier cards stacked, each with six zone chips | The screen a lead opens on a phone at the venue is mostly scrolling | Medium | S | Tier cards become a compact two-column list on phones (band colour, name, issued / printed) |
| F-34 | Copy | "One-tap", "AAA override", "BMS" (never expanded on screen), "Stamp from the named list" | Jargon a new issuer or desk volunteer has to be told | Low | S | "WhatsApp link", "AAA named list", first use "BookMyShow (BMS)" in the Control room card |

---

## 6. Heuristic scores and critique

Method: dual-agent `/impeccable critique` — Assessment A (design review of the 101
screenshots and source, isolated) and Assessment B (the `impeccable detect` scan, one
finding). A's two new claims were checked against the screenshots before being added
(F-35, F-36).

### Nielsen's heuristics — 26/40 (Acceptable, top of the band)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Counts and offline state are shown; two sync indicators disagree (F-21); no "as of" on any count |
| 2 | Match with the real world | 3 | Zone, tier and band language is the festival's own; Organisations speaks to the developer (R-19), the gate says "token" |
| 3 | User control and freedom | 2 | 404, error and invalid-pass are dead ends (F-36); one filter can't be cleared without the other (§4.3) |
| 4 | Consistency and standards | 3 | Strong across desk, gate, pass and sign-in; the cold screens look like another product; three surface systems (§1) |
| 5 | Error prevention | 3 | Disabled CTAs until the plate is valid; append-only ledger in the DB; but "Send all unsent" is one click (F-08) and Orgs trusts an unparsed payload (F-09) |
| 6 | Recognition over recall | 3 | Colour-coded tiers and zones; no column headers on Master (F-04); phone rows drop tier and BMS (F-05) |
| 7 | Flexibility and efficiency | 2 | 612 rows, one search box, no filters, no sort (F-06) |
| 8 | Aesthetic and minimalist design | 3 | Distinctive and restrained where it counts; every screen opens with tag + H1 + developer lede (F-25) |
| 9 | Error recovery | 2 | "Retry" with no next step; no way to tell a connection problem from a system one |
| 10 | Help and documentation | 2 | "Ask the accreditation desk" is plain text (ACC-173) and absent from the cold screens |
| | **Total** | **26/40** | |

### Design specificity

**Authored for this product.** The poster, the eight woven bands, the zone-map colours,
the ticket and the festival's own vocabulary cannot be pasted into another app. The seam
is the cold screens (404, error, invalid and voided pass): a centred card on flat black,
no logo, no footer, no way out — they read as a different, unbranded product behind the
same URL. The desk screens sit between the two: branded, but dressed in the v2 bezel
cards the approved pass and sign-in have already moved past.

### Cognitive load

Fails: **progressive disclosure** on Master (no way to narrow 612 rows except knowing a
name); **one thing at a time** on the phone menu (F-35); **≤4 options** in the desk nav
(six items plus the operator menu — acceptable for a lead who uses it daily). Holds:
grouping and hierarchy on the Control room and the pass; working memory on the pass
(zones, tier and vehicle are all printed).

### Emotional journey

- **Gate issuer at night:** "Ready" and an honest "Offline" are reassuring. The valley is
  the moment after a scan: on a phone the answer is below the fold (F-01), and after a
  queued write the sync state reads like a stray label, not a status (F-21).
- **Pass holder:** opening the ticket over the poster is the peak of the whole product.
  The valley is a bad link — calm, but nothing to do (F-36).
- **Bhoopesh at the desk:** the Control room tells him where he stands; the Organisations
  page then talks to him about scripts (R-19), and a 500 offers only "Retry".

### Persona red flags

- **Alex (Bhoopesh, 612 rows):** no filter, sort or saved view on the screen he lives in;
  CSV export is the only way to work with a subset.
- **Sam (keyboard, screen reader):** focus return and Escape exist on both menus (seen
  in source); the phone menu's see-through backdrop (F-35) and the gate verdict's polite
  live region (A-05) are the gaps. Not tested with a real screen reader.
- **Casey (one hand, at the gate):** verdict below the fold (F-01); 38px avatar (F-11);
  sync line ambiguous (F-21).

### Provocative questions

1. Master list is where Bhoopesh spends two weeks with 612 rows. Why does it have fewer
   controls than the Organisations page's single link?
2. The cold screens are what a stressed pass holder or a failing gate device hits under
   pressure. Why do they get the least design?
3. Is any copy in this app still written to the engineer who built it rather than the
   person running it? (Yes: R-15, R-19, R-25, R-33.)

---

## 7. Accessibility (WCAG 2.1 AA)

### Contrast, computed from the tokens

| Text | Foreground | Background | Ratio | Needs | Pass |
|---|---|---|---|---|---|
| Dark `--ink2` | `rgba(242,239,226,.72)` | `--bg #0A0A0A` | 9.0:1 | 4.5 | ✅ |
| Dark `--ink3` (captions) | `rgba(242,239,226,.52)` | `--panel #101012` | 5.1:1 | 4.5 | ✅ |
| Light `--ink2` | `rgba(20,20,26,.76)` | `--bg #EDEAE1` | 7.7:1 | 4.5 | ✅ |
| **Light `--ink3` (captions)** | `rgba(20,20,26,.50)` | `--bg #EDEAE1` | **3.3:1** | 4.5 | ❌ F-14 |
| Dark `--gold` | `#E3BB72` | `--panel` | 10.5:1 | 4.5 | ✅ |
| Dark `--bad` | `#FF6B5A` | `--panel` | 6.8:1 | 4.5 | ✅ |
| Light `--grn` / `--gold` / `--bad` on their tint | | | 6.1 / 7.0 / 6.3:1 | 4.5 | ✅ |
| Tier text, dark: Artist `#F0169A`, Promoters `#4371FF`, Crew `#A64DFF` | | `--panel` | 4.8 / 4.6 / 4.6:1 | 4.5 | ✅ (barely; fine at display size, tight at 11px) |

### Other findings

| # | Issue | WCAG | Sev | Fix |
|---|---|---|---|---|
| A-01 | Master list has no visible column headers (F-04); screen-reader headers exist (`sr-only` row) | 1.3.1 | Major | Visible sticky headers |
| A-02 | Avatar 38px, status Retry 30px (F-11) | 2.5.5 | Major | 44px |
| A-03 | Three focus-ring styles; `.plate-in` only on `:focus-visible` (inventory §2) | 2.4.7 | Minor | One focus ring token |
| A-04 | Tier and send status are colour + text (good); zone access on tier cards uses strikethrough, which a screen reader does not announce | 1.3.1, 1.4.1 | Minor | Held zones only (F-16) |
| A-05 | Gate verdict is `aria-live="polite"`; a red "Do not let them in" should be assertive | 4.1.3 | Minor | `assertive` for red |
| A-06 | Hardware-scanner input label without instruction (F-23) | 3.3.2 | Minor | `aria-describedby` |

**Not tested:** VoiceOver/NVDA, keyboard-only walkthrough of every flow, 200% zoom. Seen
in source: skip link, `aria-current` on nav, Escape closes menus with focus return,
`role="alert"` on errors, `aria-live` announcements on Orgs and Users. Those are good and
stay.

---

## 8. Copy (UX-copy pass)

| Where | Now | Proposed | Why |
|---|---|---|---|
| Control room hero | "29 waiting on a decision" | "428 not collected" (or "14 not in BMS") | The number the desk can act on (F-02) |
| Control room card | "AAA override · 4 still to stamp from the named list" | "AAA named list · 4 still to enter" | Say what the list is, not the mechanism |
| Master list H1 | "Everyone accredited" | "Master list" | Match the nav; the old H1 is untrue while rows include rejected and voided people |
| Master list empty | "Nobody matches that. Try a phone number or a band serial." | "No one matches "Ranj". Try a phone number or band serial." | Echo the query |
| Orgs H1 lede | developer instructions | "Every company sending people. Open one to see them in the Master list." | R-19 |
| Passes H1 | "Pass sheet" | "Passes" | Match the nav |
| Passes send | "Send all unsent 43" | "Send 43 unsent passes" | Count in the label (F-08) |
| Passes row link | "One-tap" | "WhatsApp link" | Says what it is |
| Users hint | "…then sign in at /desk/login" | "They get an email to set a password." | R-28 |
| Gate H1 | "Three outcomes. No fourth." | (none; the gate name and operator sit in the header strip) | R-30 |
| Gate idle | "Point at the pass code" + "Ready / Hold the pass code inside the frame…" | "Scan a pass" (once) | R-34 |
| Gate green | "Not yet collected · issue a band" | "Hand over a Crew band" (tier from data) | The action and the object |
| Gate amber | "A band was already issued to this person" | "Already has a band · 09 Oct 14:02, Gate 1" | Give the when and where the issuer needs to decide |
| Gate red | "Unknown, rejected or voided token" | "Not on the list. Do not let them in." | "Token" is our word, not theirs |
| Error page | "Something went wrong" + Try again | "This screen didn't load. Try again, or go back to the Control room." | Where to go next |

---

## 9. Decisions taken on this audit (Vipin, 28 Sep)

- **Passes:** bulk print is dropped (R-24 accepted). Print stays on the single-pass
  sheet; the primary action is "Send N unsent passes".
- **Gate on a phone:** the result replaces the viewfinder in place, one panel with two
  states (F-01). Layout only; Dexie reads and outbox writes untouched.
- **Users:** role change is in scope (F-20). A row opens a sheet with email, role
  (changeable) and active. Needs a new RPC with RLS and pgTAP tests.

## 10. What this means for Phase 2

1. One token set replaces the three surface systems, four palettes, >45 font sizes and
   >45 paddings (§1). The approved pass, sign-in and footer set its values.
2. Twelve primitives (Button, Field, Select, Chip, FilterBar, StatusPill, Card, Sheet,
   Table, EmptyState, Skeleton, Toast) replace the 14 button combinations, 6 input styles
   and 5 chip families, and remove R-35 to R-39 on the way.
3. The screens change shape where the audit says the job is different: Control room
   (hero number the desk acts on), Master list (filters, headers), Passes (list + sheet),
   Gate (result in place of the viewfinder on phones).
4. Motion per §3, hover and press everywhere, per-widget skeletons.
