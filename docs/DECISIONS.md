# Decisions

One entry per decision that would otherwise be re-argued. Do not change an
accepted ADR unilaterally — supersede it with a new one.

---

## ADR-001 — The design overrides the 29-Aug spec on scope and vocabulary

**Accepted 10 Sep 2026.**

Two documents describe this system: a written spec dated 29 Aug and an approved
design dated 8 Sep. They conflict. The design wins on **what exists and what it
is called**; the spec wins on **security mechanics**.

Consequences: 3 pass types, not 6 (the design's 520+78+14 ties to its own
"Approved 612"). Nine tables, not five — the spec's five cannot express any
dashboard statistic except "Submitted". `vehicle_reg` is collected, because a
plate identifies a vehicle and not a person; the spec's actual prohibition (no ID
number, no Aadhaar, no photo, no address, no DOB) is untouched and is
non-negotiable #9. The allocation desk lives in **this** app, because the design's
own nav carries all seven screens.

---

## ADR-002 — `pass_token` is stored in plaintext; invite and device tokens are hashed

**Accepted 10 Sep 2026.** The alternative is written out so reversing this is a
migration and not an argument.

`invite_token` and `device_token` are stored as `sha256` plus a 6-character hint.
The holder always has them and the server never needs to recover them.

`pass_token` is stored **in plaintext**, in a column with zero grants to `anon`
and `authenticated`, reachable only through `SECURITY DEFINER`.

**The rejected alternative:** hash `pass_token` too. The gate device caches
hashes, the scanner hashes the scanned value with Web Crypto and compares
locally. This works. It was rejected because:

1. The offline requirement already publishes the credential set. 612 hashes on
   four unlocked phones at a festival gate is not meaningfully safer than 612
   tokens — either way the device can answer "is this approved?".
2. The desk must reprint on any day. The design's Passes screen has
   *Print 14 passes* and *Send on WhatsApp*; Bhoopesh will approve on Tuesday and
   print on Friday. Hash-at-rest forces "returned once at approval, print now or
   never", which is a trap discovered at 2am on 4 October.
3. **The pass token is not the control.** The spec's own reasoning: *screenshot
   sharing is handled by the ledger, not by secrecy* — a second scan shows amber
   with a time and a gate. Hardening a credential whose compromise is already
   designed for, at the cost of a real operational capability, is the wrong trade.

**Compensating controls, all provable:** an explicit column-list grant that omits
`pass_token`, asserted by `column_privs_are` in pgTAP; no RPC returns a token for
a non-approved person, asserted as a named behaviour; a nightly encrypted backup
(see below — not PITR). **Residual risk: a database backup leaks every live pass
token if the encryption key is compromised.** Accepted.

**Addendum, 11 Sep 2026 — PITR replaced with a nightly encrypted `pg_dump`.**
Supabase PITR is a paid add-on beyond Pro (~$100+/mo), disproportionate for a
one-weekend event with no ongoing budget. `.github/workflows/backup.yml` dumps
the database nightly, encrypts it with a passphrase held only in a GitHub
secret and a password manager, and retains it 90 days as a workflow artifact.
This trades PITR's sub-minute recovery point for a nightly one — acceptable
because the risk being covered is an accidental drop or bad migration, not
live-traffic corruption. See `docs/OPERATIONS.md` — Backups.

---

## ADR-003 — Same cardinality and same actor → same ledger

**Accepted 10 Sep 2026.**

Vehicle **stickers** ride `boa_acc_checkin` alongside wristbands: same actor, same
physical tap, same once-per-person cardinality, so one outbox entry and one drain
order. The vehicle **gate** is its own table: a truck crosses the barrier a dozen
times over five build days, by a different actor, with a different vocabulary
(`cleared`/`turned_away` plus a mandatory reason), and is never voided or
reissued. Folding many-per-vehicle crossings into a once-per-person ledger would
put a `kind` filter on every dashboard aggregate and inflate the cached roster on
the one device that must work with the radio off.

---

## ADR-004 — `anon` gets nothing; the public surface goes through route handlers

**Accepted 10 Sep 2026.** Overrules the 29-Aug spec.

The spec had `anon` calling three `SECURITY DEFINER` functions directly with the
anon key. Instead, `anon` gets **zero table grants and zero function EXECUTE**,
and Next route handlers holding the service-role key call the same token-first
RPCs.

The RPC remains the control: it validates the token before touching a row, so a
route handler is a thin proxy and a bug in one cannot exceed what the RPC allows.
This is strictly tighter than the spec — the anon key in the browser bundle can
now reach nothing at all — and it puts per-IP throttling at the edge where it can
see an IP.

---

## ADR-005 — Fonts via `@fontsource`, not `next/font`

**Accepted 10 Sep 2026.** See DESIGN-SYSTEM.md for the full reasoning.

`next/font` generates obfuscated family names. The design's inline styles name
families as literals and must be transcribed verbatim, so under `next/font` every
one would silently fall back to a system face. `@fontsource` declares real family
names, self-hosts the woff2, and keeps the CSP at `font-src 'self'`. Verified in
a real browser before this was accepted.

---

## ADR-006 — `style-src 'unsafe-inline'` is accepted

**Accepted 10 Sep 2026.**

The design *is* 560 lines of inline `style` attributes and the transcription
reproduces them. A nonce-based `style-src` is therefore impossible without
translating the design into classes, which ADR-001 and DESIGN-SYSTEM.md forbid.

`script-src` remains nonce-based with `'strict-dynamic'`, which is where the
actual XSS risk lives. `'wasm-unsafe-eval'` is additionally required for the
zxing scanning fallback on iOS; without it every iPhone at the gate silently
loses the camera.

**Shipped 14 Sep 2026:** `middleware.ts` now generates a fresh per-request
nonce, passes it to Next's App Router through the request headers, and emits
the nonce-based `script-src` policy above. The aeroplane-mode E2E test asserts
fresh nonces and decodes a generated QR through the local zxing-wasm fallback
with the policy active. Real-iPhone verification remains open as ACC-053b;
the headless assertion is necessary but not sufficient for iOS Safari
acceptance.

---

## ADR-007 — Not a PWA; one service worker scoped to `/gate`

**Accepted 10 Sep 2026**, on the user's instruction that this is a responsive web
app.

No manifest, no install prompt, no update UI. The single service worker is
registered only from `app/gate/layout.tsx` and scoped to `/gate`.

It is not optional there: without it, a volunteer who reloads a phone with no
signal gets a white screen instead of a scanner, and the spec calls aeroplane-mode
scanning *"a test, not a nice-to-have"*. All three `/gate` routes are
`force-dynamic` with zero server data so the per-request CSP nonce can reach the
App Router bootstrap; the service worker precaches their emitted responses by
URL. The current generated worker has 60 entries (3 routes, 30 scripts, 1 CSS,
24 fonts and 1 WASM).

---

## ADR-008 — The visual reference is the approved bundle rendering itself, regenerated per run

**Accepted 11 Sep 2026.**

`design/reference/` holds 28 PNGs (7 screens × 2 themes × 2 viewports). Two
decisions, both against the obvious choice.

**1. The reference is captured by driving the approved bundle in a real browser,
not by porting `renderVals()` to Node.** A fidelity gate whose reference is a
second implementation of the design's logic proves only that two of our own
guesses agree. bar-control's design QA failed exactly this way, and recorded the
lesson as *"the cheapest way to pass a screenshot comparison is to hardcode the
screenshot's values."* Rendering the artefact itself removes the entire class of
error.

**2. The PNGs are gitignored and regenerated on every CI run**, rather than
committed as a baseline.

Committing a baseline is the conventional choice, and it was rejected because a
committed PNG fails on a runner image bump — Chrome renders antialiasing
slightly differently — and the fix everyone reaches for is "regenerate the
baseline", which is the single move that destroys a visual gate permanently.
Capturing the reference and rendering the app in the **same browser, in the same
run** isolates *our app vs the design* from *Chrome 130 vs Chrome 131*.

The baseline cannot drift silently, because `design/source/boa_design_bundle.html`
**is** committed: any change to the contract shows as a diff in review.

Verified before accepting: 28/28 captures are byte-identical across consecutive
runs on the same machine. It also avoids 4.8 MB of binary churn per re-capture.

**The consequence to accept:** the design job is slower (it installs Chromium and
renders 28 screens). That is the right thing to pay for the one gate that
protects "I need the app exactly like the design".

---

## ADR-009 — The desk chrome does not ship on public (invite-token / pass-token) screens

**Accepted 12 Sep 2026, user confirmed.**

The design bundle wraps every screen — including Submission — in one persistent
shell: logo, "Accred desk" nav linking to `/desk/*`, a WEB/MOB/LIGHT review
toggle, and a live "184/612 BANDS ISSUED · 14 NOT IN BMS" status strip. The
reference screenshots therefore include all of it.

DESIGN-SYSTEM.md already excludes the WEB/MOB/LIGHT toggle as review-bundle
furniture, but says nothing about the rest of that same bar. Shipping it
literally would put desk navigation and live operational numbers behind a
public, unauthenticated vendor link — the opposite of ARCHITECTURE.md's surface
split (invite-token / pass-token vs. operator login), and `/s/[token]` would
need `boa_acc_desk_dashboard()`-shaped data it has no business seeing.

**Decided:** the entire top bar is review furniture on public surfaces, same
category as the viewport toggle. `/s/[token]` (and `/p/[passToken]` when built)
ship only the screen's own content — header, quota bar, form, list, the shared
footer line. `scripts/capture-design-reference.mjs` hides that bar (`PUBLIC_SCREENS`)
before capturing the reference for these screens, so the reference matches what
actually ships rather than the review tool's frame.

**Consequence accepted:** the Submission screen's "Your list" also cannot
pixel-match the reference's four named, differently-stated rows — that data
requires either a client-only list of *this session's own* additions (no new
API, no new PII exposure) or a new org-roster RPC exposing every teammate's
name/phone/status to anyone holding the invite link. The user chose the
session-only option (12 Sep 2026); `test:visual` on Submission therefore shows a
real, understood gap (~28-30%, entirely the empty "Your list" region plus the
vehicle-toggle default, both deliberate) rather than the ≤0.8% every other
screen is held to. See docs/CURRENT-STATE.md, ACC-025, for the measured number.

---

## ADR-010 — Resend, via direct signup, for Supabase Auth's SMTP

**Accepted 12 Sep 2026.**

Supabase's built-in mailer (no custom SMTP configured) caps at
`rate_limit_email_sent: 2` per hour with `smtp_max_frequency: 60` seconds
between sends — discovered the hard way, mid-invite: Bhoopesh's invite sent,
Salman's failed immediately after. Unworkable for four operator invites today,
let alone resends before 20 Sep.

**Provider: Resend**, matching `boa-bar-control`'s own choice — but that
project never actually finished this step (its own `CURRENT-STATE.md`: *"Resend
SMTP/domain configuration and live OTP delivery have not been verified"*), so
there was no working credential or config to copy, only the same open task.

**Installed by direct signup at resend.com, not the Vercel Marketplace.**
The Marketplace path (`vercel integration add resend-email`) requires the
Vercel project on a paid plan for its billing; direct signup is free (100
emails/day) and Supabase Auth only needs SMTP host/port/user/pass, which
Resend hands out the same way either route. `accred.bangaloreopenair.com` was
already verified on the user's existing Resend account. Wired directly into
Supabase's `config/auth` via the Management API: `smtp_host=smtp.resend.com`,
port `465`, user `resend`, password = the Resend API key, sender
`noreply@accred.bangaloreopenair.com`.

**A second, separate rate limit surfaced after SMTP was live**:
`rate_limit_email_sent` (2/hour) is a Supabase Auth setting independent of
SMTP — configuring a real provider does not raise it. Raised to `30` via the
same Management API call. This is now the number to revisit if operator
invites or resends ever need to happen faster than 30/hour.

Verified for real: `GET /v1/projects/.../config/auth` before and after;
Resend's own `/emails` log shows 3 of the 4 operator invites `delivered`
(Bhoopesh's went out before SMTP was configured, via the default mailer —
also delivered, per Supabase). Not yet done: Resend was installed with a
full-access API key sent over chat rather than generated as a
sending-scoped key — fine for this one-time bootstrap, worth tightening
(a `sending_access`-only key) before this becomes a routine path.

---

## ADR-011 — Email links verify server-side (`token_hash`), never client-side

**Accepted 12 Sep 2026.**

The first version of `/desk/login` redirected invite/recovery links straight
at itself and tried to read the session from the URL fragment
(`#access_token=...&type=invite`) client-side. It silently never worked: no
error, no session, just a quiet fall-through to the plain sign-in form —
discovered because five real operator invites all failed to show a
set-password prompt.

**Root cause, confirmed by reading the library source**:
`@supabase/ssr`'s `createBrowserClient` hardcodes `flowType: "pkce"` in its
own implementation — any `auth.flowType` passed in is spread first and then
unconditionally overwritten on the next line. A PKCE-flow client only
recognises `?code=` in the URL; it does not parse `#access_token=` at all,
implicit or not. There is no client-side option that fixes this against
`createBrowserClient` in `@supabase/ssr` 0.5.2.

**Fixed to Supabase's own documented pattern for this exact situation:**
the invite and recovery email templates (`config/auth`,
`mailer_templates_invite_content` / `..._recovery_content`) now link to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type={{ .Type }}&next=/desk/login`
— a route handler (`app/auth/confirm/route.ts`) that calls
`supabaseServer().auth.verifyOtp({ type, token_hash })` server-side, which
persists the session as a cookie via `@supabase/ssr`'s server client
*before* the browser runs a line of client JS. `/desk/login` reads the
result only from the query string (`?flow=invite` / `?flow=recovery`,
appended by the confirm route on success), never from a fragment.

---

## ADR-012 — "Reissue" means the physical article, at the gate; never a new `pass_token`

**Accepted 12 Sep 2026, while building ACC-041.**

ACC-041's brief asked whether "reissue" means (a) minting a fresh `pass_token`
for an already-approved person (invalidating the old one), or (b) an
append-only ledger row recording that a physical wristband or vehicle sticker
was handed over a second time. It is **(b), and only (b)** — confirmed by
reading, not guessed:

- `design/source/boa_design_body.html`'s own scan-screen copy, twice, in
  identical words: *"A reissue needs a supervisor note. It adds a ledger row,
  it does not replace the first."* This is the amber ("already collected")
  path — a second scan of the same approved pass, not a compromised or lost
  credential.
- `docs/OPERATIONS.md`'s amber-scan section: *"A reissue needs a supervisor
  note and **appends** a row; it does not replace the first."*
- `docs/DATA-MODEL.md`: "A reissue appends with `is_reissue = true` and a
  mandatory supervisor note" — a `boa_acc_checkin` row, not a `boa_acc_person`
  mutation.

Nowhere in the design, `docs/OPERATIONS.md`, or `docs/DATA-MODEL.md` does
"reissue" mean re-minting a person's credential. `pass_token` is generated
exactly once, at approval (`boa_acc_person_pass_only_when_approved`), and
ADR-002 already accepted the residual risk of that token being visible in a
backup rather than designing for rotation.

**What this means for ACC-041, concretely:** `boa_acc_decide` /
`boa_acc_approve_org` (this task) touch `boa_acc_person` only. Neither writes
to `boa_acc_checkin`. The actual reissue-writing RPC — the one a gate device
calls after a supervisor confirms a second wristband handout — is **Phase 4
scope** (ACC-052 `gate/resolve.ts`, ACC-056 `/api/gate/*`), not built here,
because it depends on the offline outbox and device-auth model
(`docs/OFFLINE-SYNC.md`) that Phase 4 owns and that does not exist yet.
Building it now, disconnected from that design, risks a second, incompatible
write path to the ledger before the real one exists — exactly the kind of
premature architecture non-negotiable #10 and this project's own founding
lesson (see CLAUDE.md, "How the sibling project got here") warn against.

**What ACC-041 does prove about the ledger, without writing a real row to
it:** `boa_acc_checkin`'s `ENABLE ALWAYS` immutability trigger has no delete
path for anyone (see `supabase/tests/dashboard.test.sql`'s header, and the
session before this one, which had to disable-then-re-enable that trigger by
hand — with the user's explicit approval — to remove two accidental fixture
rows from the live ledger). A pgTAP test that *successfully* inserts a
checkin row therefore can never clean itself up. `supabase/tests/ledger.test.sql`
sidesteps this entirely: every assertion in it is a `throws_ok` against one of
`boa_acc_checkin`'s own CHECK constraints (`reissue_needs_note`,
`void_targets_a_row`, `sticker_needs_plate`) — a failing `INSERT` is rolled
back by Postgres before it commits anything, so no row, live or otherwise, is
ever created. This is real, permanent, automated coverage of the ledger's
reissue/void shape, not a one-time hand check — it just never needs a
*successful* write to prove those three rules hold.

**Left open, on purpose:** what happens if a `pass_token` is actually
compromised (leaked photo of the QR, phone stolen) rather than a wristband
simply being re-collected. Nothing in the design or `docs/OPERATIONS.md`
describes a desk-side remedy for that case, and ADR-002 already accepted the
underlying risk rather than designing rotation. A `boa_acc_void_person` /
re-approve path is a plausible answer but is a new decision, not an
extension of "reissue" as this codebase already uses the word — flagging it
here rather than quietly inventing one.

**Verified end-to-end for real**, not asserted: a throwaway account
(`vipinmenon16+logintest@gmail.com`, minted with `generateLink` and wiped
after) walked the confirm link → saw "Set your password" → set one →
landed on `/desk` (404, ACC-027 not built — expected) → signed out → signed
back in with email + the just-set password → same result. All five real
operators' original invite emails were sent *before* this fix and were
therefore dead; each was re-invited (`inviteUserByEmail` resends against the
same `auth.users` row for an unconfirmed user) and reconfirmed `delivered`
in Resend's log after the fix.

**A second, smaller bug found in the same pass:** `invite-operator`'s
`boa_acc_operator` write was a plain `insert`, which fails on a resend
(the row already exists for that `user_id`). Changed to `upsert`.

---

## ADR-013 — The root reverses ACC-007: it is the desk sign-in now, not a dead end

**Accepted 12 Sep 2026, Vipin's direct instruction.**

ACC-007 made `/` a deliberate dead end — no login link, no route list,
nothing a stranger hitting the bare domain could use to learn what surfaces
exist, on the reasoning that every real surface is reached by a credential
someone already holds (an invite link, a pass link, a device token, or
desk credentials). Reversed here: "Sign in should be the page. If you have
access then you can login. This message page is not necessary."

**Why this isn't a step back on non-negotiable 3** (authorisation enforced
in the database): a sign-in *form* grants nothing by existing. It asks for
credentials it never sees unless someone types them, same as the login page
ACC-026 already built at `/desk/login` — this only changes *where* that form
is reached from. The old copy at `/` was arguably more revealing than a bare
"Desk sign in" heading: it explained the whole invitation model in prose
("your contact has been sent a registration link... it will reach you on the
number you were registered with"), where the new page says nothing about
what the app is *for* at all.

**Implementation:** `app/page.tsx` is now a server component that calls
`redirect('/desk/login')` — no duplicate login UI, one source of truth.
`/s/[token]` and `/p/[passToken]` links never route through `/` regardless
of this change; only a bare, tokenless visit to the domain is affected.

---

## Decisions taken by the user, 10 Sep 2026

Recorded here so they are not re-opened by someone reading only the spec.

| | Decision |
|---|---|
| Database | New dedicated Supabase project, ap-south-1 |
| Hosting | New Vercel project, region `bom1` |
| Stack | Next.js 16 App Router, React 19, TS strict. Responsive, not a PWA |
| Desk accounts | Small named list, invited. `enable_signup = false`. Gate volunteers get no accounts |
| Sticker input | **Add** a vehicle-sticker field to the approved gate scanner — the one addition to the design |
| AAA | **Salman gets his own account** and approves nominations himself |
| Pass distribution | The org invite link shows approved pass links; the vendor contact distributes |
| Retention | Personal data retained until BOA 2027 planning begins. Review task dated 9 Nov 2026 in OPERATIONS.md |

---

## ADR-014 — The "v2 Readiness Plan" is a gap list, not a replacement source of truth

**Accepted 13 Sep 2026.**

Vipin handed over a document titled "BOA Accreditation App — Festival
Readiness Plan & Checklist (v2)" (plus the design deck PDF and the design
HTML bundle) and called it "the single source of truth for this module."
Read against the actual repository state (46/61 tasks done at the time),
v2 turns out to be a snapshot written before most of Phase 1–4 existed, and
it contradicts several already-accepted decisions. Per non-negotiable #10
and the lesson in "How the sibling project got here," those contradictions
are recorded here rather than quietly overridden or quietly ignored.

**Confirmed identical, not contradicting:** `BOA Accreditation App.html` is
byte-identical (sha1) to `design/source/boa_design_bundle.html`, and the PDF
is the same six-page deck already governing `design/source/`. v2's pass-type
table, the 3×7 zone matrix, and the three-outcome gate model all match what
`lib/design.ts` and the migrations already implement — nothing there is new
information.

**Where v2 conflicts with an accepted decision, the repository wins:**

| v2 says | This repo does | Why the repo wins |
|---|---|---|
| 5 tables, prefix `boa_acc_` | 10 tables | ADR-001 — five tables cannot express the dashboard's own statistics beyond "Submitted" |
| Allocation desk lives inside `boa-bar-control` (the existing crew app) | The desk lives in **this** app, at `/desk/*` | ADR-001 — the design's own nav bundles all seven screens into one app; already built, deployed, and operator-tested |
| Only 3 anon-callable RPCs plus 2 device RPCs | `anon` has **zero** table grants and **zero** function EXECUTE, full stop; every public path (including devices) is a route handler calling a `service_role`-only or internally-checked RPC | ADR-004 — the public surface is route handlers, not anon RPCs, so this isn't a smaller/larger number of the same thing, it's a different security boundary |
| Engineering + testing done by 26 Sep | Phase 4 (the gate) runs to 3 Oct; Phase 5 (live) runs through 10 Oct | The roadmap's dates were set from the real four dates (links 20 Sep, gate live 4 Oct, build 5–9 Oct, show 10 Oct) and from work that didn't exist when v2 was written. Compressing verified, working code onto a stale timeline is not a improvement. |
| AAA: "Vipin supplies these names directly, bypassing the normal flow" | AAA nomination and approval is Salman's, per the 10-Sep decision above and the design deck itself ("approved directly by Salman") | Named ownership doesn't change; see the privileges note below for what an admin account can still do |
| "Nobody outside crew gets a Supabase account" / "existing crew login" implies the desk reuses `boa-bar-control`'s auth | `/desk/*` has its own operator table (`boa_acc_operator`) and its own invite → set-password flow (ACC-026), independent of `boa-bar-control` | Consequence of the desk-location decision above, not a separate disagreement |

**Where v2 identifies a real gap, it is taken as one and added to the
roadmap** (ACC-034 through ACC-04B, ACC-036, ACC-048, ACC-049): the WEB/MOB
debug toggle actually ships in `app/gate/gate-chrome.tsx` and must be
stripped; there was no automated ₹/finance-term/debug-marker gate on the
build output; there was no dummy-data seed for QA; there was no
forgot-password flow, no Manage Users screen, and no profile/theme menu on
the desk. None of these were previously tracked as ACC tasks.

**Vipin's own access:** Vipin is already an `admin` operator
(`vipinmenon16@gmail.com`, ACC-026). `private.boa_acc_is_operator()` with no
role argument — the predicate `boa_acc_decide`, `boa_acc_aaa_nominate` and
`boa_acc_aaa_approve` all use — accepts **any** active operator, and every
lead/admin-gated function (`create_org`, `mint_invite`, devices) already
accepts `admin`. So an admin account, Vipin's included, can already do
everything in the app end to end for testing, AAA approval included; no
schema change is needed for that. What ADR-014 changes is only that this is
now stated explicitly and proven by a test (`admin_reach.test.sql`, ACC-0
scope below) rather than left to be discovered by trying. "Salman approves
AAA" (the 10-Sep decision, restated in v2) remains the **named, intended**
workflow — it describes who does it operationally, not a database
restriction on who is capable of it.

## ADR-015 — `DeskChrome`'s theme-toggle slot becomes a profile menu (ACC-04B)

**Accepted 13 Sep 2026.**

`design/source/boa_design_body.html`'s header (lines 26–45) is one shared
template — logo, `nav` list, `vpTabs`, then a single `toggleTheme` button —
rendered by the design tool for every screen, `/desk/*` included. Four of
the seven pixel-gated screens (`control-room`, `queue`, `master`, `passes`;
see `scripts/visual-check.mjs`'s `SCREENS` array) render through
`DeskChrome`, and `DeskChrome`'s header — logo, `NAV`, then a lone
`Light`/`Dark` button in that exact slot — is a direct transcription of that
template (`GateChrome` transcribes the same template's `vpTabs` too;
`DeskChrome` already omits `vpTabs`, a pre-existing, undocumented-here
divergence not touched by this ADR). So the button ACC-04B replaces **is**
part of the pixel contract for those four screens, not app-authored
chrome like `/desk/login` or `/desk/users` — non-negotiable #1 applies, and
this ADR is the record it asks for.

**The change:** the lone theme-toggle button is replaced by a disclosure
button in the same slot (same border, padding, font — `JetBrains Mono`
10px/700/0.12em, matching every other control in that header row) that
shows the signed-in operator's display name and role, and opens a dropdown
containing: name + role (repeated, for when the trigger truncates on
narrow viewports), the theme toggle (identical behaviour, just relocated —
`toggleTheme()` is unchanged), a "Manage users" link to `/desk/users`, and
"Sign out". The design source has no menu of this shape anywhere — it was
built for a single design-tool session with one implicit operator, never an
authenticated multi-operator desk — so its contents beyond the toggle are
new, justified by the operator identity, RBAC and sign-out capabilities this
app added long after the design bundle was produced (`boa_acc_operator`,
ACC-026/049), none of which exist in the source at all.

**Why this is the right trade rather than a new dead-end screen:** the
alternative — a lone theme button plus a *second*, unrelated control for
sign-out/Manage-users — would add a second visual element the design never
had, which is a bigger deviation than folding all of it behind one
disclosure in the toggle's existing slot. Collapsed, the header's pixel
footprint for a signed-out-state render (no menu open) changes only in the
button's label text and width; the closed state's box model (border,
padding, background) is unchanged.

**Verification obligation this creates:** `corepack pnpm test:visual` must
be run after this change and its real percentage recorded in
`docs/CURRENT-STATE.md` for `control-room`, `queue`, `master`, and `passes`
— not assumed passing because the button "still looks similar." See the
session log entry for the actual numbers, or the documented reason they
could not be measured.

## ADR-016 — Submission "Your list" is the token organisation's roster

**Accepted 15 Sep 2026.**

The Submission screen's "Your list" is server-backed, not session-only. A
holder of a live invite token sees the people already submitted from that
organisation, together with later desk decisions, so the list survives reloads
and reflects the same source of truth as the desk.

`public.boa_acc_org_roster(text)` resolves the organisation from the invite
token itself. It returns only `full_name`, `role_text` and workflow `status`
for `submitted`, `approved` and `rejected` rows. Draft rows are local browser
state until submitted; voided rows are historical and are not roster entries.
Phone numbers, vehicle registrations, `pass_token` and all other credentials
are deliberately excluded from this public projection.

The function is a `SECURITY DEFINER` token boundary and is executable only by
`service_role`, matching `boa_acc_org_view` and the existing server-side route
pattern. Unknown, revoked and expired tokens remain indistinguishable `P0002`
not-found errors.

## ADR-017 — v2 becomes the pixel contract; v1 remains the domain record

**Accepted 20 Sep 2026.**

`design/source/boa_design_v2.html` is the pixel contract for the redesign lane.
`design/source/boa_design_body.html` and `boa_design_bundle.html` are frozen:
they remain the authority for `TYPES`, `ALL_ZONES`, the eleven `PROP` colour
literals, and the C8 two-layer colour disagreement. The token gate therefore
has two deliberate sources: v2 for the CSS theme layer and frozen v1 for the
domain/prop layer. `tests/unit/design-contract.test.ts` must continue to read
v1 without churn.

The v2 contract's AAA light-theme colour is an intentional amendment: the
domain contract remains `TYPES.aaa.colourLight === '#2A2A33'`, even though v2's
convenience `--ink` token is `#14141A`. The domain value is not reconciled to
the surface token.

The v2 `.tools` bar and `body.mob` device mock are preview furniture, not
shipped UI. Capture uses the real 390px viewport and does not click the Mob
preview control. The profile menu owns the shipped theme control. The v2
container breakpoints at 1100px and 700px supersede v1's single 768px
responsive rule.

The reference artifact is made capturable offline: it uses the repository's
self-hosted `@fontsource` binaries, a local inline SVG Phosphor Light set, and
an explicit readiness hook. The CDN-versus-local capture measured 28 shots:
four queue shots changed dimensions because the CDN capture did not load its
remote font/icon dependencies; the other 24 shots differed by 71,546 pixels
out of 39,110,080 (0.1829%). The CDN run's Anton probe reported unloaded
faces, so this is evidence that the CDN source is not a valid capture baseline
under the file-based harness, not a claim that the local assets are visually
free. The local 28-shot capture is the accepted v2 reference.

---

## ADR-018 — The printed accreditation pack is the domain contract for tiers and zones

**Accepted 21 Sep 2026.** Supersedes ADR-001 **on tier and zone vocabulary
only.** ADR-017 is untouched: v2 remains the pixel contract.

The accreditation pack arrived after the design: a master zone map, the woven
wristband artwork, and one allow/turn-away sheet per zone. The bands are
already manufactured. A pass that names a tier the volunteer cannot find in the
box is worse than no pass, so **the pack wins over the 8-Sep design on what
exists and what it is called**:

| | 8-Sep design (ADR-001) | The pack (this ADR) |
|---|---|---|
| Tiers | 3 — Working Crew, Stage, AAA | **8** — AAA, Artist, Stage, Promoters Lounge, Crew, Photo, Eddie's Lounge, General Admission |
| Zones | 7 — Site … Artist area | **6** — Festival Area, Eddie's Lounge, Promoters Lounge, Photo Pit, Backstage, Main Stage |
| Access | an array of zones per type | **26 explicit (zone, tier) rows**, each with a `+ photo ID` flag and an optional local-time window |

**Where the truth lives.** `design/source/accreditation/sheets/` holds the ten
sheets verbatim; `design/source/accreditation/access-matrix.json` is their
transcription. The JSON is a record, not a design: if it disagrees with a sheet,
re-read the sheet. `lib/design.ts` and the `boa_acc_type` /
`boa_acc_zone_access` seed are mirrors of it, and
`tests/unit/accreditation-contract.test.ts` proves all three agree.

**Rules carried from the pack, as data:**

- **Absence is refusal.** A (zone, tier) pair not in `boa_acc_zone_access` is a
  turn-away. There is no `allowed` boolean to get backwards.
- **`+ photo ID`** is a per-row flag, not a per-tier one: Artist needs it in
  five zones and not in the Festival Area.
- **Promoters Lounge → Backstage from 22:00 IST only.** Stored as
  `from_local_time time` with `Asia/Kolkata` named on the table, never as a
  `timestamptz` (non-negotiable #8 governs instants; this is a daily wall-clock
  rule, not an instant).
- **Zone order is the sheets' own "ZONE n OF 6"** and is load-bearing, as the
  old `ALL_ZONES` order was. **Tier order is the master sheet's "Where each band
  goes"**, most access to least. The artwork sheet's 01–08 numbering is the
  printer's order and is kept only to tie a band in hand to its artwork row.

**Requestable tiers.** A vendor may request Stage, Promoters Lounge, Crew,
Photo or Eddie's Lounge. **AAA and Artist** are named lists approved directly.
The AAA nomination guard in `boa_acc_decide` is **not** extended to Artist:
an operator approves Artist like any other tier. Whether Artist needs its own
nomination list is open for Salman. **General Admission** is
3,000 ticket-holder bands issued by ticketing; it is in the matrix so the zone
sheets are complete, and it is never accredited here.

**Who picks the tier.** Organisations submit *crew type* (docs/ROSTER-FORM.md),
not a tier. `boa_acc_person.requested_type_code` is **advisory** — a hint from
an importer mapping — and `type_code` is still set only by `boa_acc_decide`.
Non-negotiable #3 holds.

**The app does not enforce zones.** The gate scans one thing: entry to the
site, and it hands over the band. Zone boundaries are enforced by guards
reading the band colour against the printed sheet. The app's job is to show
the right tier and its zone strip on the pass and the gate card, so the band
handed over is the right one.

**Four discrepancies inside the pack are recorded, not reconciled** (P1–P4 in
the JSON). The one with consequences is P2: the master sheet says Artist needs
ID "for lounges", the per-zone sheets say it needs ID in every zone except
Festival Area. **The per-zone sheets win** — they are what a guard holds at
that boundary, and the stricter reading fails safe.

**Chip colours — decided by Vipin, 21 Sep: match the band.** Each tier's
on-screen chip is its printed band colour, tuned for contrast (dark on
`#0A0A0A`, light on `#F6F4EC`; every value ≥ 4.5:1, measured):

| Tier | Band | Dark | Light |
|---|---|---|---|
| AAA | green | `#39E639` | `#1E7A1E` |
| Artist | magenta | `#F0169A` | `#A50E69` |
| Stage | orange | `#F07A2A` | `#9C4A10` |
| Promoters Lounge | royal blue | `#4371FF` | `#1F43C2` |
| Crew | purple | `#A64DFF` | `#6A1FB8` |
| Photo | yellow | `#F2D21C` | `#6E5E00` |
| Eddie's Lounge | red | `#FF4A3D` | `#A81E14` |
| General Admission | black/grey/white | `#B8B8B8` | `#55555C` |

Promoters dark was proposed as `#3D6BFF` (4.47:1) and nudged to `#4371FF`
(4.76:1). **Accepted cost:** AAA green, Eddie's red and Photo yellow sit close
to the Approved / Refuse / Collected verdict colours. The gate verdict always
carries its word, so colour is never the only signal.

**Schema shape (ACC-113).** `boa_acc_type_code` was **extended**, not rebuilt:
crew, stage and aaa survive, and five functions take the enum as a parameter,
so a rebuild would drop and recreate all five for no behavioural gain.
`boa_acc_zone` **was** rebuilt; only the dropped `boa_acc_type.zones` column
used it.

## ADR-019 — The Google Form and sheet are the front door; the app is the gate

**Accepted 22 Sep 2026, on Vipin's instruction.** Supersedes the collection and
approval halves of the original plan (38 invite links → `/s/[token]` → desk
queue). Does not touch ADR-017 or ADR-018.

**What happened.** Collection moved to one Google Form (21 Sep, Salman and
Vipin; `docs/ROSTER-FORM.md`). On 22 Sep Salman began deciding each person's
tier by hand in the response sheet's column I, "Accreditation Type". By then
the sheet held 16 real responses and Milestone A (20 Sep links) had passed
unsent. The sheet now does collection and the decision; nothing in the app
should compete with it.

**What the app is for now.** Everything a sheet cannot do: approve in the
database and mint the pass there (non-negotiables #3, #5), a pass per person,
Bhoopesh's offline check-in desk, the append-only ledger, serials typed at
handover, plate-bound vehicle stickers, the BMS worklist and the Control room
counts.

**Consequences.**

- Retired: ACC-030, 030a, 031, 046, 105, 108, 123, 137 (marked `[-]` in the
  roadmap, with the reason). `/s/[token]` and `boa_acc_submit` stay deployed but
  are no longer the collection path; nothing new is built on them.
- New: Phase R, ACC-140–147 — import-and-approve, org normalisation, write-in
  crew types, per-person pass delivery, first real import, the daily loop,
  Bhoopesh's desk.
- The queue becomes an exceptions tool. v2 pixel work (ACC-104–111) is frozen
  behind Phase R and the gate, and is first in the cut order.
- **Not a redesign.** The design contract, the schema, the gate and the passes
  are unchanged.

**Open, and not decided by this ADR** (roadmap ACC-140a–e): whether column I
*is* the approval; whether AAA/Artist may be decided in the sheet; whether
organisations still matter; how a pass reaches a person; when the form closes.

## ADR-020 — Check-in issuers log in as people; device tokens are retired

**Accepted 22 Sep 2026, on Vipin's instruction.** Supersedes the device-token
half of ADR-002 and the `/gate/setup` pairing flow.

Wristbands will be handed out by **up to 10 people**, not Bhoopesh alone. Each
gets the same path as the desk and as `boa-bar-control`: **invite → set
password → log in.** No phone is paired and no device token is minted.

- A new operator role, **`issuer`**: check in and issue bands only. It cannot
  approve, import or manage users. Enforced in the database (non-negotiable #3).
- `/api/gate/*` authorise the operator's session; every ledger row names the
  person who issued the band.
- **Offline cost, accepted:** an issuer must log in once with signal before a
  shift. A session that lapses offline loses nothing — the outbox stays queued
  until they log in again.
- **Ten offline phones can double-issue.** Two issuers without signal can each
  give the same person a band; nothing can prevent that while the phones cannot
  talk. It is caught instead: phones sync as soon as there is signal, and the
  Control room lists every person holding two live bands, with both serials and
  both issuers (ACC-148, ACC-149). With signal at the desk, the second phone
  shows amber "already issued" and it does not happen.

Roadmap: ACC-150 (login), ACC-148 (warning), ACC-149 (sync); ACC-061 retired;
ACC-058 rehearsal widened to three or more phones with a staged double issue.

## ADR-021 — One place lists people; Organisations lists companies

**Accepted 25 Sep 2026, on Vipin's instruction**, after he went through the
running app with the real roster loaded and asked, three separate times, what
the Organisations tab was for — then what the Control room's organisations
section was for, then what Master list was for. Three questions with one cause:
**the same rows were reachable from three screens, and no screen owned them.**

The rule, which every desk screen now follows:

> **People are listed in exactly one place: Master list.
> Organisations lists companies. Control room counts things.**

What changes:

- **The Control room's organisations list is removed.** It kept a count of
  companies on site; the list itself moves. A glance belongs on the Control
  room, a task does not.
- **Organisations owns the company list** — name, kind, contact, status, and
  **sent / approved**, which replaces a `used / quota` meter that displayed a
  cap ACC-140g had already abolished (`ORG_QUOTA_NON_ENFORCING = 500`). It also
  keeps "Copy names for the form dropdown", the one function nothing else does.
- **Clicking a company opens Master list filtered to it** — `?org=<id>` — not a
  new screen. `app/desk/orgs/[orgId]/`, an empty folder created 10 Sep and
  never built, is deleted rather than filled: building it would have created a
  *third* place listing people, which is the problem this ADR exists to end.
- Master list keeps its three unique jobs, which is why it survives untouched:
  search across everyone when the organisation is unknown, the **Not in BMS**
  worklist (cross-organisation by nature — it is Bhoopesh's daily task), and
  band serials, making it the only view of who collected what, and the source
  for the paper fallback (ACC-059).

**Two dead controls die with the move, not by repair.** The Control room's
`25/500` meter and its "Needs you first" sort — a `<span>` styled as a link,
with no handler, not keyboard-reachable — are both inside the section being
removed. They are the same class ACC-130 cleared from the gate and missed here.

**This diverges from the frozen contract, deliberately.**
`design/source/boa_design_v2.html` draws the organisations list on the
dashboard. Moving it is a divergence of the same kind as ADR-019's screen
removals, and it will change the Control room's `test:visual` figures.
Non-negotiable #1 still holds for everything the contract draws that the app
still draws; this records the one section it no longer does, and why. It does
not touch ACC-104's separate ADR-017-vs-ADR-018 band conflict, which is still
open and still Vipin's to resolve.

Roadmap: ACC-152.

## ADR-022 — The vehicle gate resolves on input; the officer is told before deciding

**Accepted 27 Sep 2026, on Vipin's instruction** (ACC-159), from the two options
put to him: resolve on input, or fix only the tooltip and leave the lookup where
it was.

The defect, stated plainly: `/gate/vehicle` looked the plate up **inside**
`recordEvent`, after "Log entry and open gate" was pressed. So the only way for
the officer to learn whether there was a sticker and a live wristband was to
**press the permissive green button and be refused.** The screen's own copy — "A
sticker without a wristband does not enter" — described a check the screen would
not perform until after the decision it was describing. At a barrier, at night,
with a queue behind the car, that is an instrument that answers the question
only once you have already committed to an answer.

The rule:

> **A plate that parses is resolved immediately. The three checks are on screen
> before any button is pressed. A button press is a decision, never a query.**

What changes:

- **`resolvePlate(db, plate)`** (`gate/vehicle-flow.ts`) is the single source of
  truth, and is used by **both** the pre-decision panel and `recordEvent`. There
  is deliberately no second copy of the lookup: showing the officer one thing
  while enforcing another would be worse than the defect being fixed. It reads
  Dexie only and writes nothing — non-negotiable #7 holds, and resolving is safe
  on every keystroke because resolving is not an event.
- **The panel shows holder, sticker number and wristband state** as soon as the
  registration parses, headed "Ready to clear" or "Will not clear". "Plate
  matches sticker" is shown as the officer's own check, because the app cannot
  see the vehicle — that one is not a claim the software is entitled to make.
- **The resolution is keyed to its own plate.** The panel renders facts only
  when `resolved.plate === normalized`, so editing the registration cannot leave
  the previous vehicle's sticker on screen under a new plate.
- **The disabled reason is visible text.** `title="Enter a valid registration
  first"` was the only explanation for two disabled buttons, and `title` has no
  touch or keyboard equivalent — on the phone this screen runs on, it did not
  exist. The title stays for pointer users; the visible lines are the real
  affordance.

**This diverges from the frozen contract, deliberately, and the divergence is
not pixel-gated.** `design/source/boa_design_v2.html` draws the result panel
blank until a verdict exists. The vehicle reference is captured on the settled
`Cleared` result (`scripts/visual-check.mjs`, `GATE_CAPTURE_STATE.vehicle`), and
the post-press branch of the screen was left untouched, so the gated shot cannot
move — verified, not assumed: Vehicle measured **0.38/0.39/0.21/0.22%** at exact
dimensions after the change, against 0.39/0.39/0.21/0.22% before it. The blank
pre-decision panel is therefore a state the contract draws that the app no
longer draws, in the same class as ADR-019's and ADR-021's removals, and
non-negotiable #1 continues to hold for everything both still draw.

Roadmap: ACC-159. Depends on ACC-109/ACC-164 having made the reference current.

## ADR-023 — Master list gets table semantics and a count, not a visible header row

**Accepted 27 Sep 2026, on Vipin's instruction** (ACC-162), from the three
options put to him: semantics and a count only, a visible header row as well, or
leave it alone. He chose **semantics and a count**, explicitly to protect a
passing gate.

The defect had two halves. Master list is eight columns of data with **no header
row**, so a desk volunteer arriving on 5 Oct has to infer that `#0412` is a band
serial and `KA 05 MJ 8871` is a vehicle. And it is `div`s, not a table
(`tables: 0` when the DOM is probed), so a screen-reader user gets a flat list
with no row or column semantics and no way to navigate by column. Separately,
nothing said how many of 612 rows were on screen, filtered or not.

The tension: **master is the one v2 screen passing `test:visual`** (0.54 / 0.56 /
0.15 / 0.14% when this was written), and the frozen contract draws no header row.
Anything visible added to it spends that.

What was done, all of it at **zero pixel cost** — verified, not assumed: master
measured 0.54 / 0.56 / 0.03 / 0.04% before *and after*, at identical dimensions.

- **The rows are an ARIA table**: `role="table"` on the panel, `role="row"` per
  `.mrow`, `role="cell"` per cell, and a `role="row"` of six `columnheader`s
  naming every column. The header row is `.sr-only`, which is
  `position:absolute` and therefore **out of flow**, so it has real presence in
  the accessibility tree and none in the layout. The six names match `.mrow`'s
  six grid columns in `app/v2.css`; changing one without the other is a defect.
- **The table is only a table when it has rows.** `role="table"` is applied only
  in the success state — an empty or loading ARIA table is worse than no table,
  because it promises structure that is not there.
- **`masterCountLabel(shown, total)`** (`lib/format.ts`, pure and unit-tested)
  reads "Showing 14 of 612 people", and says **"All 612 people"** rather than
  "612 of 612", which reads as a filter that happens to match everyone. It is
  the table's accessible name, so it is announced whether or not a filter is on,
  and it is drawn beside the existing filter banner, which is the case where a
  sighted operator is actually being misled about how much they can see.
- **`total` is a new field on the master response.** The route already reads
  every person to build `rows`, so it is counted the same way — a person whose
  org is missing is not a row and is not in the total — and costs no extra query.

**What this deliberately does NOT fix, and who owns it.** A *sighted* volunteer
still has no column names; only a visible header row gives them that, and that
is the option Vipin declined in order to keep the gate green. So the 5 Oct
orientation problem is solved for screen-reader users and for "how much am I
looking at", and **not** for "which column is this". If that is wanted before
5 Oct it is a fresh decision, and it costs: master's reference must be
re-captured and the screen re-measured to 0.8% on four variants. Recorded here
rather than quietly left out of the task.

Roadmap: ACC-162. Related: ADR-021 (Master list is the one place people are
listed), ACC-154 (the filter banner this count sits beside).

---

## ADR-024 — Passes are delivered through Interakt, not Meta's Cloud API directly

**Accepted 27 Sep 2026, on Vipin's instruction**, from three options put to him:
add a payment method and keep Cloud API as ACC-144 built it; switch to
Interakt's API; or inspect Interakt's dashboard before choosing. He chose the
switch. This supersedes the delivery half of **ADR-019** and the "Cloud API"
statement in ARCHITECTURE.md. It does **not** touch the ledger, the send record,
or the RPCs.

### Why the direct path stopped

ACC-144's code was finished and unit-tested against Meta's Graph API, and it
cannot send. Meta disables **Send message** on a production number with:

> Missing payment method. Add a valid payment method to send business-initiated
> messages using a production phone number. You can respond to the first 1,000
> user-initiated conversations each month for free.

BOA's WhatsApp accounts are already held by BSPs — **Haptik has Full access to
both**, **AiSensy** is a second partner, the credit lines belong to them, and
per Salman BOA pays **₹4,000/month** for Interakt (Haptik's product). Adding a
BOA card would have been a second payment relationship beside one already being
paid for. See docs/WHATSAPP.md for what was read in the console.

### What was weighed

- **Add a card.** Cheapest in engineering — zero code — and the send path was
  already written and tested. Rejected: it pays twice, and the account's billing
  is not BOA's to restructure two weeks before the show.
- **Invert to reply-on-contact** and live inside Meta's 1,000 free
  user-initiated conversations a month, which the 612-person roster fits inside.
  Rejected: it is a different product — the crew must message first — and a
  larger change than the one chosen.
- **Interakt's API.** Chosen. The subscription, the number, the templates and
  the billing already exist and work; BOA's ticket marketing runs on them today.

### What this costs, stated plainly

The direct path was **finished code with a billing blocker**. This is **new code
against an API nothing in this repository has ever called**, 13 days before the
show. That trade was made with the cost named, not hidden.

### What is verified, and what is not

Verified in Interakt's dashboard and docs on 27 Sep (docs/WHATSAPP.md has the
detail): API access is on BOA's plan at 600 req/min; the send endpoint,
auth header, payload and response shape; and — the capability the whole design
depends on — **`buttonValues` carries a dynamic URL**, so each person's pass
token can be the button's link.

**Not verified, and load-bearing:** the webhook payload's shape, how Interakt
authenticates its callbacks, and whether BOA's plan tier includes webhooks at
all (the toggle is on, which is suggestive, not proof). Interakt's docs are
explicit that **a send's status never comes back in the response** — it arrives
only by webhook. So until the webhook is understood, a pass can be sent and
**its status cannot be known**.

### Consequences

- `lib/interakt.ts` is the new send client. `lib/whatsapp.ts` **stays** until
  Interakt is proven end to end: it still owns the Meta webhook route, and
  deleting a working fallback to make room for an unproven path is how the
  gate would be lost.
- `/api/whatsapp/webhook` verifies Meta's `X-Hub-Signature-256`. Interakt does
  not send it. That route must be **replaced, not adjusted**, and Interakt must
  not be pointed at it before then.
- The send record stores a provider message id and moves status on webhook
  events. That shape is unchanged; only the id's issuer changes.
- The one-tap `wa.me` link stays the fallback, as in ADR-019.
- New env vars: `INTERAKT_API_KEY`, `INTERAKT_TEMPLATE_NAME`,
  `INTERAKT_TEMPLATE_LANG`. Server-only, never `NEXT_PUBLIC_`, set by Vipin.

Roadmap: ACC-144, ACC-151. Supersedes the delivery mechanism in ADR-019.

## ADR-025 — The public pass leads with the woven band artwork

**Accepted 27 Sep 2026, on Vipin's instruction** (UX audit, `docs/ux-audit.md`
UX-01 / §5 B1). Applies to `/p/[passToken]` only. It is a documented
divergence from the v2 pass card, which shows the tier as a tinted text box
(`.bandbox`); v2 remains the pixel contract everywhere else (ADR-017). No
`test:visual` screen changes — the public pass is not one of them.

### Why

The steward's check is a picture match: the band on the wrist, the zone sheet
on the wall, the band on the phone. The printed pack (ADR-018) gave every tier
a distinct woven artwork; a text label in the tier colour is slower to match
and trivially edited in a screenshot. The artwork is also the only strong,
festival-specific visual the product has besides the poster.

### What

- A strip of the tier's band across the top of the card, full bleed, cropped
  to its first ~60% at 10:1 (tier name, horns, BANGALORE mark) so it is ~34px
  tall on a phone rather than ~20px for the whole 17:1 band.
- The same artwork tiled and tilted behind the page at low opacity under a
  scrim. The card is a solid surface: **no text sits on the artwork.**
- The tier name stays as text (`.bandbox`, box removed): the General
  Admission band prints no tier name, and the image's `alt` is not enough for
  a sighted steward.
- The card is one surface under the band (the shared bezel's inner panel and
  hover lift are switched off on this page).

### Assets — placeholders

`public/assets/bands/<tier>.webp`, keyed by `TierCode` (`bandArtSrc()` in
`lib/design.ts`), derived at build time by `scripts/extract-bands.mjs` (in
`build`, like `extract-assets.mjs`; `public/assets/` is gitignored). Until
ACC-171 delivers the 3900×236 masters, they are cut from a 2000px JPEG of the
printed Festival Area sheet (`design/assets-source/zone-festival-area.jpg`) —
correct, but soft. Commit the masters as `design/assets-source/bands/<tier>.png`
and the script uses them instead; no code change.

Not in this ADR: the same strip on the gate result (ACC-174b), the WhatsApp
header card (ACC-175), zone squares on the pass (ACC-168).

Roadmap: ACC-174, ACC-171.

### Amended 28 Sep 2026 — the ticket (round 6)

After seven rounds of mockups (`design/proposals/ux-directions-r*.html`),
Vipin chose round 6 for the pass. It replaces the strip-and-tiled-backdrop
layout above:

- The festival poster covers the page (a 900px WebP, `pass-poster.webp`,
  derived at build time; the 2.4 MB PNG is too heavy for a link opened from
  WhatsApp). The card is a dark glass ticket over it, with the band strip as
  its top edge at 62% opacity, a notched tear line, and the QR in the stub.
- **One screen, no scrolling**, inside WhatsApp's in-app browser: verified at
  390×706 on live Stage (four zones) and AAA passes.
- Name; organisation and role as one line; the tier in its band colour beside
  the day; only the zones held, in the printed zone map's colours
  (`ZONE_MAP_HEX`); "All zones" for AAA.
- **No photo-ID or after-22:00 qualifiers on the pass** (Vipin). They remain
  in `ZONE_ACCESS`, on the printed sheets and at the gate.
- The pass no longer tells every tier to go to "the crew check-in desk"
  (part of ACC-167); the one fine-print line is "Bring photo ID. One person,
  one pass, one band."
- A slow light sweep (React Bits' GlareHover, adapted to run without hover,
  hand-written CSS, no dependency) marks a live pass; off under reduced motion.

### Amended 28 Sep 2026 — the desk pass sheet uses the same ticket

`/desk/passes` now renders `components/pass-ticket.tsx` (variant `sheet`:
solid, no light sweep, dark in either desk theme, white on paper) so the
holder's pass and the desk's copy cannot drift. The WhatsApp row under each
ticket is unchanged: status, **Send/Resend** (Interakt; shown only when
sending is configured and the role may send; resend asks first), and
**One-tap** (the `wa.me` fallback that opens WhatsApp with the message
pre-written). **This diverges from the v2 pass-sheet contract** — Passes is
a `test:visual` screen, so its reference numbers will move when that suite
can next run (it needs ACC-090a's operator).

### Amended 29 Sep 2026 — the holder's page no longer shows the band artwork

**On Vipin's instruction: the band artwork is confidential.** The page a crew
member receives (`/p/[passToken]`, ticket variant `live`) no longer draws the
band strip; `TicketFace` takes a `showBand` prop and `PassTicket` passes
`variant !== 'live'`. This applies to the holder's page **only**. The desk's
pass sheet (variant `sheet`) and the gate's result panel (`GateTicket`) keep
the band, as the steward's picture match at the gate depends on it. The
"woven band as the top edge" sentence above no longer holds for the holder's
page; the tier is still shown in its colour and as text.

**Not solved by this change, stated plainly:** the band files are still
served publicly from `/assets/bands/<tier>.webp`, because the desk and the
gate use them (the gate precaches them for offline). Anyone who knows that
path can fetch them. Making them private means serving them behind the login
and changing the gate's offline cache; that was not decided. The festival
poster behind the holder's page (`pass-poster.webp`) is unchanged.

**Verified:** in a browser at `/p/<a real token>` the page has no `.tk-band`
element and loads no `/bands/` image; `typecheck` and the 295 unit tests pass.
**Not verified:** the phone-width view, `test:visual`, or a deployed page.

## ADR-026 — Sign-in: the poster, and a quiet form beside it

**Accepted 28 Sep 2026, on Vipin's instruction** (round 4 of
`design/proposals/`, the UX audit's UX-06 to UX-11). `/desk/login` is not a
design-contract screen (no `test:visual` reference), so this changes no gate.

- **Desktop:** the festival poster fills the page left of a 560px solid
  panel. Nothing is written on the poster. The panel holds the logo, one
  heading, one sentence saying who the page is for, the form, and a help line.
- **Phone:** the poster fills the top of the screen and the form is a sheet
  rising over its lower half, so the figure's face stays in view.
- **Headings:** "Sign in" (desk), "Gate sign in" (arriving from `/gate`),
  "Set your password" (invite), "Choose a new password" (recovery — it used
  to tell a recovering user "this is your first sign-in"), "Reset your
  password" (forgot).
- **Behaviour:** the forms are `noValidate`; every message, including an
  empty submit, arrives in the same inline `role="alert"` line instead of a
  browser tooltip. The "minimum 8 characters" hint shows only when setting a
  password. The pill tag and "Accred / desk" micro-wordmark are gone.
- **Help line** is plain text until ACC-173 gives the desk a number; no dead
  link.
- **Assets:** `login-poster.webp` (1600w) and `pass-poster.webp` (900w) are
  derived at build time by `scripts/extract-bands.mjs` from the poster PNG.
- **Motion:** the poster settles and the panel lifts in once; both are off
  under reduced motion.

Still dark by default like every page: the theme toggle is not persisted
anywhere yet, so the audit's UX-10 (login ignores the gate's theme) was about
the whole app, not this page.

Roadmap: ACC-176. The footer is ACC-176b.

### Amended 28 Sep 2026 — the footer (ACC-176b, round 4)

`components/site-footer.tsx`, on every desk and gate screen: the logo and
"Show 10 Oct 2026" in Anton (the date in gold), then Build / Need help /
Your data in gold Oswald heads over Archivo, and a base row naming who is
signed in beside rocknrolloriginals.com. It replaces the v2 footer's two
lines of staff policy, which this ADR accepts as a divergence from the v2
contract on the `test:visual` screens that carry the footer. Help stays
plain text until ACC-173. The gate's base row shows the operator, not sync
status: the gate's sync state already lives in its own header strip.

## ADR-027 — r10 replaces v2 as the pixel contract

**Accepted 28 Sep 2026 by Vipin (ACC-178).** Body font: Instrument Sans.
The baseline regeneration in point 3 is sanctioned once per screen, after his
side-by-side sign-off. Until ACC-179 lands, the tooling still reads v2.

**Context.** The UX audit (`docs/ux-audit-r2.md`, 28 Sep) scored the v2 build
at 26/40 and found 37 issues. The worst of them: the gate result falls below
the fold at 390px (F-01), light-mode text is at 3.3:1 (F-14), and every cold
screen is a dead end (F-36). Vipin then reviewed the proposals round by
round (r8 to r10.5) and chose a direction. It keeps v2's bezel border and
its green active nav, and adds a mild liquid-glass layer, a darker ground
with a green corner, the poster-led Control room hero, filter chips, and
glass sheets.

**Decision.**
1. `design/source/r10/` (frozen from `design/proposals/r8*` by ACC-179)
   becomes the pixel contract. `DESIGN.md` is its written spec. Non-negotiable
   #1 in CLAUDE.md and AGENTS.md changes to say so.
2. The pixel clause of ADR-017 is superseded. Its domain clause is not: v1
   (`boa_design_body.html`, `boa_design_bundle.html`) stays the authority for
   `TYPES`, `ALL_ZONES`, the `PROP` literals and the C8 two-layer
   disagreement. `tests/unit/design-contract.test.ts` keeps reading v1.
3. `test:visual` becomes a regression gate. Once Vipin signs a screen off, its
   reference is regenerated from the built app (ACC-191) and held at ≤0.8%.
   Fidelity to the proposal is judged side by side, at 1440 and 390, by
   Vipin. The proposal renders invented data, so a script cannot compare the
   two honestly.
4. While a screen is migrating, its `test:visual` fails against the old v2
   reference. That is expected. It is recorded in the commit, and the
   reference is not edited early.
5. Screens migrate one at a time under a `.r10` root class. v2 CSS is deleted
   only after the last screen moves (ACC-192).
6. ADR-025 (the pass), ADR-026 (sign-in) and ACC-176b (the footer) keep their
   layouts. They move onto r10 tokens only.
7. The gate's behaviour is untouched (non-negotiable #7). The gate gets no
   backdrop blur. If `/gate` is not green by Sat 3 Oct 18:00 IST, it ships on
   v2, and that is not a failure of this ADR.
8. New dependencies: `motion`, and the chosen body font from `@fontsource`.
   React Bits components are copied in as TS-CSS source, not installed. There
   are no WebGL libraries and no second icon family.

**Consequences.** `check-design-tokens.mjs` check 1 reads two sources while
screens migrate (v2 for `app/globals.css`, r10 for `app/r10/tokens.css`), and
only r10 after ACC-192. The plan, lanes and agents are in
`docs/REDESIGN.md`. Roadmap: Phase RD, ACC-178 to ACC-193.

## ADR-028 — The roster import creates new organisations and forgives typos

**Accepted 29 Sep 2026, on Vipin's instruction** ("add new ones automatically,
just look for typos and punctuation"). It reverses the "anything unmatched is
reported by row, never guessed" half of ACC-142; the alias file stays.

**The rule.** An Organisation answer that matches no org and no alias goes
through `reconcileOrganisations` (`lib/roster-import.ts`):

1. Same *loose key* as an existing org (case, accents, punctuation, `&` for
   `and`, a leading "The", a trailing "Pvt Ltd") → merged.
2. One typo (two from 16 characters) in a name of 10+ characters, digits
   identical, and exactly one candidate → merged. **Short names are never
   fuzzy-matched** ("Stage A" is not "Stage B"). A typo equally close to two
   orgs is **refused**, not guessed.
3. Otherwise a **new organisation**, created as the loading operator: kind
   `crew`, default tier `crew`, quota 500 (there are no quotas, ACC-140g), and
   the org's first person in the sheet as its contact. Spellings of one new
   name collapse to the most-used one.

**Why merging is the careful side.** A wrong merge puts someone on another
organisation's roster; a wrong creation leaves a stray org that the desk can
fix. So the fuzzy layer is conservative and the create layer is not.

**What it cannot do:** abbreviations and nicknames ("BOA" for "Bangalore Open
Air") look like new organisations. They still need a line in
`data/org-aliases.json`. Every merge and creation is printed, so a wrong one
is visible before it is loaded (`--dry` lists them without writing).
`--no-create-orgs` restores the old rule.

**Verified:** 45 unit tests (`tests/unit/import-roster.test.ts`), a dry run,
and a real load on 29 Sep that created two orgs ("Reflections of Darkness",
"German Embassy") through `boa_acc_create_org` as the operator and loaded their
rows. "BOA" was added to `data/org-aliases.json` by hand (an abbreviation).

## ADR-029 — Phone numbers from any country; the app sends to Indian numbers only

**Accepted 29 Sep 2026, on Vipin's instruction** ("add all international
numbers as well; there will be more foreign members"). It ends the Indian-only
phone rule that sat in the schema from `202609110001`. Row 32 of the live
response sheet was a `+971` number the loader refused for that reason alone.

**The rule.** A phone is E.164: `+`, then 8–15 digits, no leading zero. A `+91`
number must still be an Indian mobile (6–9, then nine digits), so a mistyped
Indian number is refused exactly as before. Enforced by the `CHECK` on
`boa_acc_person.phone`, `boa_acc_org.contact_phone` and
`boa_acc_aaa_nomination.phone`, and by the phone test inside
`boa_acc_import_approve`, `boa_acc_import_roster` and `boa_acc_nominate_aaa`
(migration `202609291000`). Existing rows stay valid.

**Reading a sheet value** (`normalisePhone`, `lib/roster-import.ts`): 10 digits
starting 6–9 → `+91`; `+…` or `00…` → international as typed; 11–15 bare digits →
a country code is already in front (`971501234567` → `+971501234567`). **Any
other 10-digit number is refused, not guessed**: a US number typed without `+1`
looks exactly like a wrong Indian one.

**Sending.** The app's WhatsApp send goes through Interakt, which wants the
country code split out (ADR-024); splitting an arbitrary number correctly needs
a library and a real foreign test number, neither of which exists yet. So
**Send skips non-Indian numbers**: `sendPassTemplate` returns "International
number: send this pass by hand (one-tap link)" without calling Interakt, and
`boa_acc_pass_send_unsent` no longer lists them, so "Send all unsent" never
touches them. The desk's one-tap `wa.me` link works for any country and is how
these passes are sent (Vipin: "we'll send the pass to foreign numbers manually").

**Alternatives.** Add `libphonenumber-js` and send everywhere through Interakt:
rejected for now, no way to test it. A hand-made calling-code table: rejected,
wrong splits are silent.

**Verified:** typecheck; 306 unit tests (number reading, the send guard, the
form pattern); the migration in a rolled-back dry run, then applied; `test:db`
green, including the new `supabase/tests/international-phones.test.sql` (11
checks: international accepted for person/org/nominee, bad `+91` and
leading-zero refused, unsent excludes international); a real load in which the
sheet's `+971` row is now an approved person. **Not verified:** a WhatsApp
message to any foreign number, and the gate's phone search on one (it matches
trailing digits, so it should work). **The live Google Form still refuses `+`
numbers**: `build-roster-form.gs` was changed but the live form was not; it is
edited by hand or the script re-run.

