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
loses the camera, so the aeroplane-mode test asserts a decode with CSP
**enforced**, not disabled.

---

## ADR-007 — Not a PWA; one service worker scoped to `/gate`

**Accepted 10 Sep 2026**, on the user's instruction that this is a responsive web
app.

No manifest, no install prompt, no update UI. The single service worker is
registered only from `app/gate/layout.tsx` and scoped to `/gate`.

It is not optional there: without it, a volunteer who reloads a phone with no
signal gets a white screen instead of a scanner, and the spec calls aeroplane-mode
scanning *"a test, not a nice-to-have"*. This is why all three `/gate` routes are
`force-static` with zero server data — static HTML is a file a service worker can
precache by URL.

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

## ADR-013 — The "v2 Readiness Plan" is a gap list, not a replacement source of truth

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
schema change is needed for that. What ADR-013 changes is only that this is
now stated explicitly and proven by a test (`admin_reach.test.sql`, ACC-0
scope below) rather than left to be discovered by trying. "Salman approves
AAA" (the 10-Sep decision, restated in v2) remains the **named, intended**
workflow — it describes who does it operationally, not a database
restriction on who is capable of it.
