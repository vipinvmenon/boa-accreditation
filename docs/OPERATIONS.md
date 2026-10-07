# Operations

> **Status: the system exists; the rehearsal has not happened.** Corrected
> 25 Sep 2026. This header used to say the runbook was "written before the
> system exists". That half is no longer true — the desk, the gate and the
> ledger are built and their tests pass.
>
> The other half still stands, and matters more: **nothing here has been
> rehearsed by the people who will run it.** No roster has been imported, no
> WhatsApp pass has been sent, and no issuer other than Vipin has ever logged
> in. The two-issuer rehearsal script below (ACC-147) is written and waiting,
> not completed. Read this as a runbook to follow, not a record of something
> that has already worked.

This is a runbook, not a description. It exists because on 10 October only
Bhoopesh will fully understand the desk, and he may be unreachable.

## The BMS loop — manual, and the highest-risk routine

There is **no BookMyShow API.** Approved names are typed into the BMS dashboard by
hand and tickets issued there. The app's only job is to track who is still to be
entered.

**Daily, 08:00:**
1. Open `/desk/master?in_bms=false` — this is the worklist.
2. Enter each person into BMS, issue the ticket.
3. Mark the row In BMS. One row at a time, after it is actually done.
4. The Control room's `NOT IN BMS` figure should fall to match.

The number is on the wall on purpose. There is no technical fix for drift between
two systems joined by a person typing; the fix is that the gap is visible daily.

## Gate runbook

**Setting up a device** — done at the desk, on wifi, never at the barrier:
1. Mint a device token at `/desk/devices`. It is shown **once**.
2. On the phone, open `/gate/setup`, paste it, wait for the roster to finish
   pulling. The header shows the count and the as-of time.
3. Confirm the count matches the Control room's approved figure.
4. Only then take the phone to the gate.

**Three outcomes, no fourth:**
- **Green** — approved, not collected. Type a band serial (or leave it blank),
  hand over a band of that colour, tap Issue. If a sticker is due, the plate is
  shown and the sticker field appears.
- **Amber** — already collected. It shows the time, gate and band. A reissue needs
  a supervisor note and **appends** a row; it does not replace the first.
- **Red** — refuse. Do not issue. Send them to the accreditation lead; their
  company can add them if quota remains.

**Cannot scan?** Use *Search by name*. Same roster, same verdict, same ledger row.
This is a first-class path, not a workaround.

**Offline is normal.** The chip shows `Offline | n queued`. Keep working. Writes
flush when signal returns. **Do not reinstall, clear the browser, or "start
fresh" while anything is queued** — that discards work that has physically
happened. If a device is behaving oddly, take it to the desk with its queue
intact.

**Paper fallback**, printed before 4 Oct and kept at the desk: the approved list
by organisation, and blank issue sheets. If every phone fails, the ledger is
reconstructed from paper afterwards.

## ACC-147 rehearsal — two issuers, two phones, own accounts

**This is the acceptance criterion for ACC-147.** Everything else — the search,
the scan, the outbox, the sync — has been verified by an agent (`typecheck`,
`lint`, `test`, `test:db`, `test:e2e` including the aeroplane-mode and
two-phone-sync suites, `build`, all green as of this writing). None of that
substitutes for two real people on two real phones. No agent can perform this;
it must be run by Vipin and one other person before **Wed 30 Sep**, and the
result recorded in `CURRENT-STATE.md` with a date and both names — not just
this checklist ticked.

**Before you start**

1. At `/desk/users`, invite two `issuer` operators if they don't already exist
   — real email addresses, one per person. Each sets their own password from
   the invite email.
2. A roster must exist in the database (ACC-145's first real import, or, if
   that has not run yet, at least a handful of test people approved through
   `/desk/queue` so the two phones have something to scan). **Zero people
   approved means zero rows on either phone — do this rehearsal after there
   is real data, or seed a few test people first and remove them after.**
3. Two phones, on the same WhatsApp/mobile network initially, each able to
   turn its own radio (aeroplane mode) on and off independently of the other.
   A QR code on paper or a second screen to scan is useful but not required —
   *Search by name* (ACC-131) is a first-class path and this rehearsal
   exercises it deliberately.
4. Know how to reach `/desk/master?in_bms=false` or the Control room from a
   laptop, to watch the ledger fill in from both phones.

**Steps — Issuer A and Issuer B, on their own phones**

1. **Both issuers, with signal:** open a browser, go to `/gate`. Not signed
   in yet → redirected to `/desk/login?next=%2Fgate`. Log in with your own
   issuer email and password.
2. **You SHOULD SEE:** back on `/gate`, the header **"Point at the pass
   code"** and, under it, **"N approved passes held on this device"** with a
   sync line under that reading **"Synced just now"**. If the
   roster is empty, you instead see **"No list on this phone"** — stop and
   fix step 2 of "Before you start" before continuing.
3. **Both issuers:** turn on aeroplane mode (radio fully off, not just
   Wi-Fi). Confirm the phone shows no bars/no Wi-Fi icon.
4. **You SHOULD SEE:** the status line changes to **"Offline | 0 queued"**.
   The scanner still shows **"Ready"** / *"Hold the pass code inside the
   frame. Works with the radio off."* — nothing about being offline blocks
   the screen.
5. **Issuer A:** tap **"Can't scan? Search by name"**, type two or more
   letters of a real approved person's name (or, if the roster has a phone
   number, the last four digits). **You SHOULD SEE** a ranked list of
   matches appear as you type, each row showing name, org, role and band
   colour. Tap one.
6. **You SHOULD SEE:** the right-hand panel turns **green**, headed
   **"Approved"**, with the person's name, org, role, band colour and the
   six-zone strip. Type a band serial (or leave it blank — both are valid;
   nothing is pre-printed or pre-assigned). Tap **"Issue wristband"**.
7. **You SHOULD SEE:** the button changes to **"Wristband issued"** (now
   disabled) and a status line reads **"Wristband recorded on this device.
   It syncs when signal returns."** The "Offline | n queued" chip now reads
   **"Offline | 1 queued"**.
8. **Issuer A, same phone, same person, still offline:** tap **"Next
   person"**, then find the *same* person again (scan or search) and check
   in. **You SHOULD SEE amber**, headed **"Collected"**, with the exact line
   *"Issued HH:MM · [gate label] by [Issuer A's name]"* — this is the local
   double-tap guard and the pending-outbox amber case, both working with the
   radio still off.
9. **Issuer B, on the second phone, also offline, at the same time as step
   5–7:** find and check in a **different** approved person the same way.
   Confirm B also sees green → issue → **"Offline | 1 queued"**.
10. **The double-issue case (ACC-148):** with both phones still offline,
    **Issuer B finds the same person Issuer A checked in at step 6** (search
    by name — this is the realistic case: no signal, no way for B's phone to
    know A already did it) and issues a *second* band to them, with a
    *different* serial than A used. **You SHOULD SEE green on B's phone**,
    not amber — this is the accepted gap ADR-020 names explicitly: two
    offline phones cannot stop each other. Confirm it does **not** error or
    block.
11. **Both issuers:** turn the radio back on.
12. **You SHOULD SEE, within about a minute (per OFFLINE-SYNC.md's
    convergence bound — issue posts immediately, the other phone re-pulls
    within 45s + a 5s tick):** the "Offline | n queued" chip changes to
    **"Online | 0 queued"** and the sync line reads **"Synced just now"**
    on both phones. Amber **"List is N min old"** means that phone has not
    heard from the server for 5 minutes or more.
13. **On a laptop, open the Control room (`/desk`).** **You SHOULD SEE** a
    section headed **"1 person holds two live bands"** (or more, if you
    staged more than one double issue), listing the double-issued person's
    name and org, both band serials, both issuers' real names, both gate
    labels and both issue times, under the caption *"Caught after sync · Both
    bands are on record. Void the spare next time this person is at the
    gate."* **Neither ledger row is missing or overwritten** — this is the
    point of non-negotiable #2; if a serial or an issuer name is blank or
    wrong, that is a defect, not an acceptable gap.
14. **On the same laptop**, confirm `/desk/master` shows both people (A's
    first pick and B's pick) as checked in, and the person from step 10 shows
    two check-in events if you open their row detail.
15. **Sign-off:** once 1–14 all match what they SHOULD SEE, record in
    `CURRENT-STATE.md`: the date, both issuers' real names, both phone
    models/browsers used, and any deviation from the steps above (however
    small — a wrong verdict colour, a chip that didn't update, a delay past a
    minute). **Do not tick ACC-147 in `docs/ROADMAP.md` from this rehearsal
    alone if step 3 was skipped because a phone could not reach aeroplane
    mode, or if the roster used was test data rather than real approved
    people** — say so plainly instead.

**What this rehearsal does not cover:** iOS Safari's `zxing-wasm` fallback
path (ACC-053b — still unverified on a real iPhone as of this writing; if
neither phone is an iPhone, the camera-scan path is only proven on
`BarcodeDetector`-capable Android/Chromium, and *Search by name* is the only
proven path on iOS until ACC-053b is separately closed), and the vehicle
barrier (ACC-109/ACC-058, a separate rehearsal).

## Vehicle barrier

Sticker **and** wristband. Both, or neither.

A match on the plate is not a match on the vehicle — the officer checks the
sticker against the plate physically in front of them. If a sticker was issued at
another gate and has not synced, type the sticker number; it logs with
`checks.sticker = false` and the visual check is the real control.

Turning a vehicle away **requires a reason**. It is logged.

## Freeze — 4 to 10 October

No deploys except hot fixes. Every hot fix: `corepack pnpm db:state` before and
after, and a line in CURRENT-STATE.md.

A deploy while phones hold queued writes is the one change that can lose work
that has physically happened. This is why the outbox drains to route handlers and
never to server actions (ARCHITECTURE.md).

## Who can do what

| | |
|---|---|
| Salman | approves the AAA nominations. His own account — that is the control |
| Bhoopesh | accreditation lead. Queue, master list, BMS loop, device tokens |
| 2 approvers | the queue. **Each must run it once before 4 Oct**, not for the first time on the day |
| Gate volunteers | no accounts. A device token, pasted once |

## The daily loop — until the form closes

This loop runs each day from now until the form closes. A person at the desk, Vipin
at a laptop, and Bhoopesh at the BMS terminal; the three are coordinated by who
sends what, when.

**Salman decides.** Open the response sheet at
<https://docs.google.com/spreadsheets/d/1i8lwUIDdZ3BNuAN-QsTM0UsHceDXStGmINjb3bIVFXs/edit>.
For each new row without a value in column I ("Accreditation Type"), decide which
band colour goes with this person: **AAA · Artist · Stage · Promoters Lounge ·
Crew · Photo · Eddie's Lounge · General Admission**. Type the exact label from
that list, with a straight apostrophe; `GA` also works for General Admission. If
you are not sure yet, leave the cell blank — that person is imported but waits,
and gets no pass until you fill it in. General Admission is for **named guests**
(friends and family) who collect a GA band at accreditation (ADR-030); the public
GA bands are still issued by ticketing.

**Sync.** One command pulls the sheet, validates it, and dry-runs it against the
database. It writes nothing:

```bash
corepack pnpm roster:sync
```

It stops after the dry run on purpose. When the output looks right, load it as the
operator who is accountable for the decision:

```bash
corepack pnpm roster:sync --as vipin@example.com
```

Add `--gid <tab-id>` if the responses are not on the first tab.

**Re-running the whole sheet IS the sync.** `public.boa_acc_import_approve` is
idempotent on (organisation, phone), so there is nothing to diff and nothing to
remember:

| In the sheet | What the database does |
|---|---|
| New row, column I filled | Imported, approved, pass minted |
| New row, column I blank | Imported as `submitted` — no pass until Salman decides |
| A row already imported | `unchanged` |
| Column I changed **after** that person was approved | `tier_changed` — **reported, never applied** |
| Same phone twice in one organisation | `duplicate_phone`, refused |

The fourth row is the one to watch. Someone already holding a pass never has it
silently swapped; the database reports it and a person decides. **Those reports
only work if someone reads them** — check the report file after every load.

The import reads only the columns Google named, in order. It does not break
silently on a rename: it refuses, and prints the header it expected. Keep desk
work to the right of column H and never insert rows — responses land in the next
empty row.

<details><summary>Downloading the CSV by hand instead</summary>

File ▸ Download ▸ Comma-separated values, then:

```bash
corepack pnpm roster:import responses.csv --offline
corepack pnpm roster:import responses.csv --dry
corepack pnpm roster:import responses.csv --as vipin@example.com --report data/report.local.csv
```

Name the report `*.local.csv` under `data/` so it stays out of git.
</details>

### Pulling the sheet

`corepack pnpm roster:fetch` reads the sheet directly. On 25 Sep 2026 it worked
with **no credentials at all**, because the sheet was shared "anyone with the link
can read" — which also meant every crew member's name and WhatsApp number was
readable by anyone holding the URL. The script prints a warning whenever it
succeeds that way, and it should stop being able to.

Once the sheet is restricted to named people, give the script its own read access:

1. Create a Google Cloud service account and download its JSON key.
2. Share the sheet with the service account's email address as a **Viewer**.
3. Put the key's path in `.env.local`:
   `GOOGLE_SERVICE_ACCOUNT_KEY_FILE=../secrets/boa-sheets.json`

Scope is `drive.readonly`, so it can read that one shared sheet and nothing else,
and access is revoked by un-sharing. **The key is local only — it never goes into
Vercel.** The application has no Google dependency and must not gain one; only
this script talks to Google.

The first, `--offline`, proves the sheet is well-formed — column headers, dates,
phone numbers, all the characters — without touching the database. The second, `--dry`,
reads the database in read-only mode and reports every row with a known organisation.
Unknown organisations are never guessed; they are listed by row number so Vipin can
add them (see `docs/ORG-IMPORT.md`). The third runs the real load, and records every
outcome — **approved** (column I filled, person new or still waiting → approved and
pass minted in the database, including a unique reference number, AAA included),
**inserted** (column I blank, new person → marked as waiting), **unchanged** (already
imported the same way), **tier_changed** (already approved, and now the sheet says
another tier or days, or the cell was cleared — **reported, never silently applied**),
**duplicate_phone** (the same number twice in this sheet or already on another org),
**skipped** (already rejected by the desk), **refused** (approval guard failed, e.g.
AAA nomination already stamped to someone else), or **invalid** (field rule failed,
e.g. a curly apostrophe in `Eddie's Lounge`, or a lower-case `ga`).

Every outcome goes in the report file with the row number, organisation, and reason.
The file never holds a name or a phone number.

**Send the passes.** From `/desk/passes`, Vipin clicks **Send all unsent (N)** to
queue up to 40 WhatsApp messages at a time. The page repeats the request until all
approved people with no pass sent yet have one queued. Every send shows a status:
**queued** (waiting), **sent** (message left the desk), **delivered** (person got it),
**read** (they opened it). Failures list Meta's reason — a number not on WhatsApp, an
invalid template, the API temporarily down. A person who says they got no message:
check the status on `/desk/passes`, or resend (requires confirmation).

**Statuses never go backwards.** If a pass was marked Delivered yesterday and today it
shows Read, that is Meta's webhook; if it steps back, the phone had an old cached
status and the sync will fix it.

**Note:** No WhatsApp message has been sent yet. ACC-151 (Vipin's setup in Meta
Business Manager) is outstanding. Once that is done, this step works automatically.

**BMS.** Bhoopesh opens `/desk/master?in_bms=false` — the list of approved people not
yet in BookMyShow. For each one, he enters the name into the BMS dashboard and issues
the ticket, then marks the row In BMS, one at a time, after it is actually done. Every
person in BMS lifts the Control room's `NOT IN BMS` figure by one.

### Who does what

| | |
|---|---|
| Salman | Fills column I in the sheet. Decides each tier by eye and gut. If unsure, leaves it blank; the person waits. **His own account** — that is the control. No one else touches column I. |
| Vipin | Runs the three loader commands. Adds any new organisation to the database (see ORG-IMPORT.md). Sends passes on WhatsApp. Has access to `/desk/*`. Lead or admin. |
| Bhoopesh | Enters approved people into BMS. Watches the worklist. Has access to the BMS terminal and the app. Accreditation lead. |
| Issuers (up to 10) | Log in at the check-in desk and issue wristbands. Each issues in their own session; every band record names the person who handed it over. No approval, no import. |

### When something looks wrong

**A row is refused as "unknown organisation".** The organisation does not exist yet.
Check `docs/ORG-IMPORT.md` — new orgs are added through a separate import process,
before their people are imported here. Ask Vipin to create it.

**A person says they got no WhatsApp.** Check the status on `/desk/passes`. If it says
**queued**, **sent** or **delivered**, they got it; resend for certainty. If it says
**failed**, read Meta's reason (not on WhatsApp, invalid template, etc.). If it says
nothing (status blank), the person was not approved yet — check column I in the sheet
and Salman's decision.

**The same phone number appears twice.** Either one person submitted twice (delete the
extra row from the sheet and re-export), or two people genuinely share a number. The
database refuses it. One number, one person. If it is a shared house phone or a
WhatsApp group number, ask Salman — the phone is the unique key for a pass and a BMS
ticket.

**A person's crew type was typed by hand in column I.** Column I is the band tier, not
a crew type. The crew type is what the form asked; the tier is what the desk decides.
If the cell says `Bouncer` or `Sound & Lights`, Salman typed the wrong thing — it will
refuse as invalid (not one of the seven labels). Ask him to fix it: type a tier, not a
role.

**Re-importing the same sheet.** Safe. A person already approved stays approved with no
changes to their name, role, or plate — re-runs return `unchanged`. If Salman decided a
new tier since the last run, that row alone is approved with the new tier. Everything
else is left as it was.

**Note:** No roster has been imported yet. `boa_acc_person` is empty as of 23 Sep 2026.
The organisations in the database are still placeholders. The first real import waits on
ACC-151 (Meta setup) and on you seeing this written and understanding it works.

## Retention — decided, with a dated review

Personal data (641 names, phone numbers, vehicle registrations) is **retained
until BOA 2027 planning begins**, per Vipin's decision of 10 Sep 2026, so next
year's vendor list is a copy rather than a rebuild.

**Review task — 9 November 2026.** Re-confirm the decision once the show is
settled, and consider narrowing: the data useful for 2027 is org names, contacts,
quotas and headcounts, while the standing liability is individual crew phone
numbers and plates. Those two sets can be separated without losing the planning
value.

Compensating controls meanwhile: nightly encrypted backups (below), `pass_token`
carries zero column grants, and no export leaves the desk without a reason.

## Backups — nightly encrypted dump, not PITR

**Decided 11 Sep 2026, replacing ACC-028.** Supabase PITR is a paid add-on on
top of Pro (~$100+/mo) — disproportionate for a single-weekend event. Instead,
`.github/workflows/backup.yml` runs a `pg_dump` nightly at 03:00 IST, encrypts
it with `gpg --symmetric` using the `BACKUP_ENCRYPTION_KEY` secret, and uploads
it as a workflow artifact (90-day retention).

**What this covers:** an accidental drop, a bad migration, or a corrupted
table — the risk ADR-002 actually named. **What it does not cover:** recovery
mid-day without waiting for that night's run — up to 24h of data could be lost
between the last dump and an incident. Accepted; see ADR-002.

**One-time setup (Vipin):**
1. Generate a passphrase: `openssl rand -base64 32`
2. Add it as a GitHub Actions secret named `BACKUP_ENCRYPTION_KEY` — same
   place as `SUPABASE_DB_URL` (repo Settings → Secrets and variables → Actions)
3. **Save that passphrase somewhere durable outside GitHub too** — a lost
   passphrase makes every dump permanently unreadable. A password manager
   entry, not a note in Slack.

**To restore** (only ever tested against a *new* project, never the live one):
```bash
gh run download <run-id> -n boa-accred-<timestamp>.sql.gpg
gpg --batch --yes --decrypt --passphrase "$BACKUP_ENCRYPTION_KEY" \
    --output restored.sql boa-accred-<timestamp>.sql.gpg
psql "$SUPABASE_DB_URL" -f restored.sql
```
**Rehearse this once before 4 Oct** — the first time you try a restore should
not be during an actual incident on show day.
