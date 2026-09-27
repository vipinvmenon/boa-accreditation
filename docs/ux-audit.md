# UX audit — BOA Accreditation

_27 Sep 2026. Review only — no source changed. Gate live 4 Oct, show 10 Oct: 13 days out._

- **App:** festival accreditation for Bangalore Open Air — import/approve crew, mint a
  pass, deliver it on WhatsApp, check people and vehicles in at the gate offline.
- **Users:** desk leads/admins (laptop, calm); up to 10 gate issuers (phone, outdoors,
  night, fast, radio possibly off); pass holders (phone, one screen, once or twice).
- **Core jobs:** (1) approve and deliver passes, (2) check a person in and hand over the
  right band, (3) check a vehicle in, (4) as a pass holder, show a pass that a steward
  trusts in two seconds.
- **Stage:** late beta, about to go live.

## How this was reviewed — and what was not

- Routes mapped from source. Every route opened in Chromium via Playwright at
  1440×900 and 390×844 (with dark and light schemes), plus error, focus, slow-network
  and offline variants. 33 screenshots are in [`ux-audit/screens/`](ux-audit/screens/).
- **Not reviewed live: every authenticated desk screen** (`/desk`, `/desk/master`,
  `/desk/orgs`, `/desk/passes`, `/desk/users`) and the signed-in `/gate` scan flow.
  The repo has no local test operator; the only auth user is a real account on the
  linked Supabase project, and it was not touched. The `desk-*.png` and `gate-*.png`
  files show the **login redirect**, not those screens. This is exactly what
  ACC-090a (the `qa-visual` operator, blocked on a human) exists to fix — until it is
  done, no agent can audit or visually regression-test the desk. Findings about those
  screens below come from source, and are marked **(source)**.
- ⚠️ `ux-audit/screens/pass-valid-*.png` show a **real person's name and a live,
  scannable pass QR**. Do not commit them. Delete them, or re-shoot against a voided
  or fixture pass.

---

## 1. Executive summary — the five issues that hurt most

1. **The pass does not look like the band.** The pass (`/p/[token]`) is the single screen
   every accredited person opens, and it is what a steward checks. Its tier is shown as a
   small green-tinted box saying "AAA / GREEN BAND". The real, printed, woven artwork —
   the thing security is trained on from the zone sheets — appears nowhere: not on the
   pass, not in the WhatsApp message, not at the gate. Stewards match pictures, not
   words. **This is the biggest single upgrade available.**
2. **`/gate/vehicle` has no sign-in guard.** `/gate` checks the session and redirects;
   `vehicle-screen.tsx` never calls `checkGateSession()`, and `middleware.ts` only sets
   the CSP. An unauthenticated phone gets the full vehicle check-in UI, including a
   header count ("0 / 0 bands issued · 14 not in BMS") — work out where that 14 came
   from without a session. Writes still fail at the database (non-negotiable #3 holds),
   but an issuer whose session expired sees a working-looking screen that silently
   logs nothing. That is worse than a login wall.
3. **Sign-in looks like a template, not like BOA.** A rounded card floats in an empty
   black viewport, with a mint glow blob, a mint pill tag and a mint pill button. It is
   the most generic screen in the app, and it is every operator's first impression —
   and the screen they land on again whenever a session expires at the gate.
4. **Copy assumes everyone is crew.** The WhatsApp body says "your … *crew* accreditation
   is approved". The pass says "Show this at the *crew* check-in desk". The same pass is
   sent to AAA, Stage, Photo and Promoters holders; the screenshot shows an "Artist
   Hospitality" person on an AAA pass being told to go to the crew desk.
5. **Two greens, and a footer that isn't one.** The UI accent is mint `#00F5A5` and the
   AAA band is `#39E639`; on the pass they sit a few pixels apart and read as a mistake.
   The shared "footer" is two lines of internal policy ("Artists handled at the hotel").
   It is missing from the login, the pass, the 404 and the error pages, and it gives
   nobody a way to get help.

---

## 2. Findings

Severity is judged against the show date: **Critical** = wrong behaviour at the gate or
wrong information to a pass holder; **High** = hurts a core job or trust.

| ID | Screen / flow | Issue | Why it matters | Sev | Eff | Suggested fix |
|---|---|---|---|---|---|---|
| UX-01 | `/p/[token]` | Tier shown as a tinted text box ("AAA / GREEN BAND"); no band artwork | Stewards verify by matching the picture on the zone sheet to the band and the phone. Text-in-a-box is slower and forgeable with a screenshot edit | Critical | M | Render the tier's actual band master as a full-width strip at the top of the card (and as the card's backdrop at low opacity). Keep the tier name as text and alt text. See §5 B1 |
| UX-02 | `/gate/vehicle` | No session guard; renders fully signed-out; writes 401 silently | An expired issuer keeps "logging" vehicles that never reach the ledger | Critical | S | Reuse `/gate`'s `checkGateSession()` → `loginHref()` pattern. Better: guard `/gate/*` and `/desk/*` server-side in one place |
| UX-03 | `/gate/vehicle` header | "14 not in BMS" visible with no session | Either data reaching an unauthenticated client, or a stale or default number shown as fact. Both are wrong | High | S | Trace the source. If it is from an API, it must 401; if cached, label it with its age |
| UX-04 | WhatsApp template | Body hardcodes "crew accreditation"; no header media | Wrong for 5 of the 6 issued tiers; the message is plain text that looks like any phishing "tap to open" | High | M | New template with an IMAGE header (per-tier card, §5 B2). Body: "{{1}}, your Bangalore Open Air pass is approved — {{2}} band." Needs Meta re-approval — submit now, in parallel with ACC-151 billing |
| UX-05 | `/p/[token]` copy | "Show this at the crew check-in desk" for every tier | Sends AAA/Stage/Photo holders to the wrong desk | High | S | Drive the desk line from the tier (or one neutral "Show this at the accreditation desk") |
| UX-06 | `/desk/login` | Generic centred card, glow blob, mint pills; no imagery, no footer | Reads as a SaaS starter. The rest of the product has a strong identity | High | M | Redesign — §5 B3 |
| UX-07 | `/desk/login` | Three labels say the same thing: "ACCRED / DESK" wordmark, "BOA ACCREDITATION" pill, "DESK SIGN IN" H1. The logo renders ~44px wide and is illegible | Noise on the one screen with a single job | Medium | S | Keep the BOA logo at a legible size plus one H1. Drop the pill and the micro-wordmark |
| UX-08 | `/desk/login` | "Minimum 8 characters." shown on **sign-in** before any input | That's a set-password rule. On sign-in it implies the user is doing something wrong | Low | S | Show it only in the set-password and reset modes |
| UX-09 | `/desk/login` | Empty submit fires the native "Please fill out this field." tooltip; real errors use the app's inline red style | Two error languages on one form | Low | S | `noValidate` on the form; validate with the existing Zod schema into the same `role="alert"` slot |
| UX-10 | `/desk/login` | Always dark. Ignores OS scheme and the gate's own light/dark toggle | An issuer who picked light theme at the gate (sunlight) is thrown into dark mode on every re-login | Medium | S | Read the same theme source the chrome uses (`useDomTheme`) |
| UX-11 | Session expiry at the gate | Re-login goes to a desk-styled page | The issuer is mid-queue at night. The login should look like the gate, keep `next`, and be one thumb-reach form | Medium | S | Gate-flavoured login variant (the H1 already switches to "Check-in sign in" — go further: gate chrome, large inputs) |
| UX-12 | `/desk/*` signed-out | 4–5 client API calls 401 before the redirect; `/gate` does 2 | A flash of chrome, console noise, wasted round trips on a weak link | Low | S | Redirect before render (server-side session check in the desk layout) |
| UX-13 | `/gate/vehicle` mobile 390 | "LOG ENTRY AND OPEN GATE" type overflows its button; the arrow disc is clipped at the card's right edge | The primary action on the security phone looks broken | High | S | Reduce the label size at <420px or wrap to two lines; keep the arrow inside the padding box |
| UX-14 | `/gate/vehicle` mobile | "NOT SYNCED YET" sits on the card's bottom border | Sync state is the one thing an offline-first gate must show clearly; here it looks like a rendering bug | Medium | S | Move sync state into a proper status row (and into the footer — see UX-18) |
| UX-15 | `/gate/vehicle` header | Overflow "··" button is 38×38px | Below the 44px minimum on a gloved, night-time, one-handed screen | Medium | S | 44×44 minimum hit area (the visual can stay small) |
| UX-16 | Pass colours | UI mint `#00F5A5` next to AAA band green `#39E639` on the same card | Looks like a colour error; weakens trust in the tier colour, which *is* the credential | Medium | S | On the pass, suppress the mint accent entirely — the tier colour owns the page. Logo in off-white |
| UX-17 | `/p/[token]` zones | All six zone chips have equal weight; access is shown by strikethrough | A steward can't tell granted from refused at arm's length | High | S | Use the zone-sheet language security already knows: a coloured square per zone (Festival green, Photo Pit yellow, Main Stage orange, Backstage purple, Eddie's red, Promoters blue). Show granted zones only, with the "+ ID" / "after 10 PM" qualifiers as solid tags |
| UX-18 | Footer (all) | `SiteFooter` = two internal policy lines; absent on login, pass, 404, error | No help route, no event identity, no sync/version at the gate | High | S–M | Proper footer — §5 B4 |
| UX-19 | 404 / invalid pass | Correct copy, zero actions | A pass holder with a bad link has nowhere to go; the only exit is Back | Medium | S | Add "Message the accreditation desk" (a `wa.me` link to the desk number) + "Back to sign in" for staff |
| UX-20 | `/gate` first-ever offline | A never-primed device offline gets the browser's own network error page | If a device is swapped at the gate, the failure is unbranded and unexplained | Medium | M | Document "open `/gate` once online before your shift" in OPERATIONS.md; make the SW offline fallback page say that in BOA language |
| UX-21 | `/p/[token]` fine print | Small grey 13px text on near-black; the two paragraphs repeat rules | Contrast is marginal outdoors; nobody reads a second paragraph | Low | S | One line, ≥4.5:1: "Bring photo ID. One person, one pass, one band." |
| UX-22 | `/p/[token]` tab title | "Your pass" | When a holder has several tabs open it is indistinct; a screenshot with a title looks more official | Low | S | "BOA 2026 · Pass BOA26-1051" (ref, not name) |
| UX-23 | Buttons & inputs **(source)** | No `<Button>`/`<Field>` primitive: 18 ad-hoc `.btn` class combos; two input vocabularies (`utility-input` vs per-screen v2 classes) | This is where the inconsistencies you're seeing come from — every screen re-decides radius, height and weight | Medium | M | Two primitives, `Button` (variant, size, full-width) and `Field` (label, hint, error), both mapping to the existing v2 classes. No visual change on day one — they only stop the drift |
| UX-24 | Loading **(source)** | No `loading.tsx` on any route; each screen hand-rolls a skeleton | A slow segment on 3G shows nothing until the client component mounts | Low | S | `loading.tsx` in `app/desk/` and `app/gate/` reusing `components/loading-skeleton.tsx` |
| UX-25 | Docs | PRODUCT.md "Three bands, no fourth" and COPY.md's route list (`/desk/aaa`, `/desk/devices`) are stale vs the 8-tier ADR-018 model and the real routes | The next agent designs to the wrong model — the exact failure CLAUDE.md warns about | Low | S | Doc pass |
| UX-26 | Test access | No local-only operator login | Nobody (human QA, agent, `test:visual`) can see the desk without a real account | High | S | Unblock ACC-090a |

### Print collateral (not the app, but it ships on the same day)

The zone sheets you shared disagree with each other. The app follows the per-zone
sheets, so fix the print before security is briefed:

- **Two numbering sets.** "Backstage · Zone 4 of 5" and "Main Stage · Zone 5 of 5"
  exist alongside "Backstage · 5 of 6", "Photo Pit · 4 of 6" and "Main Stage · 6 of 6".
  The "of 5" pair also **omits Photo from the turn-away list**, so two versions of the
  Backstage and Main Stage rules are in circulation.
- **The Kannada under TURN AWAY says "ಅನುಮತಿ" (permission) instead of "ಅನುಮತಿ ಇಲ್ಲ"
  (no permission)** on Festival Area, Eddie's, Promoters, Photo Pit, Backstage 5/6 and
  Main Stage 6/6. For a Kannada-reading steward those sheets say the opposite. The
  "ALLOWED IN" Kannada on the same six sheets has its second line clipped by the band
  row.
- **Master sheet vs zone sheets on Artist + ID.** The master sheet says Artist is "+ID
  for lounges" only; the zone sheets (and `ZONE_ACCESS` in `lib/design.ts`) require
  photo ID at Photo Pit, Backstage and Main Stage too. Pick one — the pass prints "+ ID"
  chips from the data.
- The General Admission band carries no tier name ("ROCK N ROLL ORIGINALS .COM" twice).
  This is fine on the wrist, but on the pass add the "GENERAL ADMISSION" text label.

---

## 3. Per-screen notes

**`/` → `/desk/login`** (`home-*.png`). A redirect. Fine; there is no public audience.

**`/desk/login`** (`desk-login-desktop.png`, `-mobile`, `-error`, `-focus`,
`-forgot-sent`, `-dark`, `-lightmode`, `auth-confirm-*`). Worth keeping: the focus rings
(green inset on inputs, outline on buttons), the logical tab order, the non-enumerating
forgot-password copy, the `aria-live` region, the skeleton instead of a blank card, and
"Wrong email or password." sitting right above the button. Everything visual is up for
the redesign (UX-06 to UX-11). "Show password" as a detached text link under the field
is an extra target. Put it inside the field as an eye toggle with a label.

**`/desk`, `/desk/master`, `/desk/orgs`, `/desk/passes`, `/desk/users`**
(`desk-*.png` = redirect only). Not seen signed in — see "How this was reviewed". From
source: empty, error and confirm states are shared components
(`components/states/*`), with no `alert()`/`confirm()`. That discipline is worth
preserving. The poster art (`public/assets/boa-poster.png`) is used only here, as the
Control Room hero. It is the only festival imagery in the whole product.

**`/gate`** (`gate-*.png`, `gate-offline-mobile.png`). The signed-out case redirects
correctly with a context-aware H1. First-ever offline shows the browser's error page
(UX-20). The signed-in scan flow is not seen.

**`/gate/vehicle`** (`gate-vehicle-mobile.png`, `-desktop`, `-dark`, `-lightmode`).
The copy is excellent and should be kept verbatim: "Sticker and band. Both." and "A
match on the plate is not a match on the vehicle." The plate input is big and
centred, and the disabled CTAs are honest. Problems: no auth (UX-02/03), the CTA
overflowing (UX-13), sync-label collision (UX-14), 38px menu (UX-15). The footer is present here, and
it's the policy text (UX-18).

**`/p/[token]`** (`pass-valid-mobile.png` — ⚠️ real data, see top; `pass-invalid-*`).
The strong parts are the huge name, the pass ref top-right, the large QR on a light
plate (correct for scanners) and the fixed dark theme. The weak parts: the tier has the
same visual weight as the validity box and the zone chips. Every block is the same
rounded outlined rectangle, so nothing leads after the name. That uniform stack of
rounded, softly glowing boxes is the "AI-generated" feel you're describing. The fix is
not more decoration; it is letting the band artwork own the page (UX-01, UX-16, UX-17).

**404 / invalid pass** (`404-*.png`, `pass-invalid-*.png`). Consistent with each other,
with good copy. Neither offers a way out (UX-19).

---

## 4. Quick wins — one day, before gate-live on 4 Oct

1. Guard `/gate/vehicle` and trace the "14 not in BMS" count (UX-02, UX-03).
2. Fix the vehicle CTA overflow, the sync-label collision and the 38px menu (UX-13–15).
3. Copy: "crew" → tier-neutral on the pass (UX-05); trim the fine print to one line (UX-21).
4. Pass: granted zones only, as zone-sheet colour squares with solid "+ ID" / "after
   10 PM" tags (UX-17); remove the mint accent from the pass (UX-16).
5. Login cleanup without a redesign: drop the duplicate labels, a legible logo, the hint
   only on set-password, `noValidate` and inline errors, follow the theme (UX-07–10).
6. Put a "Message the accreditation desk" action on 404, invalid-pass and the footer (UX-19).
7. Unblock ACC-090a so the desk can be audited and visually tested (UX-26).
8. Fix the Kannada "TURN AWAY" line and settle the "of 5" vs "of 6" sheets before print.

## 5. Bigger bets

**B1 — The band is the pass.** Get the eight 3900×236 masters from Rock N Roll Originals
(the repo has no band art — only `boa-logo.png` and `boa-poster.png`). Export them as
WebP at 2400px wide, roughly 60–120 KB each, into `public/assets/bands/<tier>.webp`, and
key them by `TierCode`, since `lib/design.ts` already has all eight tiers with matching
colours.
On the pass: the band as a full-bleed strip across the top of the card (it reads as the
wristband itself). Behind it, the same artwork scaled up, desaturated to 10–15% under a
dark scrim, as the card background. That way a screenshot of the wrong tier looks
visibly wrong from across a queue. Text never sits directly on the artwork; it
always sits on a solid plate. At the gate, show the same strip on the scan result
("hand over THIS band"). That makes the article-to-screen match literal, and it
removes the risk of a steward picking the wrong physical band from the crate.

**B2 — A WhatsApp message that looks like the pass.** WhatsApp image headers display at
about 1.91:1, so the 16:1 band won't fit as-is. Compose one 1200×628 card per tier: the
band artwork as the background, the BOA logo, and the tier name in the display face.
Pre-render all eight as static files, so there is no per-person image and no name in
the image. Keep names out of images deliberately: data minimisation (non-negotiable #9)
and forwardability. Send it via Interakt `headerValues` (supported by the API, not yet
wired — `lib/interakt.ts:103-119` sends body and button only). Template: image header →
"{{1}}, your Bangalore Open Air pass is approved: {{2}} band. Show the pass at the
accreditation desk with photo ID. Don't forward it — it's yours alone." → button
"Open my pass". This needs a new Meta template approval. Submit it now; ACC-151
billing is still the harder blocker.

**B3 — Sign-in redesign.** A split layout on desktop. The left 60% is full-bleed art: the
General Admission skull pattern (black/grey — neutral, so no tier implied) or the poster,
with a scrim and "Bangalore Open Air · 10 Oct 2026 · Accreditation" set large in the
display face. The right side holds the form on a solid surface, not a floating card. On
mobile, a 30vh art band on top and the form below at thumb height, with inputs ≥52px.
No glow blobs and no pill tag. One radius value shared with the rest of the app, and the
gate variant styled like gate chrome. The login gets the footer too.

**B4 — A footer that does a job.** Four slots, the same on every surface:
- **event:** "Bangalore Open Air · 10 Oct 2026";
- **help:** "Accreditation desk" as a `wa.me` link;
- **data promise:** "We keep your name, phone, role and vehicle number. Nothing else." —
  a trust line that is literally true here;
- **status:** on the gate, the last sync time and pending outbox count; on the desk, the
  signed-in operator.

End it with "rocknrolloriginals.com", in line with the printed sheets. The current
policy lines ("Not registered… Not inside." / "Artists handled at the hotel") are for
staff. Move them onto the gate screen body, where they are instructions, not a footer.

**B5 — Primitives to end the drift.** `Button` and `Field` (UX-23) plus one radius scale
and one spacing scale in tokens. Most of the "inconsistency" you're noticing is 18
button variants and two input vocabularies. This is a structural fix; per-screen polish
won't hold without it. Per CLAUDE.md, check it against `boa_design_v2.html` and
ADR-017 first — primitives must reproduce the contract, not reinterpret it.

**B6 — Consider whether the gate should show zone art at all times.** Security works
from the zone sheets, which have colour squares per zone. If the gate result and the
pass use the same squares and the same band strips, the app, the sheets and the
wristbands become one system instead of three. That is what will make this look
designed rather than generated.
