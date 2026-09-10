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
a non-approved person, asserted as a named behaviour; PITR access restricted.
**Residual risk: a database backup leaks every live pass token.** Accepted.

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

## ADR-007 — Not a PWA; one service worker scoped to `/gate/`

**Accepted 10 Sep 2026**, on the user's instruction that this is a responsive web
app.

No manifest, no install prompt, no update UI. The single service worker is
registered only from `app/gate/layout.tsx` and scoped to `/gate/`.

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
