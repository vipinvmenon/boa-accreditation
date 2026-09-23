# Operations

> **Status: specification.** Written before the system exists so the runbook is a
> requirement on the build, not an afterthought. Nothing here has been rehearsed
> yet — see CURRENT-STATE.md.

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
Crew · Photo · Eddie's Lounge**. Type the exact label from that list, with a
straight apostrophe. If you are not sure yet, leave the cell blank — that person
is imported but waits, and gets no pass until you fill it in. General Admission is
not a choice (it is the public ticket band, not an accreditation).

**Export.** File ▸ Download ▸ Comma-separated values. The import script reads only
the columns Google named, in order. Any rearrangement or renaming breaks it silently.
Keep desk work to the right of column H and never insert rows: responses land in the
next empty row.

**Validate, then import.** Vipin, with a `responses.csv` from the sheet, runs three
commands in order at a terminal:

```bash
corepack pnpm roster:import responses.csv --offline
corepack pnpm roster:import responses.csv --dry
corepack pnpm roster:import responses.csv --as vipin@example.com --report data/report.csv
```

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
e.g. a curly apostrophe in `Eddie's Lounge`, or `General Admission`).

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
