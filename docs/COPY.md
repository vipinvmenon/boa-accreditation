# Copy inventory

**A note on the task ID before anything else.** This was requested as ACC-036.
`docs/ROADMAP.md` has no ACC-036 — task IDs run ACC-030 → ACC-033, then jump to
ACC-040 (nothing in between exists anywhere in the repo: migrations, tests,
`CURRENT-STATE.md`, none of it). Per `CLAUDE.md` ("the roadmap decides the
order, not you... if the order is wrong, say so — do not quietly reorder it"),
this document does not invent a roadmap entry to match, and `corepack pnpm
task start/done` was not run against a nonexistent ID (it refuses: "ACC-036
is not in docs/ROADMAP.md"). The underlying deliverable — a copy inventory,
design-contract vs shipped, in the deck's voice — stands on its own regardless
of ticket numbering, so it was built anyway. Whoever owns the roadmap should
either fold this into a real task ID or confirm none was needed.

## Method

For each screen: what `design/source/boa_design_body.html` says (transcribed
exactly, quoting the literal string — sample data in the design's own inline
`<script>` fixture where a label is templated), what the shipped `.tsx`
actually renders (read from the file, not paraphrased), and a verdict:
**identical** / **rewritten-intentionally-because-X** / **drifted
unintentionally**.

The design source defines exactly 7 screens (`data-screen-label` in
`boa_design_body.html`): Control room, Approval queue, Master list,
Submission form, Passes, Gate scanner, Vehicle gate. These map to `/desk`,
`/desk/queue`, `/desk/master`, `/s/[token]`, `/desk/passes`, `/gate`,
`/gate/vehicle` — the same 7 `scripts/visual-check.mjs` pixel-gates. Every
other shipped route (`/desk/login`, `/desk/orgs`, `/desk/aaa`,
`/desk/devices`, `/desk/operators`, `/gate/setup`) has no design-source
counterpart; their copy is ours to write, and several already say so in their
own file comments (`/desk/login`'s docstring is explicit: "Not part of the
approved design").

Current route list, confirmed by reading `app/` directly rather than trusting
the roadmap: `/`, `/s/[token]`, `/desk/login`, `/desk`, `/desk/queue`,
`/desk/orgs`, `/desk/passes`, `/desk/aaa`, `/desk/devices`, `/desk/master`,
`/desk/operators`, `/gate`, `/gate/setup`, `/gate/vehicle`, plus
`/auth/confirm` (an interstitial, not one of the 7).

---

## 1. Submission screen — `/s/[token]` (full detail; near-term deadline)

`app/s/[token]/submission-screen.tsx`'s own comment states it transcribes
`design/source/boa_design_body.html` lines 246–317 plus the shared footer at
556–559. Verified against both by direct read.

### Design-contract copy (`isSubmit` block, lines 246–317)

| Element | Design source | Shipped (`submission-screen.tsx`) | Verdict |
|---|---|---|---|
| Eyebrow | "Public · token link" | "Public · token link" | identical |
| H1 | "Register your crew" | "Register your crew" | identical |
| Intro paragraph | "No account, no login. The token in the link is the credential and scopes to one organisation. Name, phone, role, vehicle — nothing else is collected." | same, verbatim | identical |
| "Registering for" label | literal | literal | identical |
| Org name | sample fixture "Chakra Sound & Light" | `{org.name}` (real data) | identical structure, intentional — design's sample data replaced by the real value, no RPC exists to feed anything else |
| Seat counter | sample "14 / 22 SEATS USED" | `{org.used} / {org.quota} SEATS USED` | identical structure, same reasoning |
| "Add a person" label | literal | literal | identical |
| Field: Full name | label "Full name", placeholder "As it appears on their ID", hint "Exactly as on their ID. No initials." (from the design's own `formFields` script data, line 728) | identical, byte-for-byte (`FORM_FIELDS` const) | identical |
| Field: Mobile | label "Mobile", placeholder "+91", hint "Used only to resend their pass." (line 729) | identical | identical |
| Field: Role | label "Role at the festival", placeholder "Rigger, FOH engineer, loader", hint "Free text is fine." (line 730) | identical | identical |
| Vehicle toggle | "Bringing a vehicle" / "A sticker is issued at check-in, tied to this number only." | identical | identical |
| Vehicle reg field | label "Vehicle registration", placeholder "KA 05 MJ 8871" | identical | identical |
| Toggle default state | shown ON (green, reg field open) with sample plate `KA 05 MJ 8871` filled in | starts OFF, empty | **not drift** — the design's static mock is illustrating what the expanded state looks like, not specifying a default; `KA 05 MJ 8871` is sample fixture data used consistently across the whole design bundle (also appears in the gate/vehicle mocks), not a real placeholder value shipped anywhere |
| Primary button | "Add to list" | "Add to list" | identical |
| Secondary button | "Submit 14 for approval →" (implies a batch submit of a local draft) | replaced with a **non-interactive** live readout: "`{used}` added so far — the desk approves later" | **rewritten-intentionally** — documented in the file's own header comment and `docs/CURRENT-STATE.md` (ACC-032): `boa_acc_submit` has no draft/batch concept, every `Add` call is already final. Keeping a second button that says "Submit N for approval" would be actively misleading (implying an unsent draft that does not exist). This is the correct fix, not a shortcut. |
| "Your list" label | literal | literal | identical |
| List row | name / role / status dot / state text | identical structure, `state: 'Submitted'` always (design shows sample "Approved" states, which don't exist yet from this screen's own submissions — a submission is never auto-approved) | identical where it can be; the design's sample "Approved" state is fixture data, not a real state this screen can ever show (approval happens later at the desk) |
| Footer left | "Not registered, not approved, not verified — not inside." | identical | identical |
| Footer right | "Artists handled at the hotel" | identical | identical |
| Persistent desk nav/BMS status bar | present in the design bundle around every screen | **deliberately omitted** on this screen | **rewritten-intentionally** — file comment explains: it's public/unauthenticated review-bundle chrome (same category as the WEB/MOB/LIGHT toggle DESIGN-SYSTEM.md excludes), must not leak desk nav or live ops numbers to an anonymous token holder. `scripts/capture-design-reference.mjs` hides the same chrome when capturing the reference, so the ≤0.8%/32% (ADR-009) visual ceiling already accounts for it. |

### Copy that is ours to write (not in the design source at all)

None of this exists anywhere in `boa_design_body.html` — grepped for
"error"/"failed"/"unable"/"could not"/"went wrong" and found zero hits in the
whole file. Every string below is invented, and none of it was checked
against a design precedent before this pass.

| Code | Before this session | After | Verdict |
|---|---|---|---|
| `not_found` | "This link is no longer valid." | unchanged | fine — terse, declarative, matches deck voice |
| `org_closed` | "Registration for this organisation is closed. Nobody else can be added — contact the accreditation desk." | unchanged | fine |
| `quota_exceeded` | "This organisation's quota is full. Contact the accreditation desk to raise it." | unchanged | fine |
| `rate_limited` | "Too many attempts from this link — wait a moment and try again." | unchanged | fine |
| `duplicate_phone` | "`{phone}` is already registered for this organisation. No action needed — they are already on the list." | unchanged | fine — specific, not generic, correctly separated from the generic table because it needs the actual phone typed |
| `invalid_body` | **"Check the highlighted fields and try again."** | **"Check what you typed and try again."** | **real, unintentional drift, now fixed.** The form has no field-level error highlighting anywhere in the code — no red border, no per-field state tied to validation failure. The message promised a visual cue the screen has never had. Rewritten to something the screen can actually back up. |
| `internal` | **"Something went wrong. Try again."** | **"That didn't go through. Try again."** | **real, unintentional drift, now fixed** — see the app-wide finding below |
| Success confirmation | "`{name}` added. Nothing else to do — the desk approves at check-in." | unchanged | fine — matches the deck's declarative register ("Nothing else to do" reads like "THREE OUTCOMES. NO FOURTH.") |
| Closed-org banner | "This organisation is closed. Registration will not reopen by retrying — contact the accreditation desk if this is wrong." | unchanged | fine |
| Quota-full banner | "This organisation's quota is full. Contact the accreditation desk to raise it." | unchanged | fine |
| Empty list state | "Nobody added yet in this session." | unchanged | fine — terse, matches voice |

---

## 2. App-wide finding: the generic `internal` fallback

`grep -rn "Something went wrong"` across `app/` turned up the **identical**
literal `'Something went wrong. Try again.'` as the `internal`/fallback error
string in **six** files, independently duplicated rather than shared:

- `app/s/[token]/submission-screen.tsx`
- `app/desk/control-room-screen.tsx`
- `app/desk/orgs/orgs-screen.tsx`
- `app/desk/aaa/aaa-screen.tsx`
- `app/desk/queue/queue-screen.tsx`
- `app/desk/devices/devices-screen.tsx`

This is exactly the generic, apologetic register the task brief called out by
name ("Something went wrong", "Success!") as *not* the deck's voice. Every
other error string next to it in the same files is specific and declarative
("Only a lead or admin operator can do this.", "That org no longer exists.",
"The expiry must be a real time in the future.") — the `internal` fallback was
the one string in each file that didn't match its neighbours.

**Fixed in all six files**: `'Something went wrong. Try again.'` →
`"That didn't go through. Try again."` — still generic by necessity (it's a
catch-all for an unclassified server error, so it can't name a specific
cause), but active/declarative rather than passive/apologetic, and consistent
with the terse register everywhere else in these files. Pure string-literal
edits; no logic, layout, or structure touched.

`app/desk/master/master-screen.tsx`'s two error paths ("Unable to load the
master list.") were already specific and were left alone.

---

## 3. Design-matched desk/gate screens (lower priority per roadmap — real pass, not exhaustive line-by-line)

Spot-checked the load-bearing headline copy on each of the remaining 6
design-matched screens directly against `boa_design_body.html`. Not every
`{{ variable }}` slot was individually diffed the way Submission was (that is
the one with the near-term deadline); this is a real check of headings,
button labels, and standing copy, not a placeholder pass.

### Control room — `/desk` (`app/desk/control-room-screen.tsx`)

| Element | Design | Shipped | Verdict |
|---|---|---|---|
| H1 | "Nobody walks in unlisted" | identical | identical |
| Hero paragraph | "Every person working at BOA is registered individually, approved against the master list, and checks in physically for their own wristband. Every vehicle is registered to a plate and carries a sticker bound to it." | identical | identical |
| CTA buttons | "Clear the queue `{n}`" / "Open the gate scanner" | identical | identical |
| Wristbands section | "Three bands. No fourth." / "Type is assigned at approval and sets the band colour and the zones. Serials are typed in at the gate as bands are handed over, never pre-assigned." | identical | identical |
| AAA override | "AAA override" / "All-areas access is not requestable on the vendor form. The accreditation lead stamps it onto an approved pass from a named list." / "`{n}` issued of `{n}` approved." / "Manage list →" | identical, real data wired (`dash.aaaStamped`/`dash.aaaNominatedApproved`) | identical |
| Organisations | "Organisations" / "`{n}` compan{y/ies} on site" (design's sample: "38 companies on site") | identical structure, correct pluralisation for `n=1` | identical |

No drift found. This screen is a faithful transcription with real data
correctly wired in place of the design's fixture numbers.

### Approval queue — `/desk/queue` (`app/desk/queue/queue-screen.tsx`)

| Element | Design | Shipped | Verdict |
|---|---|---|---|
| Eyebrow / H1 / intro | "Allocation desk" / "Approval queue" / "Approve a row, approve a whole organisation, or reject with a reason. Pass tokens generate on approval — nothing before." | identical | identical |
| "Approve all →" | literal | identical | identical |
| "Approve selected" | literal | identical (per-row: "Reject", per-org: "Approve all →") | identical |
| Reject flow | design shows a bare "Reject" button with no visible reason-capture UI | shipped adds a two-step flow: "Reject" → inline reason input + "Confirm reject" | **rewritten-intentionally** — the reject RPC requires a reason (`ACC-041`/`docs/DATA-MODEL.md`), so *something* has to collect it; the design's static mock doesn't show the interaction, only the resting state. Not a copy deviation so much as a necessary UI addition the static mock couldn't depict. |

### Master list — `/desk/master` (`app/desk/master/master-screen.tsx`)

| Element | Design | Shipped | Verdict |
|---|---|---|---|
| Eyebrow / H1 / intro | "Master list" / "Everyone accredited" / "Append-only. A reissue adds a row, it never overwrites the first. BMS entry is manual — the flag tracks who is still to be added." | identical | identical |
| Search placeholder | "SEARCH NAME, PHONE, COMPANY, BAND SERIAL" | identical | identical |
| "Export CSV" | literal | identical | identical |

No drift found.

### Passes — `/desk/passes` (`app/desk/passes/passes-screen.tsx`)

| Element | Design | Shipped | Verdict |
|---|---|---|---|
| Eyebrow | "The pass" | identical | identical |
| Actions | "Send on WhatsApp" / "Print `{n}` passes →" | identical | identical |
| Card footer | "Bring this and a valid photo ID. Non-transferable. One person = one pass = one physical check-in = one wristband." | identical, verbatim | identical |
| "Vehicle" chip label | literal | identical | identical |

No drift found.

### Gate scanner (`/gate`) and Vehicle gate (`/gate/vehicle`)

**Not independently re-transcribed in this pass** — `docs/CURRENT-STATE.md`'s
session log already documents an extensive, repeated pixel-level audit of
these two screens across multiple dated entries (corner-bracket overlay fix,
the WEB/MOB/LIGHT toggle colour fix, the font-floor 1px cascade, the
sticky-header capture-artifact fix), each cross-checked against
`design/source/boa_design_body.html` directly and measured with
`corepack pnpm test:visual`. Re-doing that here from scratch would either
duplicate real prior work or, worse, silently re-assert a weaker check than
what already exists. Per this file's own rule ("never write a document
asserting a verification you did not perform"), this section defers to that
record rather than re-claiming it.

One direct check performed in this pass: `app/gate/setup/page.tsx` (not a
design screen at all — `/gate/setup` has no `data-screen-label` counterpart)
already reads in-voice — "The gate will not show a scanner over an empty or
stale cache.", "The pull returned no approved passes. The scanner stays
locked." — terse, declarative, no generic fallback found. Left unchanged.

---

## 4. Copy that is ours to write, screen by screen

### `/desk/login` — explicitly not in the design source

The file's own docstring says so directly: *"Not part of the approved design
(design/source/boa_design_body.html has no login screen ... this is a
minimal, on-brand page using the design's own tokens ... not gated by
`test:visual`)."* Confirmed — no login screen exists anywhere in
`boa_design_body.html`.

Reviewed every string: "Desk sign in" / "Set your password" / "Reset your
password" / "Wrong email or password." / "Password must be at least 8
characters." / "Passwords do not match." / "Could not set password. Ask for a
new invite link." / "Could not send a reset link. Try again shortly." / "If
that email has desk access, a reset link is on its way. Check your inbox." /
"That link is invalid or has expired. Ask for a new one." — every one of
these is already specific and declarative, not generic filler. **No rewrite
applied.** Candidate considered and rejected: none of these read like
"Success!" or "Error occurred" — they already name the actual condition.

### `/desk/orgs`, `/desk/aaa`, `/desk/devices` — no design counterpart

All three use the same `ERROR_COPY`/`copyForError` pattern with specific,
named error strings ("An org with that name already exists.", "That
nomination has already been approved.", "The expiry must be a real time in
the future.", "That device no longer exists, or is already revoked.") — the
`internal` fallback was the only generic string in each, fixed above (section
2). No other rewrites made; these already read in-voice.

### `/desk/operators` — no design counterpart

Reviewed briefly (ACC-026b's own `CURRENT-STATE.md` entry documents its
build). "Too many invites sent recently. Try again shortly." is specific and
fine. No rewrite.

### `/gate/setup` — no design counterpart

Covered above; already in-voice, no rewrite.

---

## 5. Summary

**Real drift found and fixed** (6 files, string-literal only, no logic/layout
touched):

- `app/s/[token]/submission-screen.tsx` — `invalid_body` no longer claims
  fields are "highlighted" (they never were); `internal` fallback rewritten.
- `app/desk/control-room-screen.tsx`, `app/desk/orgs/orgs-screen.tsx`,
  `app/desk/aaa/aaa-screen.tsx`, `app/desk/queue/queue-screen.tsx`,
  `app/desk/devices/devices-screen.tsx` — `internal` fallback rewritten from
  "Something went wrong. Try again." to "That didn't go through. Try again."
  in each.

**Checked and left alone** (already in-voice, or design fixture data
correctly not copied verbatim): the vehicle-toggle default state, the
Submission screen's single-button flow vs. the design's two-button mock, the
Approval queue's reason-capture UI, `/desk/login`'s entire copy set, and
every other error/empty string surveyed above.

**Not independently re-verified in this pass**: Gate scanner and Vehicle gate
pixel fidelity — deferred to `docs/CURRENT-STATE.md`'s existing, extensive
session-log record rather than re-asserted here.

**Roadmap gap**: ACC-036 does not exist. See the note at the top of this
document.
