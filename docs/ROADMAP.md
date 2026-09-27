# Roadmap

**Replanned Tue 22 Sep 2026 — see ADR-019. Show day: Sat 10 Oct. 18 days.**

Task IDs are `ACC-nnn`. Commit with the ID: `feat(ACC-024): submission quota`.
One task at a time. **Do not decide what to build next — this file decides.**
A task is not done until its acceptance criteria are met and the gates pass.

Owner column: **V** = Vipin · **C** = the coding agent (Claude/Cursor/Codex) ·
**S** = Sal (DNS) · **B** = Bhoopesh · **SN** = Salman.

## The four dates

| | Date | Day | Meaning |
|---|---|---|---|
| ~~A~~ | ~~20 Sep~~ | Sun | ~~38 invite links go out.~~ **Retired 22 Sep (ADR-019).** Collection is the Google Form, already live. |
| **R** | **Mon 28 Sep** | Mon | First real import: the sheet's decided rows are approved people with passes in the DB. |
| **B** | **4 Oct** | Sun | The gate works offline. First trucks ~5 Oct. |
| Build | 5–9 Oct | Mon–Fri | Load-in. Gate in daily use. |
| **Show** | **10 Oct** | Sat | Freeze from 4 Oct: hot fixes only. |

## Critical path

```
Google Form ─▶ response sheet ─▶ Salman sets "Accreditation Type" (column I)
   ─▶ CSV ─▶ import-and-approve RPC (type + days + pass minted in the DB)   ──▶ R
   ─▶ pass to each WhatsApp number ─▶ up to 10 logged-in issuers (offline) ─▶ B
```

Superseded 22 Sep: `boa_acc_submit ─▶ /s/[token] ─▶ 38 links ─▶ queue`. The
form replaced collection; the sheet replaced the queue. The gate, the ledger
and the passes are unchanged. ADR-019.

Everything else is off the critical path and can be cut. See "Cut order".

---

## ⛔ Blocked on Vipin

These block **all** of Phase 1. Nothing on the critical path can start without #1.

- [x] **ACC-009a** · Publishable + service-role keys into `.env.local` **and**
      into Vercel env vars. **Done 11 Sep** — 15 vars across Production, Preview
      and Development; verified with `vercel env ls`.
- [ ] **ACC-009b** · Authenticate the MCP servers (supabase, vercel, github,
      playwright). Supabase, Vercel and Playwright are authenticated; GitHub
      remains outstanding. **NO LONGER BLOCKING** — migrations run through the
      Supabase Management API using the CLI token, so this is now a
      convenience. **V** · *when convenient*
- [x] **ACC-009c** · `SUPABASE_DB_URL` **verified working locally, 11 Sep.**
      Took two rounds to get right — worth recording so nobody repeats them:
      (1) the password had three literal `@` characters, breaking URL parsing;
      (2) the next paste was missing the `@` between password and host
      entirely. `corepack pnpm db:state` and `corepack pnpm test:db` both ran
      for real against the live Postgres 17.6 over the pooler and passed.
      The GitHub Actions repo secret was updated to the exact working value
      on 12 Sep; its presence was verified with `gh secret list` without
      revealing the value. **V** · *verified 12 Sep*
- [x] **ACC-010b** · Vercel scope confirmed **fine**. `vercel link` reports
      orgId `team_rDgA7v4RmDHjA3gFRapQoccp` — the same team as the siblings. The
      `vipin-menon` slug in the dashboard URL only looks personal. **Done 11 Sep.**
- [ ] **ACC-090a** · Create the `qa-visual` operator at `/desk/users`; set
      `VISUAL_OPERATOR_EMAIL`/`VISUAL_OPERATOR_PASSWORD` in `.env.local` (both
      checkouts) and as GitHub Actions secrets. **No longer blocking (15 Sep):**
      ACC-090's harness measures all desk screens through API fixtures with no
      login; this only adds a real-session pass on top · **V** · *optional*
- [-] **ACC-030a** · The 38 organisations: name, kind, quota, contact name,
      contact phone. **Retired 22 Sep (ADR-019)** — replaced by ACC-140c.
- [x] **ACC-140a** · Column I is the approval. **Decided 22 Sep (Vipin):**
      Salman fills it in the live sheet; a filled cell approves on import.
- [x] **ACC-140b** · AAA (and Artist) are decided by Salman in column I, and
      that is the approval. **Decided 22 Sep (Vipin).** The import records the
      AAA nomination itself; no separate `/desk/aaa` step.
- [x] **ACC-140c** · Organisations matter. **Decided 22 Sep (Vipin):** the form
      went to the BOA team first and will go to the other organisations too,
      so the Organisation answer is kept and matched to a real org.
- [x] **ACC-140d** · Passes are sent **by the app** to each person's own
      WhatsApp number, once their details are complete. **Decided 22 Sep
      (Vipin).** How the app sends is ACC-140f.
- [x] **ACC-140f** · WhatsApp is sent **automatically through the WhatsApp
      Business Cloud API**, from BOA's Meta-verified business account.
      **Decided 22 Sep (Vipin).** The one-tap send is kept as the fallback if a
      template is rejected or the API is down (ACC-144).
- [x] **ACC-140g** · **No quotas for now. Decided 22 Sep (Vipin).** The import
      does not refuse a row for being over a cap; Salman controls numbers
      through column I. The quota column stays in the schema, unused.
- [x] **ACC-164** · **Sanctioned and done 27 Sep (Vipin).** Regenerated at
      `a490c66`; `design/reference/` is gitignored and was never committed, so
      this was a local re-render of the already-frozen source, not a repo
      re-baseline. Gate and Vehicle went green immediately; Control room and
      Passes did not, so ACC-104/107 are real app work, not stale references.
      Original statement of the decision follows.

- [x] **ACC-164a** · **Sanction one regeneration of `design/reference/` from the
      current frozen source.** This is the single decision blocking every
      remaining v2 visual task. `design/reference/` was captured 20 Sep at
      `2d4d6e0`; the frozen source then moved at `418b416` (21 Sep) and
      `052bf93` (24 Sep, ACC-130 deleted both result-panel tab rows), and was
      never re-captured — so the PNGs render a contract two commits old.
      Measured against a reference regenerated from the **current** frozen
      source, **with no application-code change**, Gate is
      0.31/0.32/0.38/0.37% and Vehicle 0.40/0.40/0.25/0.26% — all eight
      variants under the 0.8% bar. The ACC-109 bisection (26 Sep) proves the
      app is not what fails: the 2.5-point "regression" is `app/global-error.tsx`
      reordering CSS chunks (0.56) plus the harness capture being *fixed*
      (1.99), and a capture getting more correct while the number gets worse is
      only possible against a stale reference.
      **This is not a re-baseline and the contract does not move** — it is the
      ACC-100 precedent: re-render the same frozen source that is already
      committed. It is Vipin's call because it also rebases ACC-104/106/107.
      **Blocks ACC-104, ACC-107, ACC-109, ACC-111, ACC-156, ACC-159, ACC-162.**
      Note the hard stop it sits in front of: ACC-109 not green and rehearsed by
      **2 Oct** means reverting the gate to v1 · **V** · *needed now*
- [ ] **ACC-151** · WhatsApp Cloud API setup in Meta Business Manager (Vipin;
      an agent never handles these values): (1) the sending phone number
      registered on BOA's WhatsApp Business Account; (2) a **Utility** message
      template, e.g. `boa_crew_pass`, with the person's name and a URL button
      to their `/p/<token>`, submitted for approval — the agent drafts the
      wording in ACC-144; (3) a permanent **System User** access token, the
      phone-number ID and the WABA ID put into Vercel env vars by Vipin, never
      pasted into chat or committed. Meta bills per template message sent ·
      **V** · *needed Thu 24 Sep*
- [x] **ACC-026b** · Invite-operator UI in the desk app. `/api/admin/invite-operator`
      (ACC-026) has no screen — inviting anyone today means constructing a
      `curl` by hand. Added 12 Sep 2026 on Vipin's direct request after
      comparing against `boa-bar-control`'s `InviteCrewScreen.tsx`; that
      screen's live flow turned out to be the same email-invite +
      self-set-password model accreditation already has, not something
      different, so this is new UI on the existing API, not a new auth
      model. **V** · *added 12 Sep*
- [x] **ACC-028** · `BACKUP_ENCRYPTION_KEY` GitHub secret. Replaces PITR
      (rejected 11 Sep — paid add-on, disproportionate cost for one event) with
      a nightly encrypted `pg_dump`, already built in
      `.github/workflows/backup.yml`. Generate with `openssl rand -base64 32`,
      add as a repo secret, save the passphrase outside GitHub too. See
      `docs/OPERATIONS.md` — Backups. **V** · *by 17 Sep*
- [x] **ACC-009d** · **Not needed — closed 11 Sep.** Conflated two different
      things: Supabase org membership (dashboard/SQL/billing access) vs app
      login (`auth.users` rows, used to sign into `/desk/*`). Bhoopesh, Salman
      and the approvers only ever need the latter, which requires zero
      Supabase org access. The project stays in `otlqwoxbrsshuoebbamj`.
- [ ] **ACC-171** · **Get the eight wristband master files** (3900×236, the ones
      on the "Wristbands — final artwork" sheet) from Rock N Roll Originals, as
      PNG or lossless. The repo has no band art. Blocks ACC-174, ACC-175, the
      band header of ACC-172, and the login art in ACC-176. See
      `docs/ux-audit.md` §5 B1 · **V** · due Tue 29 Sep
- [ ] **ACC-172** · **Fix the printed zone sheets before security is briefed**
      (`docs/ux-audit.md`, "Print collateral"): the Kannada under TURN AWAY
      reads "ಅನುಮತಿ" not "ಅನುಮತಿ ಇಲ್ಲ" on six sheets; two numbering sets
      ("of 5" / "of 6") disagree on Photo at Backstage and Main Stage; the
      master sheet's Artist "+ID for lounges" contradicts the zone sheets and
      `ZONE_ACCESS`. Decide the Artist rule; the app follows the zone sheets
      until told otherwise. Also submit a WhatsApp template with an IMAGE
      header alongside ACC-151 (§5 B2) · **V** · due Thu 1 Oct
- [ ] **ACC-173** · **Decide a desk help contact** for the pass, 404 and
      footer ("Message the accreditation desk"): a WhatsApp number the desk
      will answer on show day. Unblocks ACC-170 · **V** · due Tue 29 Sep

---

## Phase R — The sheet is the front door · Tue 22 – Mon 28 Sep

**Added 22 Sep on Vipin's instruction (ADR-019).** Crew register on the Google
Form; Salman decides each person's tier in the sheet's column I; the app takes
over from the import. **This phase is the critical path to Milestone R.**
Retired tasks below are marked `[-]` and no longer counted.

Decided 22 Sep: ACC-140a–d, f, g (above). Vipin owes ACC-151 (Meta setup). Not blocking:

- [ ] **ACC-140e** · The date the form closes. **TBD (Vipin, 22 Sep).** Not
      blocking: the daily import (ACC-146) runs until it closes · **V/SN**
- [ ] **ACC-026a** · Invite the team from `/desk/users`: Salman and Bhoopesh
      (desk) and up to 10 issuers (ADR-020). **Not a blocker (Vipin, 22 Sep):**
      Vipin is the admin and invites them himself as needed. Issuers must
      have logged in once, with signal, before the rehearsal · **V**

- [x] **ACC-140** · Reconcile the docs with what is live: ROSTER-FORM.md still
      says the import migration is unapplied (commit `a663dc0` applied it); the
      live form carries crew types the committed `CREW_TYPES` does not
      ("Artist Logistics", "Tech Production (Stage)" — write-ins or an editor
      change, find out which). Acceptance: `db:state` shows
      `boa_acc_import_roster`; the doc says what is true; no claim unverified ·
      **C** · due Tue 22 Sep
- [x] **ACC-141** · **Import-and-approve.** A lead/admin RPC that, per row with a
      filled column I, inserts or updates the person and approves them in one
      transaction: `type_code` from column I, `day_validity` from Days on site,
      `pass_token` minted in the database (non-negotiable #5 still holds —
      approval first, same statement). Blank column I → imported as
      `submitted`, never approved. Idempotent on phone: a re-run approves newly
      decided rows and changes nothing else. A **changed** tier on an already
      approved person is reported, never silently applied. Acceptance: pgTAP
      covers approve, blank, re-run, changed-tier, non-lead refused;
      `privileges.test.sql` covers it; mutation of the approve guard fails a
      test. AAA/Artist rows record their nomination as decided in the sheet
      (ACC-140b); the RPC is run by a lead/admin · **C** · due Thu 24 Sep
- [x] **ACC-142** · Organisation column: free text in the live sheet
      ("Bangalore Open Air", "Banglore Open Air", "Bangalore open air").
      Organisations are real (ACC-140c): Vipin adds each org before the form
      reaches it, and the form's Organisation question becomes a dropdown of
      that list (ACC-116) so new orgs cannot misspell. Existing free-text
      answers are matched through a committed alias map; anything unmatched is
      reported by row, never guessed. No quota check (ACC-140g) · **C** ·
      due Thu 24 Sep
- [x] **ACC-143** · Crew-type write-ins: normalise case/space for display
      ("Tech Production (stage)" = "(Stage)"); column I always wins; a row with
      no column I and no mapping stays `submitted` and is listed for Salman.
      Acceptance: unit tests on the live sheet's actual values · **C** ·
      due Fri 25 Sep
- [ ] **ACC-144** · The app sends each approved person their pass on
      WhatsApp, to their own number, through the Cloud API (ACC-140d/f).
      `/desk/passes` shows approved-and-not-sent; **Send** (one person, or all
      unsent) is server-side only, lead/admin only, checked in the database.
      Every send is recorded — who, when, Meta's message ID and delivery
      status from the webhook — so no one is sent twice by accident and no one
      is missed; failures are listed with Meta's reason. The access token is
      server-only (never `NEXT_PUBLIC_`). One-tap `wa.me` send stays as the
      fallback. Nothing fires on zero people. Replaces ACC-137. Acceptance: a
      real template message delivered to Vipin's own number; a rejected send
      shown with its reason; pgTAP on the send record. **Needs ACC-151** ·
      **C** · due Sat 26 Sep
- [x] **ACC-145** · First real import from the live sheet: `--offline`, `--dry`,
      then load, with `db:state` before and after; approved/submitted counts
      reconcile with the sheet row for row; report file committed without
      names or phones · **C/V** · due Mon 28 Sep
- [x] **ACC-146** · The daily loop, written into OPERATIONS.md: Salman decides
      in the sheet → export → import → passes sent → Bhoopesh enters BMS. Runs
      until the form closes (ACC-140e) · **C** · due Mon 28 Sep
- [x] **ACC-150** · **Issuers log in; no device tokens (ADR-020).** Add an
      `issuer` operator role (check in and issue only: no approve, no import,
      no user admin), invitable from `/desk/users`. `/api/gate/*` authorise the
      logged-in operator's session, with the role checked **in the database**
      (non-negotiable #3); every ledger row records the operator. Retire
      `/gate/setup` pairing, `/desk/devices` and the device-token RPCs from
      the app (the migration drops their grants; `privileges.test.sql` proves
      `anon` still has nothing). Offline: log in once with signal; a session
      that lapses offline leaves the outbox queued until re-login (the existing
      401 test, re-pointed at session auth). Acceptance: pgTAP for issuer
      allowed/refused per RPC; aeroplane-mode `test:e2e` green with a logged-in
      issuer; SECURITY.md and ARCHITECTURE.md say what is true · **C** ·
      due Sat 26 Sep
- [ ] **ACC-147** · The check-in desk, for up to 10 issuers: find a person by
      name or phone offline (ACC-131's search), scan the pass, type the band
      serial. Mostly built; acceptance is two issuers doing it on their own
      phones, logged in as themselves · **C/B** · due Wed 30 Sep
- [x] **ACC-148** · **Double-issue warning.** Offline, two issuers can each hand
      a band to the same person; no app can stop that without signal. When the
      phones sync, the server spots two live bands for one person and the
      Control room lists it: person, both serials, both issuers, both times.
      The ledger still records both — nothing is rejected or overwritten
      (non-negotiable #2). Acceptance: pgTAP with two offline issues synced
      in either order; the Control room renders it from the data layer ·
      **C** · due Mon 28 Sep
- [x] **ACC-149** · **Sync as soon as there is signal.** The outbox drains on
      reconnect and on a short timer; the roster re-pulls on a timer while
      online, so a second phone shows amber "already issued" within about a
      minute when the desk has signal. The last-synced time is visible on the
      gate. Acceptance: `test:e2e` with two browser contexts — one issues,
      the other shows amber after sync · **C** · due Tue 29 Sep
- [x] **ACC-152** · **One place lists people (ADR-021).** Added 25 Sep on
      Vipin's instruction, after three separate "what is this screen for?"
      questions with one cause: the same rows were reachable from three
      screens. Remove the Control room's organisations list, keeping the
      company count. Organisations owns the list — contact, status, and
      **sent / approved** replacing a `used / quota` meter showing a cap
      ACC-140g abolished — and its rows open **Master list filtered to that
      org** (`?org=<id>`), not a new screen; delete the empty
      `app/desk/orgs/[orgId]/`. Two dead controls die with the moved section:
      the `25/500` meter and "Needs you first", a `<span>` styled as a link
      with no handler and no keyboard reach. Master list is untouched.
      Acceptance: `test:e2e` for the org link applying the filter and for an
      unknown org id; control-room `test:visual` re-measured and recorded (it
      WILL move — ADR-021 is a deliberate divergence from the frozen
      contract) · **C** · due Sat 26 Sep

- [x] **ACC-153** · **The gate's sticker cache is never written.** Found 26 Sep
      in a walkthrough of the running app. `gateDb.sticker` (plate → sticker,
      holder) is read by the vehicle screen and `stickerForPlate`, and written
      by nothing in `app/`, `gate/` or `lib/` — only by `gate/db.test.ts` and
      the visual harness. `gatePullSchema` carries no stickers either, so on a
      real phone `gateDb.sticker.get(plate)` is always `undefined`,
      `stickerOk` is always false, and **every** vehicle is refused with "No
      sticker is issued to this plate. Not logged." The vehicle gate is a
      turn-away-only device. No migration: the binding is already in the pull
      — a `vehicle_sticker` ledger row names the holder, and their roster row
      names the registration — so `pullGate` derives the cache and writes it
      in the same transaction as roster and ledger. A reissue appends, so the
      latest sticker per plate wins (non-negotiable #2). Acceptance: unit
      tests for the derivation (latest-wins, no registration, unparseable
      registration) and a `test:e2e` that pulls, then clears a vehicle at
      `/gate/vehicle` · **C** · due Sat 26 Sep
- [x] **ACC-154** · **`?in_bms=` is an invisible, inescapable filter.** Found
      26 Sep, same walkthrough. ACC-152 gave `?org=` a banner naming the
      company and a "Show everyone" way out, on the stated principle that a
      filter the operator cannot see is a bug. `?in_bms=` — reached from the
      "N not in BMS" badge in the chrome of **every** desk screen — got
      neither: the list silently shows 14 of 612 with nothing saying why.
      Measured on the running app: `?org=` yields a banner and an escape,
      `?in_bms=false` yields `{banner: [], escape: []}`. Give both filters the
      one banner, describing either or both, with the same escape. The
      empty-state copy must stop blaming the search ("Try a phone number or a
      band serial") when a filter is the cause — but that exact string is the
      frozen design's own (`boa_design_v2.html:778`) and stays for the search
      case. Acceptance: unit tests for the summary copy and `test:e2e` in
      `org-filter.spec.ts` for in_bms alone and combined with org · **C** ·
      due Sat 26 Sep

**Added 26 Sep, from the same walkthrough that produced ACC-153 and ACC-154.**
Seven findings, none of them fixed, all recorded in `CURRENT-STATE.md`'s 26 Sep
entry. Read this paragraph before claiming any of them, because they are not
interchangeable:

- **ACC-155, ACC-157, ACC-158 and ACC-161 are safe to take now.** None of them
  changes the layout of a screen `test:visual` compares, so none needs an ADR.
- **ACC-156, ACC-159 and ACC-160 deliberately diverge from the frozen v2
  contract** (non-negotiable #1). Each needs an ADR **written and agreed with
  Vipin before any code**, in the manner of ADR-021, and each collides with an
  open pixel task on the same screen — ACC-109 for Gate and Vehicle, ACC-107
  for Passes. Do not claim one of these while its pixel task is open: finish or
  block that first, or fold the change into it and re-capture the reference.
  **Never resolve the collision by tuning the app to the screenshot** — that is
  the `boa-bar-control` failure this repository exists to avoid.

- [x] **ACC-155** · **A 401 mid-shift loses where the operator was.** Ten desk
      call sites do `router.replace('/desk/login')` with no `next` — nine of
      them driven by a 401, plus the deliberate sign-out — so an
      operator whose session lapses on `/desk/passes` signs back in and lands
      on `/desk` — on show day, holding a phone, mid-task. `gate/session.ts`
      already has the correct shape (`loginHref(next)`), and
      `lib/safe-next.ts` already allowlists destinations, so this is reuse, not
      new machinery. Sites: `app/desk/desk-chrome.tsx` (2),
      `app/desk/control-room-screen.tsx`, `app/desk/passes/passes-screen.tsx`,
      `app/desk/master/master-screen.tsx`, `app/desk/orgs/orgs-screen.tsx`,
      `app/desk/users/users-screen.tsx` (4). Decide explicitly whether the
      deliberate sign-out in `desk-chrome.tsx:237` keeps `next` — it should
      not. Acceptance: `test:e2e` that a 401 on `/desk/master?org=<id>` returns
      there after sign-in with the filter intact, and that an unsafe `next` is
      still refused by `lib/safe-next.ts`; no screen layout changes, so
      `test:visual` numbers must be unmoved · **C** · due Sun 27 Sep
- [ ] **ACC-156** · **CHECKED AGAINST THE RENDER 27 SEP — THE PREMISE BELOW IS
      WRONG ON ITS SECOND HALF, AND MEASURED SOFTER ON ITS FIRST.** Read this
      before doing anything to this task.
      **(a) The weight claim is false.** The entry says "Can't scan? Search by
      name is a filled pill with a green icon while the scanner is a thin
      outline". The opposite is what renders, in **both** themes — see
      `design/reference/gate-{dark,light}-mob.png`, opened, not assumed. The
      scan frame is a 240px box with **green** corner brackets, the largest and
      the only coloured element in the panel. The fallback is `btn wide
      hov-outline-grn` — and `.btn`'s own default is `--bb: transparent` with a
      1px inset rule (`app/v2.css:150`), i.e. a **thin outline pill**, with a
      muted `color-mix(… 10%)` icon circle, not a green one. So the scanner
      already out-weighs the fallback. **Swapping the fills would invert a
      hierarchy that is currently correct** and make the gate worse. Vipin
      chose the swap on 27 Sep on the strength of the claim above; when the
      render was opened the claim did not survive, so it was **not
      implemented** — deliberately, and this is the record of why.
      **(b) The layout claim is real but smaller than stated.** Measured on a
      390×844 phone against the running app, not estimated: the scan frame runs
      **485–725px** (centre **605**, height 240), so it **is** on the first
      screen — not "buried" below the fold — and the fallback pill sits at
      **817px**, also just inside it. What is true is that **485px, 57% of the
      viewport, is spent on header, meta bar, tag, hero and paragraph** before
      the scanner starts. That is the only defensible part of this task.
      Acting on (b) means the full reorder, which **breaks Gate's now-green
      0.31/0.31/0.33/0.34%** with no legitimate route back under 0.8%: the
      reference renders the frozen source, which draws the hero first. Vipin
      declined the full reorder on 27 Sep. **So this task has no remaining
      agreed action** — it is left open carrying the corrected evidence rather
      than closed, so the decision can be revisited with the real numbers.
      Original (uncorrected) text follows.

- [-] **ACC-156-original** · **The gate buries its own primary action.** On a 390×844
      phone the scan frame's centre sits about 575px down: header, meta bar,
      tag, a two-line hero and a three-line paragraph come first. The fallback
      out-competes it too — "Can't scan? Search by name" is a filled pill with
      a green icon while the scanner is a thin outline. At a gate at night with
      a queue, the scanner should be the first thing on screen and the heaviest
      thing on it. **Needs an ADR**: the hero and the button weights are the
      frozen v2 contract's, and `Can't scan? Search by name` is the design's own
      string. Proposal to put to Vipin: keep the copy, move it below the
      scanner or behind an info affordance, and swap the fill so the scan target
      is the filled element. **Blocked by ACC-109** (Gate + Vehicle pixel
      fidelity, hard stop 2 Oct) — do not start until that is green or blocked.
      Acceptance: the ADR, then `design/reference/` re-captured from the agreed
      source, Gate ≤0.8% on 4 variants, `test:e2e` aeroplane-mode still green,
      and the measured scan-frame offset on 390×844 recorded before and
      after · **C** · due Thu 1 Oct
- [x] **ACC-157** · **The gate states its sync twice, in conflicting words.**
      About 40px apart it draws "ONLINE | 3 QUEUED" (the design's own pill —
      `QUEUED` appears in `boa_design_v2.html`) and "NOT SYNCED YET · 3 PENDING"
      (`app/gate/sync-status.tsx`, added by ACC-149). One says online, the other
      says not synced; one says queued, the other pending. Cheapest correct fix,
      and the one that keeps the contract: the pill keeps saying online/queued,
      and `SyncStatus` stops restating them and carries only what the pill
      lacks — the last pull time. Do **not** fold the facts into the pill
      without an ADR; that is the design's string. The overlay is laid out at
      zero height on purpose (see its own comment), so a text change moves
      nothing. Acceptance: one vocabulary on screen at once, a unit test for the
      `SyncStatus` line in all four states (never synced, synced, pending,
      needs-login), and Gate `test:visual` re-measured and recorded to show the
      zero-height claim still holds · **C** · due Sun 27 Sep
- [x] **ACC-158** · **"Last issued at this gate" mislabels two rows.**
      `app/gate/page.tsx:356` renders `band ${serial}` for every row, so a
      `vehicle_sticker` reads "band V-0231" — a sticker shown as a wristband, at
      the one gate whose whole rule is that the two are different things. And
      when the holder is not in this phone's roster both lines fall back to
      `row.kind`, giving "WRISTBAND" above "wristband, no serial, 08:14": the
      same token twice and no name. That happens whenever the ledger carries
      someone pulled after this phone's last sync. Branch the noun on
      `row.kind`, and say plainly that the holder is not on this phone's list
      rather than printing the kind twice. Acceptance: unit tests for both rows
      (sticker row, unknown holder) and `test:visual` Gate unmoved — the
      reference's three rows all have known holders and wristbands, so correct
      code must not change those pixels · **C** · due Sun 27 Sep
- [x] **ACC-159** · **Done 27 Sep — ADR-022.** The officer is told before
      deciding. `resolvePlate(db, plate)` (`gate/vehicle-flow.ts`) is now the
      single source of truth used by **both** the pre-decision panel and
      `recordEvent`, so what is shown is what is enforced — there is no second
      copy of the lookup, deliberately. As soon as the registration parses the
      panel shows holder, sticker number and wristband state, headed "Ready to
      clear" / "Will not clear"; "Plate matches sticker" is shown as the
      officer's own check because the app cannot see the vehicle. The
      resolution is keyed to its own plate, so editing the registration cannot
      leave the previous vehicle's sticker under a new one. The disabled reason
      is now visible text — `title` has no touch or keyboard equivalent, so on
      the phone this screen runs on it did not exist.
      Verified, not asserted: **Vehicle 0.38/0.39/0.21/0.22%** at exact
      dimensions (against 0.39/0.39/0.21/0.22% before the change — the gated
      shot is the settled `Cleared` state and did not move), Gate and master
      unmoved, `test:e2e` **49/49** including 6 new ACC-159 tests and the
      ACC-109 stale-state tests still green, and **9** unit tests on
      `resolvePlate` covering no-sticker, sticker-without-band,
      sticker-not-in-ledger, blank serial, and that resolving queues nothing.
      Side finding: `recordEvent`'s inline lookup is gone, so the screen no
      longer reads Dexie twice for one decision · **C** · due Wed 30 Sep
      `/gate/vehicle` looks the plate up **inside** `recordEvent`, after "Log
      entry and open gate" is pressed: the officer presses the permissive green
      button to discover whether there is a sticker and a live wristband, and is
      then refused. The screen's own copy ("A sticker without a wristband does
      not enter") describes a check the screen will not perform until after the
      decision. Second defect, same screen: with an empty or invalid
      registration both buttons sit disabled and the only explanation is
      `title="Enter a valid registration first"` — a hover tooltip, on a touch
      device, at a barrier. Resolve on input instead: as soon as the
      registration parses, show holder, sticker number and wristband state, and
      leave the button for the decision it names; render the disabled reason as
      visible text (the "Not a valid registration format" line already exists).
      **Needs an ADR** — the pre-decision panel is blank in the contract.
      **Blocked by ACC-109.** Acceptance: the ADR, `test:e2e` that the three
      checks are on screen before any press and that pressing still logs exactly
      one event (the ACC-109 stale-state tests must keep passing), Vehicle
      ≤0.8% against the re-captured reference · **C** · due Wed 30 Sep
- [ ] **ACC-160** · **"Send all unsent" is a bulk outward action with no count
      and no confirmation**, and nothing anywhere shows per-person send state.
      Next to it sits "Print 6 passes", which does say the number. It sends real
      WhatsApp messages to real people; an accidental press messages an unknown
      number of them, and there is no screen that would afterwards tell you
      whom. Put the count in the label, confirm naming the number and the
      channel, and show each card's state — sent at, not sent, delivery failed —
      so the desk can chase and resend one person. `Send all unsent` is **not**
      in `boa_design_v2.html`; the per-card state is the part that changes the
      contract, so **an ADR is needed for the card, not for the button**.
      Two more from the same screen belong here rather than in their own task:
      there is **no search or filter** on a sheet that will hold 612 cards, so
      resending to one person means scrolling; and the zone chips for zones a
      band does **not** hold are struck through in grey on a card whose whole
      purpose is to be printed and cut, where that may not survive a photocopy
      — consider omitting them, or marking held zones positively instead.
      **Blocked by ACC-107** (Passes pixel fidelity). Depends on ACC-144 for
      what a send actually records. Acceptance: the ADR for the card,
      `test:e2e` that the confirm names the true count and that dismissing it
      sends nothing, per-card state rendered from the data layer (never a
      fixture default — `check-bundle-content.mjs` enforces this), Passes
      ≤0.8% · **C** · due Thu 1 Oct
- [x] **ACC-161** · **The invite form defaults to the one role that cannot use
      the gate.** `/desk/users` defaults to `approver`, which `canUseGate()` in
      `lib/schemas/operator.ts` excludes, and only "Issuer" carries any
      explanation ("check-in only"). With up to ten issuers invited in the week
      before the show (ADR-020), a wrong role is a phone call at a gate. Give
      each of the four roles a one-line description saying what it can do and
      whether it reaches the gate, and choose the default deliberately —
      `issuer` is the likely right answer now that the desk is Vipin, Bhoopesh
      and Salman and everyone else is check-in. Two small things in the same
      screen while it is open: the native `<select>` is the only unstyled
      control in the app, and the full-name placeholder is clipped mid-word
      ("As they should appear to the te…") — placeholder-as-help-text also
      vanishes on typing, so move it to a hint line under the label.
      `/desk/users` is not a `test:visual` screen, so no ADR and no pixel
      budget. Acceptance: the role copy comes from one exported map used by both
      the `<option>` and its description, a unit test that every
      `operatorRoleSchema` option has a description and a correct gate claim
      (so adding a role cannot silently ship undescribed), and `test:e2e` that
      the default selection is the agreed one · **C** · due Mon 28 Sep

**Added 26 Sep, completing the walkthrough record.** ACC-155–161 captured the
findings flagged at the time; these two carry the rest, which were in the
critique and not in the roadmap. They are listed last because they are the
least urgent, not because they are optional.

- [x] **ACC-162** · **Done 27 Sep — ADR-023.** Semantics and a count, at **zero
      pixel cost**: master measured 0.54/0.56/0.03/0.04% before *and after*, at
      identical dimensions, so the one passing v2 screen stayed passing.
      The rows are now an ARIA table — `role="table"` on the panel (only in the
      success state; an empty ARIA table promises structure that is not there),
      `role="row"` per `.mrow`, `role="cell"` per cell, and a `role="row"` of six
      `columnheader`s naming every column. That header row is `.sr-only`, which
      is `position:absolute` and therefore out of flow: real presence in the
      accessibility tree, none in the layout. The six names must stay in step
      with `.mrow`'s six grid columns in `app/v2.css`.
      `masterCountLabel(shown, total)` (`lib/format.ts`, pure, 6 unit tests)
      reads "Showing 14 of 612 people" and says "All 612 people" rather than
      "612 of 612", which reads as a filter matching everyone. It is the table's
      accessible name, so it is announced with or without a filter, and is drawn
      beside the existing ACC-154 filter banner. `total` is a new master-response
      field, counted the same way `rows` is built, with no extra query.
      `test:e2e` **53/53**, including 4 new ACC-162 tests.
      **Deliberately NOT fixed, and recorded rather than dropped:** a *sighted*
      volunteer still has no column names — only a visible header row gives them
      that, and Vipin declined it to keep the gate green. If it is wanted before
      5 Oct that is a fresh decision and it costs master's reference and a
      re-measure. See ADR-023 · **C** · due Wed 30 Sep Eight
      columns of data — tier, band serial, vehicle, BMS flag, check-in time and
      gate — with **no header row**, so a desk volunteer arriving on 5 Oct has
      to infer that `#0412` is a band serial and `KA 05 MJ 8871` is a vehicle.
      It is also `div`s, not a `<table>` (`tables: 0` when the DOM is probed),
      so a screen-reader user gets a flat list with no row or column semantics
      and no way to navigate by column. And nothing says how many of 612 rows
      are on screen, filtered or not. **This deliberately breaks a currently
      green gate**: master is the one v2 screen passing `test:visual` (26 Sep:
      0.64 / 0.65 / 0.15 / 0.14%), and the frozen contract draws no header row.
      **Needs an ADR** weighing legibility for a volunteer against the pixel
      contract — put the options to Vipin before writing code, including the
      cheaper half-measure of keeping the visual rows and adding only semantics
      plus a count. Acceptance: the ADR; if headers are agreed,
      `design/reference/` re-captured and master back to ≤0.8% on 4 variants;
      an `axe` or equivalent check that the rows expose row/column semantics ·
      **C** · due Wed 30 Sep
- [x] **ACC-163** · **Six small things, none of which touches a `test:visual`
      screen's layout.** Grouped because each is a few lines and they would
      otherwise never be worth a task of their own. `/desk/orgs` and
      `/desk/login` are not gated screens at all; the two gate items change
      behaviour and an aria label, not layout — prove that by re-measuring
      rather than assuming it.
      **(a)** `/desk/orgs` tells the operator to "add a company **before** you
      send them the form link" and gives no destination — the screen is
      read-only by design (see its header comment), so name the real path
      (`data/orgs.json` + `scripts/replace-placeholder-orgs.mjs`,
      `docs/ORG-IMPORT.md`).
      **(b)** `/desk/orgs` rows read "SENT 68 · APPROVED 67 · APPROVED" — the
      org's status and a person count using the same word in one line. Make the
      status a chip, as the Master list already does.
      **(c)** `/desk/orgs` sets company names in the body face while every
      other list sets names in uppercase condensed. Pick one.
      **(d)** `/desk/login` has no show-password toggle — the gate is outdoors,
      at night, possibly in gloves — and reveals the 8-character rule only
      after a failed submit. State it under the field.
      **(e)** `/desk/login` renders "Check-in sign in" (the `?next=/gate`
      heading) wrapping as "CHECK-" / "IN SIGN IN". Keep the word whole.
      **(f)** `/gate/vehicle` leaves `askReason` true after the registration
      changes, so the turn-away reason field from the last vehicle is still on
      screen for the next one. Reset it where the verdict is cleared.
      Plus one accessibility question rather than a defect: the 1×1 `sr-only`
      "Manual scanner input" on `/gate` is focusable and tells a keyboard user
      nothing about what it is for. Decide whether it should be reachable at
      all. Acceptance: one commit per lettered item or one with a clear message
      covering all; `test:visual` re-run for Gate and Vehicle and the numbers
      recorded, showing (f) and the aria change moved nothing · **C** ·
      due Tue 29 Sep

## Phase UX — The audit's fixes · 27 Sep → 3 Oct, then after the show

**Added 27 Sep on Vipin's instruction** from `docs/ux-audit.md` (UX-nn IDs refer
to its findings table). Order agreed with Vipin: the gate-safety fixes first,
before gate-live; the band-led redesign once ACC-171 lands; primitives after
the show. Anything that changes a `test:visual` screen diverges from the v2
contract — record it in an ADR before shipping, as ACC-156/159/160 did.

- [~] **ACC-165** · **`/gate/vehicle` has no sign-in guard** (UX-02, UX-03). Signed out, the full vehicle screen renders and writes fail silently; the header shows "14 not in BMS" with no session. Acceptance: the route redirects to `/desk/login?next=/gate/vehicle` exactly as `/gate` does (reuse `checkGateSession`/`loginHref`), an e2e test proves it, and the source of the signed-out count is traced and either removed or shown to be local cache · **C** · due Mon 28 Sep
- [ ] **ACC-166** · **Vehicle screen at 390px** (UX-13, UX-14, UX-15): the "Log entry and open gate" label overflows and clips the arrow; "Not synced yet" sits on the card border; the overflow menu is 38×38. Acceptance: no overflow at 360/390px, a 44×44 hit area, `test:visual` numbers recorded before/after · **C** · due Wed 30 Sep
- [ ] **ACC-167** · **Pass copy assumes crew** (UX-05, UX-21): "Show this at the crew check-in desk" goes to every tier; the fine print is two paragraphs of repeated rules. Acceptance: tier-neutral desk line, one-line fine print at ≥4.5:1, COPY.md updated · **C** · due Thu 1 Oct
- [ ] **ACC-168** · **Zones on the pass in the zone-sheet language** (UX-16, UX-17): granted zones only, as the sheet's colour squares, with solid "+ ID" / "after 22:00" tags; no mint accent on the pass. Needs an ADR (diverges from v2) · **C** · due Fri 2 Oct
- [ ] **ACC-169** · **Login cleanup without a redesign** (UX-07 to UX-10): one H1 plus a legible logo, the "minimum 8" hint only when setting a password, `noValidate` with inline errors, follow the theme like the gate chrome · **C** · due Fri 2 Oct
- [ ] **ACC-170** · **A way out of dead ends** (UX-19): 404 and invalid-pass get "Message the accreditation desk" and, for staff, "Back to sign in". Blocked by ACC-173 · **C** · due Fri 2 Oct
- [ ] **ACC-174** · **The band is the pass** (§5 B1, UX-01): band strip across the top of the pass card, the same art faded behind it, the same strip on the gate result. WebP assets keyed by `TierCode`. Blocked by ACC-171; needs an ADR · **C** · due Sat 3 Oct
- [ ] **ACC-175** · **Per-tier WhatsApp header card** (§5 B2, UX-04): eight static 1200×628 cards, `headerValues` wired in `lib/interakt.ts`, tier-neutral body. Blocked by ACC-171 and the approved template in ACC-172 · **C** · *after ACC-174*
- [ ] **ACC-176** · **Sign-in redesign and a footer that does a job** (§5 B3, B4, UX-06, UX-11, UX-18) · **C** · *after ACC-174*
- [ ] **ACC-177** · **`Button` and `Field` primitives; one radius and spacing scale** (§5 B5, UX-23), plus `loading.tsx` (UX-24) and the stale PRODUCT.md/COPY.md vocabulary (UX-25) · **C** · *after the show*

## Phase 0 — Foundation · 10–11 Sep — ✅ DONE

- [x] **ACC-001** · Recover the design from the bundle; commit to `design/source/`
- [x] **ACC-002** · Scaffold Next 16 / React 19 / TS strict / pnpm
- [x] **ACC-003** · Transcribe both colour layers; `check-design-tokens.mjs` gate
- [x] **ACC-004** · Fonts via `@fontsource`; `audit-font-weights.mjs` gate
- [x] **ACC-005** · `extract-assets.mjs` — logo + poster out of the bundle
- [x] **ACC-006** · `build-gate-sw.mjs`, precaching only routes Next emitted
- [x] **ACC-007** · Root dead end, 404, error boundary. **Reversed 12 Sep
      2026, ADR-013** — root now redirects to `/desk/login` on Vipin's direct
      instruction. The 404 (`app/not-found.tsx`) is untouched; only the root
      dead-end half of this task was reversed.
- [x] **ACC-008** · `/docs`, `CLAUDE.md`, `AGENTS.md`, `.cursor/rules/`
- [x] **ACC-010** · Vercel project live at `accred.bangaloreopenair.com`
- [x] **ACC-012** · Design reference capture (28 refs) + `visual-check.mjs`
- [x] **ACC-013** · CI: app + database jobs, database required from 20 Sep
- [x] **ACC-014** · `verify-deploy.mjs` + deployment_status workflow
- [x] **ACC-015** · Git hooks: pre-commit gates, pre-push build + visual
- [x] **ACC-016** · MCP servers registered; Supabase agent skills installed

---

## Phase 1 — Schema and the public surface · Fri 11 – Fri 18 Sep

**This is the critical path. If it slips, Milestone A slips.**

- [x] **ACC-011** · `db-test.mjs`, `db-state.mjs`, `sql-arity-check.py`, `lib/db-url.mjs` · **C** · due Fri 11
- [x] **ACC-020** · `202609110001_boa_acc_core.sql` — 9 tables, enums, `pass_only_when_approved` CHECK, `ENABLE ALWAYS` triggers · **C** · due Sat 12
- [x] **ACC-021** · `..._lock_down_privileges.sql` — anon has nothing; column grants omitting `pass_token`; views `security_invoker` · **C** · due Sat 12
- [x] **ACC-022** · `privileges.test.sql` — every table, every function, both roles, **and through the views** · **C** · due Sun 13
- [x] **ACC-023** · `boa_acc_mint_invite` / `org_view` / `submit` + `quota`, `tokens`, `throttle` tests · **C** · due Mon 14
- [x] **ACC-024** · `/api/s/[token]` + ported `lib/rate-limit.ts` · **C** · due Tue 15
- [x] **ACC-025** · `/s/[token]` — Submission screen, transcribed, both themes · **C** · due Wed 16
- [x] **ACC-026** · `/desk/login` + `/api/admin/invite-operator`; invite B, SN, 2 approvers · **C/V** · due Wed 16
- [x] **ACC-027** · `/desk/orgs` — create org, set quota, mint link, copy · **C** · due Thu 17
- [x] **ACC-028** · `BACKUP_ENCRYPTION_KEY` secret for the nightly encrypted
      backup (replaces PITR — see above) · **V** · due Thu 17

**Acceptance — all four, or Phase 1 is not done:**
1. A real link on the production domain accepts 3 people.
2. It **refuses the 23rd against a quota of 22 when called directly with `curl`** — not through the UI.
3. It refuses the 61st submission in an hour.
4. `test:db` green and **required** in CI; `test:visual` on Submission ≤0.8% in both themes.

## Phase 1b — v2 reconciliation gap-fill · Sun 13 – Sat 19 Sep

Added 13 Sep after reconciling the "Festival Readiness Plan (v2)" handoff
against the shipped app — see ADR-014. Real gaps v2 found, not previously
tracked as ACC tasks.

**13 Sep, later the same day — provenance note:** this whole phase was added
on a local branch that turned out to have diverged from `origin/main` by
~30 commits (several concurrent sessions had been pushing independently).
Rebased onto `origin/main` before continuing; `origin/main` never had this
phase, so ACC-034 through ACC-04B are new roadmap entries as of this rebase,
not something the other sessions already knew about or had rejected.
ACC-034's original scope (stripping the WEB/MOB toggle) was already wrong by
the time of the rebase — `docs/DESIGN-SYSTEM.md` had been corrected upstream
to say the toggle ships. Treat every item below as freshly re-verified
against `origin/main`'s actual current state, not carried over on faith.

- [x] **ACC-034** · `scripts/check-bundle-content.mjs` (₹, finance terms,
      `console.log`) gating `build` and `verify:deploy` · **C** · due Tue 15.
      **Scope corrected 13 Sep:** originally also set out to strip the
      WEB/MOB review toggle from `GateChrome`, but `docs/DESIGN-SYSTEM.md`'s
      Responsive section was corrected in the meantime — the toggle **ships**
      as a real layout indicator, not a debug affordance — so that half of
      this task is superseded, not done differently. See `app/gate/gate-chrome.tsx`.
- [x] **ACC-035** · `scripts/seed-dummy.mjs` / `wipe-dummy.mjs` — 6 `TEST — `
      orgs, 18 people across all statuses/types, one over-quota, through the
      real RPCs, never touching `boa_acc_checkin` · **C** · due Tue 15.
      Confirmed still missing on `origin/main` (13 Sep) — a real gap, not
      already done elsewhere.
- [x] **ACC-036** · Copy inventory (`docs/COPY.md`), design-contract vs ours,
      rewritten in the deck's voice · **C** · Submission strings by Sat 19,
      desk strings folded into Phase 3. **Done 13 Sep**: `docs/COPY.md`
      transcribes the Submission screen against `design/source/` field by
      field, spot-checks the other design-matched desk screens, and covers
      every screen with no design counterpart. Found and fixed real drift:
      an identical generic `"Something went wrong. Try again."` fallback had
      been independently duplicated across 6 files' `internal` error case,
      rewritten consistently; one Submission error message referenced
      "highlighted" fields that don't exist in the code. `test:visual` could
      not be run in that session (no `.env.local`/`design/reference/`
      baseline in that worktree) — not claimed passing.

**14 Sep — design-fidelity lane split (added, not reordered).** Vipin
reported Submission, Master List and Passes still differ from the design.
Root cause: four desk screens have never been pixel-measured (no operator
login in `test:visual`) and Submission passes only via a 32% exemption.
Full plan, file ownership and findings: `docs/PLAN-DESIGN-FIDELITY.md`.
Claude = **C**, Cursor = **CU**, run in parallel.

- [x] **ACC-090** · Visual harness: desk API fixtures (Zod-parsed design
      data), operator sign-in, named masks replace `KNOWN_GAPS`, anti-hardcode
      and stale-build guards, review page, published baseline · **C** · due Tue 15
- [x] **ACC-091** · `boa_acc_org_roster(p_token)` + `roster.test.sql` +
      privileges + ADR-016 · **C** · due Wed 16
- [x] **ACC-092** · Submission: drafts + "Submit N for approval →" batch,
      roster-backed "Your list", ≤0.8% on 4 variants · **C** · due Thu 17
- [x] **ACC-093** · Merge both lanes; 7/7 screens PASS, 0 BLOCKED, 0 KNOWN
      GAP; Vipin review; deploy verified · **C** · due Fri 18
- [x] **ACC-095** · Contract schemas (K0) + shared shell: footer, logo
      filter, BMS link, `.d-h1b` · **CU** · due Tue 15
- [x] **ACC-096** · Master List M1–M8 at ≤0.8% · **CU** · due Wed 16
- [x] **ACC-097** · Passes P1–P7 at ≤0.8% · **CU** · due Thu 17
- [x] **ACC-098** · Queue (10 findings) + Control Room at ≤0.8% · **CU** · due Thu 17
- [x] **ACC-099** · Cursor lane sign-off, measured numbers in CURRENT-STATE · **CU** · due Fri 18

**Milestone A precondition:** `wipe-dummy` run, 0 `TEST — ` orgs remaining,
before ACC-031 mints the 38 real invite tokens.

## Phase 2 — Ready to send · Fri 18 – Sat 19 Sep

- [-] **ACC-030** · Load all 38 orgs — kinds, quotas, contacts · **C/B** · due Fri 18
      **Retired 22 Sep (ADR-019):** organisations are no longer loaded ahead of collection; see ACC-142.
- [-] **ACC-031** · Mint + label 38 invite tokens; export a WhatsApp-ready list · **C** · due Fri 18
      **Retired 22 Sep (ADR-019):** no invite links; the form link is the only link sent.
- [x] **ACC-032** · Confirmation copy, duplicate-phone path, closed-org path · **C** · due Sat 19
- [x] **ACC-033** · `/desk` Control room on `boa_acc_desk_dashboard()` · **C** · due Sat 19

> **Renumbered on merge, 21 Sep.** These production-hardening tasks were added on
> `polish/production-hardening` as ACC-100–117, the same IDs as the v2 and
> accreditation-pack tasks below. They are now **ACC-120–137 (old ID + 20)**.
> Commit messages on that branch still use the old IDs: `fix(ACC-109)` there is
> ACC-129 here, `fix(ACC-115)` is ACC-135.

- [x] **ACC-120** · `/desk/login` blank in production: prerendered page has no
      script nonce under the nonce CSP → every script blocked. Make it dynamic;
      `verify:deploy` fails if any `<script>` lacks the header's nonce · **C** · due Sat 19
- [x] **ACC-121** · Favicon from the recovered logo (every tab 404s `/favicon.ico`) · **C** · due Sat 19

**Acceptance: Bhoopesh opens a link on his own phone, adds himself with a
vehicle, and watches the seat count move.** Not a demo on my machine.

> ## ▶ MILESTONE A — Sun 20 Sep · links go out
> No slack after this. A link sent on 24 Sep leaves four fewer days to chase 38
> companies, and **R2 (vendors simply not submitting) is the risk most likely to
> kill the gate.** First chase: Fri 25 Sep.

## Phase 2b — Production hardening · Mon 21 Sep – Sat 3 Oct

> **After Phase R (ADR-019).** Only screens still in use matter: control room,
> master list, passes, gate, vehicle, login. Queue work is retired.

Inside the pixel contract: no font, palette or layout change. Every async
screen gets explicit loading / empty / error / ready states that cannot be
mistaken for each other. Plan: `polish/production-hardening` branch.
`test:visual` must stay 7/7 PASS on every task.

- [x] **ACC-122** · `components/states/` — Skeleton, EmptyState, InlineError (`role="alert"`, Retry); one `lib/error-copy.ts` replacing 7 copies of `ERROR_COPY` · **C** · due Tue 22
- [-] **ACC-123** · Queue: a real loading state (first load no longer reads "No people / 0 approved"); "Org N of M pending" only on the Pending filter · **C** · due Wed 23
      **Retired 22 Sep (ADR-019):** queue loading state — the queue is an exceptions tool now; ACC-122/124 cover it generically.
- [x] **ACC-124** · Other desk screens + status bar: skeletons, empty states with a next step, try/finally on every fetch, no swallowed errors · **C** · due Thu 24
- [x] **ACC-125** · Action feedback: pending labels, partial-failure report on Approve selected, inline confirm on Revoke / Deactivate · **C** · due Fri 25
- [x] **ACC-126** · Keyboard + a11y: visible focus on every input, skip link, `<main>` on `/desk`, `aria-pressed` on filters, `type="tel"` on phone · **C** · due Tue 29
- [x] **ACC-127** · Per-route titles (`%s · BOA Accreditation`), one button-label casing rule · **C** · due Wed 30
- [x] **ACC-128** · Login, 404, error, global-error rebuilt in the contract's vocabulary; login `checking` state gets a form skeleton · **C** · due Sat 3
- [x] **ACC-129** · Gate safety: vehicle Turn away can log a clear (stale state); gate idles on REFUSE; double issue; scanner over empty cache; outbox drains only after an issue · **C** · due Sun 20
- [x] **ACC-135** · Queue logic: real selection count, nothing pre-selected, visible type control, bulk reject rejects all, Org N of M only on Pending · **C** · due Mon 21
- [x] **ACC-130** · Remove the mock's presentation-only controls (Web/Mob, scan-state tabs, dead Void, dead Next org, always-on Live) — app + design/source · **C** · due Tue 22
- [x] **ACC-131** · Labels that do what they say: real Search by name (offline), Start camera, readable disabled buttons, focused scanner input, real vehicle plate check · **C** · due Wed 23
- [x] **ACC-136** · Desk nav — reconciled 24 Sep: this entry's wording ("…Passes · Queue; Orgs & users; Devices/Users in account menu") predates ADR-019 (22 Sep), which retired Queue and Devices. The nav ADR-019 and CURRENT-STATE's "Phase R shipped" section actually require is Control room · Master list · Passes · Organisations · Gate · Vehicle, with only Users (no Devices) in the account menu · **C** · due Thu 24
- [x] **ACC-132** · Gate-only chrome: Gate · Vehicle, "Accred gate", no desk nav on volunteer devices · **C** · due Thu 24
- [-] **ACC-137** · Actions that fire on nothing: Passes print/WhatsApp at 0, WhatsApp scoped to one org; master-list band colour per theme · **C** · due Fri 25
      **Retired 22 Sep (ADR-019):** replaced by ACC-144 (per-person, not per-org, pass delivery); the band-colour half moves to ACC-133.
- [x] **ACC-133** · Sample data that looks real: plate placeholders; one shared outbox-status hook; master-list band colour per theme (from ACC-137) · **C** · due Fri 25
- [x] **ACC-134** · Operator copy instead of designer rationale (Vipin reviews factual copy) · **C** · due Mon 28

## Phase 3 — The desk · Mon 21 – Sat 26 Sep

Runs while submissions arrive.

- [x] **ACC-040** · Approval queue — filters, per-row type, bulk, *Approve all →*, reasons · **C** · due Tue 22
- [x] **ACC-041** · `boa_acc_decide` + `approve_org` + `ledger`/`reissue` tests · **C** · due Tue 22
- [x] **ACC-042** · Master list — search, CSV, In BMS / Not in BMS column · **C** · due Wed 23
- [x] **ACC-043** · Passes — server-rendered QR SVG, A4 print CSS, WhatsApp share · **C** · due Thu 24
- [x] **ACC-044** · `/desk/aaa` + nomination guard + `aaa.test.sql` · **C** · due Fri 25
- [x] **ACC-045** · `/desk/devices` — mint/revoke, raw token shown once · **C** · due Fri 25
- [-] **ACC-046** · **Each approver runs the queue once.** Not for the first time on the day · **B/SN** · due Sat 26
      **Retired 22 Sep (ADR-019):** the approval decision is made in the sheet by Salman; the queue is for exceptions.
- [x] **ACC-047** · Shared desk shell — sticky nav, live status bar, theme toggle · **C** · due Sat 26
- [x] **ACC-048** · Forgot-password link on `/desk/login`, using
      `resetPasswordForEmail` + the existing `/auth/confirm` recovery path ·
      **C** · due Mon 21. **Already done, confirmed 13 Sep during the
      rebase**: built independently on `origin/main` in `3750cc8
      feat(desk/login): add a forgot-password flow`, hardened by `1704833
      fix(auth): don't verify recovery/invite tokens on GET` (a real
      production bug — a mail-security link-prescanner was burning
      single-use recovery/invite tokens via `GET` before the recipient could
      click). Both already merged; no new work needed.
- [x] **ACC-049** · `/desk/users` Manage Users — list, invite (reuses
      `/api/admin/invite-operator`), activate/deactivate; lead/admin-checked
      in the database, self-deactivation and last-admin guards ·
      **C** · due Wed 23
- [x] **ACC-04B** · Profile menu (name, role, theme, Manage users, sign out)
      replacing the desk's loose theme button — desk screens only, own ADR
      if the design needs reconciling (ADR-014 is already taken by the v2
      reconciliation above) · **C** · due Thu 24

**Acceptance:** 100 real submissions approved through the real queue · 14 passes
print one per A4 and **a phone decodes the QR off the paper** · `pass_token`
provably absent before approval · AAA unstampable without a nomination ·
`test:visual` ≤0.8% on all four desk screens.

## Phase 4 — The gate · Mon 28 Sep – Sat 3 Oct

**The hardest week. Do not let it start late.**

- [x] **ACC-050** · `gate/db.ts` Dexie v1 · **C** · due Mon 28
- [x] **ACC-051** · Port `outbox-policy.ts` from bar-control + unit tests · **C** · due Mon 28
- [x] **ACC-052** · `gate/resolve.ts` — pure green/amber/red incl. pending-outbox amber · **C** · due Tue 29
- [x] **ACC-053** · `gate/scanner.ts` — BarcodeDetector + zxing-wasm fallback · **C** · due Tue 29
- [ ] **ACC-053b** · **Prove zxing-wasm on a real iPhone.** Not deferrable — see R1 · **V** · due **Tue 29**
- [x] **ACC-054** · `/gate/setup`, `/gate` transcribed, `force-static` *(historical
      acceptance wording; superseded by the shipped `force-dynamic` gate
      implementation and current architecture/docs)*, **+ sticker input** ·
      **C** · due Wed 30
- [x] **ACC-055** · `/gate/vehicle` + `vehicle.test.sql` · **C** · due Thu 1 Oct
- [x] **ACC-056** · `/api/gate/*`; SW precache incl. the `.wasm` · **C** · due Thu 1 Oct
- [x] **ACC-057** · `aeroplane-mode.spec.ts` + the two failure-path tests · **C** · due Fri 2 Oct
- [ ] **ACC-058** · **Rehearsal: three or more real phones, one an iPhone,
      each logged in as a different issuer, real aeroplane mode.** Stage one
      deliberate double issue offline and see ACC-148 catch it after sync ·
      **V/B** · due **Sat 3 Oct**
- [ ] **ACC-059** · Print the paper fallback: approved list by name (and by crew type), blank issue sheets · **B** · due Sat 3 Oct
- [x] **ACC-060** · Optimise `boa-logo.png` — 290 KB is heavy for a gate precache · **C** · due Fri 2 Oct
- [-] **ACC-061** · Mint device tokens for 4 phones · **B** · due Sat 3 Oct
      **Retired 22 Sep (ADR-020):** issuers log in; there are no device tokens.

**Acceptance:** cold start with the radio off renders the scanner and the full
cached roster · every step of the aeroplane-mode spec asserted in CI · **both
real phones signed off in `CURRENT-STATE.md`** · paper fallback physically
printed and at the desk.

## Phase 3b — the v2 redesign lane · Sun 20 Sep – Fri 3 Oct

> **Frozen behind Phase R and the gate (ADR-019).** Pixel fidelity is first in
> the cut order below. ACC-109's hard stop still stands: gate not green and
> rehearsed on v2 by 2 Oct → ship the gate on v1.

**Added 20 Sep on Vipin's instruction, not a reordering.** `design/proposals/
boa_design_v2.html` is a complete v2 of the same seven screens and becomes the
pixel contract; v1 freezes as the domain + C8 colour record. **Read
`docs/CURSOR-V2.md` in full before claiming ACC-100** — it carries the gate
rework, three things that must not be changed silently, and ACC-109's hard stop.

This lane does not sit on the critical path. If ACC-030a lands mid-flight, the
org list wins: `task block` the redesign task with a reason and commit it.

- [x] **ACC-100** · Admit v2 as the pixel contract: move it into
      `design/source/`, vendor fonts + icons locally, add the capture readiness
      hook, re-point `capture-design-reference.mjs`, write ADR-017, update
      non-negotiable #1 in CLAUDE.md + AGENTS.md + `.cursor/rules`. Acceptance:
      28 PNGs captured from v2, CDN-vs-local diff recorded · **CU** · due Sun 20
- [x] **ACC-101** · Split the token gates: `check-design-tokens.mjs` check 1 →
      v2, check 2 stays on v1, widen the token-name regex to `--[a-z0-9-]+`,
      add v2's tokens to `app/globals.css`, add `@fontsource/archivo/600.css`,
      re-point or retire `audit-font-weights.mjs`. `design-contract.test.ts`
      must stay 13/13 with an empty diff · **CU** · due Mon 21
- [x] **ACC-102** · The v2 primitive layer: `app/v2.css`, `components/icon.tsx`
      (14 inline SVG glyphs, no CDN, no new package), `lib/use-reveal.ts`. No
      screen changes; `test:visual` must report the unchanged v1
      numbers · **CU** · due Tue 22
- [x] **ACC-103** · Shared shell: nav island, sliding pip, status pill, `.av`
      profile menu per ADR-015, burger drawer under 700px, v2 footer. `.tools`
      is not ported. `test:visual` run and intermediate failures recorded, per
      ADR-015's precedent · **CU** · due Wed 23
- [ ] **ACC-104** · **Left open and failing by decision (Vipin, 27 Sep).** It
      cannot reach ≤0.8% as written: Control room renders **233px shorter** than
      the reference on web (2156 vs 2389) because **ADR-021 deliberately removed
      the organisations list the frozen contract still draws**. A height
      mismatch shifts every pixel below it, so no mask can close it, and
      re-capturing from a modified source would violate non-negotiable #1. The
      acceptance was **not** re-scoped — it stays as written and stays
      unchecked. Note the knock-on: **ACC-111's v2 sign-off depends on this**,
      so sign-off cannot complete while both stand. Measured 27 Sep against a
      current reference (ACC-164): **10.59/10.87/10.55/10.54%**.
      Do not re-chase this as a stale-reference problem — the reference was
      regenerated on 27 Sep and this is what remained.
      Original acceptance follows · Control room on v2 at ≤0.8%, 4 variants. **Current,
      26 Sep after ACC-152/ADR-021: 10.65/10.94/10.58/10.57%** (web 2156 vs
      ref 2389 — the app is now SHORTER than the artboard, because ADR-021
      deliberately removed the organisations list the contract still draws;
      mobile 5067 vs 4665 is still taller, and that remainder is this task's
      own `.bands3` conflict). Mobile more than halved, from 25.8%. The figures
      below are the pre-ACC-152 measurement, kept because the diagnosis rests
      on them. **Superseded, 24 Sep at `1371ef9`: 13.17/13.43/25.82/25.81%** (dark/web, light/web,
      dark/mobile, light/mobile) — and the render is much taller than the
      reference (web 2726 vs 2389; mobile 6072 vs 4665), so this is a layout
      difference, not a colour or spacing tweak. That is **worse** than the
      ACC-111 figures of 3.01/2.97/1.05/0.77% preserved in CURRENT-STATE
      history; the screen changed under it since. Visual acceptance unmet
      · **CU** · due Thu 24
      **Diagnosed 24 Sep — blocked on a decision, not on code.** The whole
      height delta is `.bands3`: the frozen artboard draws three band cards,
      the app draws the pack's eight (`88c8bd7`/ACC-115 + `b790111`). Forcing
      the fixture back to three only reaches 4.52/4.80/7.50/7.49% because
      ADR-018 also replaced every string, zone and colour inside the card. No
      honest change closes this — it needs ADR-018-vs-ADR-017 resolved by
      Vipin. **Do not re-baseline `design/reference/`.** Full measurement in
      the 24 Sep CURRENT-STATE entry.
- [-] **ACC-105** · Queue on v2 at ≤0.8%, 4 variants. Read ACC-098's
      native-`<select>` writeup first · **CU** · due Sat 26
      **Retired 22 Sep (ADR-019):** the queue is an exceptions tool now; not worth pixel work.
- [x] **ACC-106** · Master list on v2 at ≤0.8%, 4 variants · **CU** · due Sun 27
      **Verified 24 Sep:** at `1371ef9`, dark/web 0.64%, light/web 0.65%, dark/mob 0.15%,
      light/mob 0.14% — all four under the 0.8% bar.
      **Re-verified 24 Sep:** at `d66e8d1` (after claiming), same four measurements
      (0.64%, 0.65%, 0.15%, 0.14%), all variants PASS. Typecheck/lint/test gates
      green on task done.
- [ ] **ACC-107** · **Diagnosed 27 Sep — HALF of this is unreachable while
      ADR-018 stands, and it is the same shape as ACC-104.** Read before
      starting.
      Measured against the **current** reference (ACC-164 regenerated it, so
      this is not a stale-PNG problem): **6.94/5.19/5.92/5.25%**, web 1360x2055
      vs ref 1987 (**+68px**), mobile 390x4714 vs ref 4511 (**+203px**).
      **The zone strip is an ADR-018 divergence, measured not guessed.** The
      frozen contract draws **seven** short zones in **two** rows — SITE,
      BACKSTAGE, STAGE, PROD OFFICE, BAR / LOUNGES, ARTIST AREA. The app draws
      ADR-018's pack zones (`ZONES`, `lib/design.ts:239`): Festival Area,
      Eddie's Lounge, Promoters Lounge, Photo Pit, Backstage, Main Stage —
      **six** chips whose longer labels wrap to **three** rows. Measured in the
      running app: 6 chips, 3 rows, row tops 735/768/802, chip height 28px, so
      the row pitch is **33.5px** and the block is 95px against the contract's
      ~61.5px. That is **one extra chip row = ~33.5px**.
      Web lays the three cards side by side, so the extra row costs the page
      33.5px **once**: ~34 of the 68px. Mobile stacks them, so it costs 3 ×
      33.5 ≈ **100** of the 203px. **In both variants the zone strip is about
      half the gap.** A height mismatch cannot be masked, so no `.qr-wrap`-style
      mask helps, and re-capturing from a modified source would violate
      non-negotiable #1.
      **The other half is NOT explained and is genuine ACC-107 work**: ~34px on
      web and ~103px on mobile remain after the chip row is accounted for. The
      card itself measures 682px tall in the app. Anyone picking this up should
      start there and should NOT re-chase the reference or the chip rows.
      **Decision needed** before more time goes in, exactly as for ACC-104: this
      cannot reach ≤0.8% while ADR-018 stands, so either the acceptance changes
      or it stays open and failing. Vipin chose "open and failing" for ACC-104
      on 27 Sep; this was left in the same state pending his call rather than
      re-scoped unilaterally. **This is the ADR-017-vs-ADR-018 band/zone
      conflict that ACC-104's entry already flags as "still open and still
      Vipin's to resolve" — it reaches Passes too.**
      Original acceptance follows · Passes on v2 at ≤0.8%, 4 variants; the `.qr-wrap svg` mask
      selector must survive · **CU** · due Mon 28
      **Current, 24 Sep at `1371ef9`: 7.00/5.25/5.96/5.28%** (dark/web,
      light/web, dark/mobile, light/mobile), 7 regions masked, with the render
      taller than the reference (web 2055 vs 1987; mobile 4714 vs 4511).
      Visual acceptance unmet. **Re-measured 26 Sep at `b762ddf`: unchanged**,
      same four figures and the same dimensions — checked while correcting
      ACC-109's stale numbers, so this entry can be trusted as it stands.
- [-] **ACC-108** · Submission on v2, 4 variants. ADR-009 (no desk chrome) and
      ADR-016 (roster-backed list) hold; fold `motion.css` into the v2
      layer · **CU** · due Tue 29
      **Retired 22 Sep (ADR-019):** the `/s/[token]` submission surface is no longer the collection path.
- [x] **ACC-109** · **Done 27 Sep.** Gate **0.31/0.31/0.33/0.34%** and Vehicle
      **0.39/0.39/0.21/0.22%** (dark/web, light/web, dark/mob, light/mob), all
      eight variants under 0.8% at **exact** dimensions — Gate 1360x1530 and
      390x1599, Vehicle 1360x1230 and 390x1519, reference and render identical
      on every one. `test:e2e` **43/43**. Precache **57** (2 routes, 27 scripts,
      1 CSS, 24 fonts, 1 WASM).
      Two causes, both already bisected and both now removed, in this order:
      **(1)** ACC-164 regenerated the stale reference — that alone took Gate to
      0.31/0.31/0.33/0.34% with no app change, confirming the 24 Sep diagnosis
      exactly. **(2)** Vehicle still failed at 4.51/4.63/7.15/7.63%, short by
      exactly 9px on web and 16px on mobile — the `app/global-error.tsx`
      mechanism. Fixed at the cause: that file is a second Next entry importing
      the same stylesheets, and its import list was a *subset in a different
      order* than `app/layout.tsx`'s, so the shared CSS chunks merged in a
      different order and the cascade moved with them. Its imports are now
      byte-identical to the root layout's, with a comment saying why trimming
      them re-breaks the gate. Side effects, both good: it had been using
      `hov-invert-grn` and `.utility-auth` while importing neither `hover.css`
      nor `responsive.css`, and the merge dropped a duplicate CSS chunk
      (precache 58 → 57).
      **Control room and Passes were NOT fixed by the regeneration** and remain
      ACC-104/ACC-107 — genuine app-side height gaps, not stale PNGs.
      Historical diagnosis retained below.

- [-] **ACC-109-history** · Gate + Vehicle on v2 at ≤0.8%, 4 variants, plus `test:e2e`
      aeroplane-mode green and the precache count recorded. Post-`6820e49`
      visual output is Gate **2.22/0.28/5.41/4.38%** and Vehicle
      **10.06/10.68/47.38/46.99%** (dark/web, light/web, dark/mobile,
      light/mobile); visual acceptance remains unmet. The implementation report
      records typecheck, lint, test, build, and `test:e2e` **4/4** as passing,
      with **59 precached assets**. Earlier Gate **6.31/6.16/70.85/71.05%**
      and Vehicle **10.45/10.60/63.81/64.48%** values are stale pre-fix
      measurements retained in `CURRENT-STATE.md`.
      **Superseded 26 Sep — the 24 Sep figures below are stale, Vehicle's by
      about 2.5 points. Measured at `b762ddf`: Gate 1.44/1.43/4.62/4.61%**
      (1360x1530 matching; mobile 390x1599 vs ref 390x1661) and **Vehicle
      13.37/13.95/14.52/15.16%** (web 1360x1221 vs ref 1294; mobile 390x1503
      vs ref 1581).
      **The 26 Sep task work is not what moved them.** The same two screens
      were measured at `f3957fa`, before ACC-155/157/158/161/163 were written:
      Gate **1.45/1.44/4.65/4.65%** and Vehicle **13.38/13.96/14.56/15.19%**,
      at identical dimensions. So that whole batch moved every variant by 0.04
      or less, and Gate slightly for the better. The drift happened between
      `1371ef9` and `f3957fa` — the ACC-152/ADR-021, ACC-153 and ACC-154
      window — **bisected 26 Sep, and it is none of those.** `git bisect run`
      over the 49 commits, probing the rendered height of `/gate/vehicle` at
      1360px (1230 → 1221, a signal independent of the reference PNGs, which
      did not change in the window), lands on **`50e827e`
      `feat(ACC-128): login checking-state form skeleton; global-error.tsx
      created`**. The mechanism is **`app/global-error.tsx`**, not the login
      skeleton: that commit's only CSS is scoped to `.utility-auth` and cannot
      reach the gate. Confirmed by removing `app/global-error.tsx` at `b762ddf`
      and rebuilding — Vehicle returns to **exactly** the 24 Sep dimensions,
      1360x1230 and 390x1519. `global-error.tsx` replaces the root layout when
      it is active, so it imports its own subset of the same fonts and
      stylesheets (`@fontsource/*`, `globals.css`, `v2.css`); adding a second
      entry that imports the same CSS changes the merged chunk order, and the
      cascade with it. **A file that renders only on a root-layout crash is
      silently changing the layout of screens that never render it** — worth
      knowing before anyone hunts this inside `app/gate/`.
      **The residual was bisected too, and it is the harness.** A second
      `git bisect run` over the same window, on the dark/web percentage,
      lands on **`0a0c40e` `fix(ACC-109): close the gate harness's credential
      dependency`** — which touches `scripts/visual-check.mjs` and two docs
      and **no application code at all**. The two causes sit on parallel
      worktree branches (neither is an ancestor of the other), so the four
      combinations were each measured directly:

      | state | `global-error.tsx` | harness mocks `/api/gate/pull` | dark/web | height |
      | --- | --- | --- | --- | --- |
      | `a4050f5`, `dd38713` | no | no | 10.87% | 1230 |
      | `3add736` | **yes** | no | 11.43% | 1221 |
      | `0a0c40e` | no | **yes** | 12.86% | 1230 |
      | `8086c9b` | **yes** | **yes** | 13.38% | 1221 |
      | `b762ddf` (HEAD) | **yes** | **yes** | 13.37% | 1221 |

      The two are additive and account for the whole move:
      10.87 + 0.56 + 1.99 = 13.42, against 13.38 measured.
      **So none of the 2.5-point "regression" is the vehicle screen.** 0.56 is
      an unrelated root file reordering the CSS chunks; 1.99 is the harness
      being *fixed* — before `0a0c40e` it left the gate unauthenticated during
      capture, so the screen it photographed was wrong. The capture got more
      correct and the number got worse, which is only possible because the
      reference is stale. That is the same conclusion the diagnosis below
      reaches from the other direction, now with the arithmetic behind it.
      **The 24 Sep figures, kept as the record they were:** at `1371ef9`,
      Gate **1.51/1.50/6.20/6.64%** and Vehicle **10.88/11.42/14.58/15.10%**
      (dark/web, light/web, dark/mobile, light/mobile). Two distinct problems,
      unlikely to share a fix: Gate's **web** variants miss by ~1.5% with
      *matching* dimensions (1360x1530 both sides), while Gate **mobile** was
      46px short and Vehicle short on every variant. Presentation only — no
      diff in `gate/db.ts`, `gate/roster.ts` or the outbox. **Hard stop: not green
      and rehearsed by 2 Oct → revert and ship gate on v1** · **CU** · due Thu
      2 Oct
      The 59-asset count is historical evidence from that earlier build; the
      later inspected generated worker contains 60 entries (see
      `CURRENT-STATE.md`).
      **Diagnosed 24 Sep — the app is not what is failing.** `design/reference/`
      was captured 20 Sep from `2d4d6e0`; the frozen source moved at `418b416`
      (21 Sep) and `052bf93` (24 Sep, ACC-130 deleted both result-panel tab
      rows) and was never re-captured, so the PNGs are two commits behind the
      contract they render. Against a reference regenerated from the **current**
      frozen source, Gate measures **0.31/0.32/0.38/0.37%** and Vehicle
      **0.40/0.40/0.25/0.26%** — all eight variants under the bar, dimensions
      exact, **with no application-code change**. The two residuals were both
      harness artefacts and are fixed in `scripts/visual-check.mjs`:
      `/api/gate/pull` and `/api/gate/issue` were unmocked (401 → `needsLogin`
      → the `.meta` row wraps → +16px; the `.env.local` trap the 24 Sep ACC-132
      entry chased), and Playwright left `:hover` parked on the vehicle CTA
      (2.45 of Vehicle/web's 2.86%). `test:e2e` **26/26**; build emits **55**
      precached assets (2 routes, 25 scripts, 1 css, 24 fonts, 1 wasm).
      **Blocked on one sanctioned regeneration of `design/reference/` from the
      current frozen source** (the ACC-100 precedent — not a re-baseline; the
      contract does not move), which is Vipin's call because it also rebases
      ACC-104/106/107. Full measurement in the 24 Sep CURRENT-STATE entry.
      **On the 2 Oct hard stop: v2 is reachable — do not revert to v1.**
      Latest targeted evidence after `ffb03c1` (20 Sep 2026) measured Gate
      **2.21/0.19/2.78/0.49%** and Vehicle **6.72/0.54/10.92/1.35%**
      (dark/web, light/web, dark/mobile, light/mobile), with exact dimensions
      preserved; 5/8 variants passed, so ACC-109 remains incomplete. The fresh
      build emitted **60 precached assets** (3 routes, 30 scripts, 1 CSS,
      24 fonts, 1 WASM), and aeroplane-mode `test:e2e` passed **4/4**.
- [x] **ACC-110** · Derive the six ungated screens (`orgs`, `aaa`, `devices`,
      `users`, `login`, `gate/setup`) plus `error`/`not-found` from the v2
      primitives. Not pixel-gated — nothing exists to gate
      against · **CU** · due Fri 3 Oct
- [ ] **ACC-111** · v2 sign-off: full gate green, guard-mutation proof, manual
      walkthrough at 390/900/1360 and light theme, dated CURRENT-STATE entry
      with measured numbers, DESIGN-SYSTEM rewritten for the new authoring
      model. Do not push or deploy · **CU** · due Fri 3 Oct

## Phase 4b — The accreditation pack · 21 Sep → 3 Oct

**Added 21 Sep on Vipin's instruction.** The printed pack arrived: eight woven
wristband tiers, six zones, a per-zone allow/turn-away sheet, `+ photo ID`, and
a 22:00 window on Promoters Lounge → Backstage. The app implements the 8-Sep
design's three types and seven zones. The bands are already manufactured, so the
pack wins on domain vocabulary — see ADR-018, which supersedes ADR-001 on that
point only. v2 remains the pixel contract (ADR-017).

**This lane IS on the critical path.** The pass must name the tier that is
printed on the band the volunteer hands over. ACC-111 was parked for it.

- [x] **ACC-112** · Transcribe the pack into `design/source/accreditation/`
      (the ten sheets + `access-matrix.json`) and write ADR-018. Acceptance: all
      26 allow rows, every `+ photo ID` flag and the 22:00 window present; the
      pack's three internal discrepancies recorded, not
      reconciled · **C** · due Mon 22 Sep
- [x] **ACC-113** · The migration: rebuild both enums, add
      `boa_acc_zone_access`, add advisory `boa_acc_person.requested_type_code`,
      reseed `boa_acc_type`. Acceptance: `check:sql` + `test:db` green;
      `db:state` shows 6 zones, 8 types, 26 access rows; `anon` still holds zero
      grants, proven in `privileges.test.sql` · **C** · due Tue 23 Sep
- [x] **ACC-114** · `lib/design.ts` + the Zod mirrors + a new
      `accreditation-contract.test.ts`. Acceptance: typecheck, lint, test green;
      the contract test fails when any single matrix cell is mutated, proven by
      running it · **C** · due Wed 24 Sep
- [x] **ACC-115** · Desk + gate surfaces render 8 tiers and 6 zones from the
      data layer, not fixtures. Acceptance: queue, master, passes, control room
      and gate all render; `test:e2e` green. **Blocked on the eight type-chip
      colours** — Vipin's call, see ADR-018 · **C/V** · due Fri 26 Sep
- [ ] **ACC-116** · Roster collection form: `scripts/roster-form/build-roster-form.gs`
      builds a Google Form linked to a response sheet; `docs/ROSTER-FORM.md`.
      Changed 21 Sep from a per-org workbook to a single form, at Salman's call.
      Acceptance: form run once, opened by a human, every dropdown and
      validation seen working, test submission lands in the sheet. **Org
      dropdown follows ACC-142** (free text until then; 16 real responses in
      the sheet by 22 Sep) · **C/V** · due Mon 22 Sep
- [x] **ACC-117** · `boa_acc_import_roster` + a validator and loader that read
      the form's response sheet (exported CSV, columns per
      `docs/ROSTER-FORM.md`). Acceptance: a 500-row fixture imports in one
      call; quota refusal and duplicate phones reported per row; the
      privileges test covers the new function. **Needs the crew type → band
      mapping from Salman** · **C** · due Sun 28 Sep

> ## ▶ MILESTONE B — Sun 4 Oct · the gate works
> **Freeze begins.** Hot fixes only, each with `db:state` before and after and a
> line in CURRENT-STATE.md. No deploys while phones hold queued writes.

## Phase 5 — Live · Sun 4 – Sat 10 Oct

- [ ] **ACC-070** · Daily 08:00 reconcile: bands issued vs ledger; NOT IN BMS chased from `/desk/master?in_bms=false` · **B** · every day
- [x] **ACC-071** · Watch `verify-deploy` (runs 08:00 IST daily) — production
  verifier passes 18/18; awaiting logged scheduled-run evidence · **C/V**
- [ ] **ACC-072** · Post-show: export the ledger, reconcile against paper · **B** · 11 Oct

## After the show

- [ ] **ACC-080** · **9 Nov 2026** — retention review. Re-confirm holding personal
      data until BOA 2027 planning, or narrow it: org names/contacts/quotas are
      what 2027 needs; individual crew phone numbers and plates are the standing
      liability. See OPERATIONS.md. · **V**

---

## Cut order, if time runs out

Cut from the top. Each line says what happens instead.

| Cut by | What | Fallback |
|---|---|---|
| any time | v2 pixel fidelity (ACC-104–111) | Ship the screens as they render now; the gate reverts to v1 per ACC-109. |
| any time | Light theme | Ship dark only. The token block is already written — half a day to restore. |
| 2 Oct | CSV export | Copy out of the master list. |
| any time | WhatsApp share button | Copy the `/p/<token>` link by hand. |
| 2 Oct | `/desk/aaa` screen | Insert the 18 rows by SQL. The guard in `boa_acc_decide` still holds. |
| 2 Oct | `/desk/passes` print sheet | Forward pass links; most crew will show a phone. |
| **8 Oct** | **`/gate/vehicle`** | Security runs a printed plate→sticker list 5–7 Oct. **Must be live before the 8 Oct load-in peak.** |

**Cannot be cut, at any price:** the import-and-approve path · approval in the database ·
pass-token-only-after-approval · the offline scanner and its outbox · ledger
immutability · the `anon` lockdown.

## If Milestone A is going to slip — historical

> Milestone A was retired on 22 Sep: option 3 below is, in effect, what
> happened. Kept for the record (ADR-019).


Decide by **Thu 17 Sep**, not on the 20th. In order of preference:

1. **Send links for the 10 largest orgs first.** They carry most of the 641
   people and the longest internal turnaround.
2. **Ship the submission surface without the Control room.** ACC-033 is
   presentation; the form is the critical path.
3. **Collect by spreadsheet for the stragglers and import.** Ugly, works, and
   keeps quota enforcement server-side where it matters.

Do **not** solve a slip by skipping the `curl` quota test. That test is the
difference between a quota and a suggestion.
