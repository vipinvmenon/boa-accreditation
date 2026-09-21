# The roster form

How the organisations tell us who is coming, and how that becomes rows in
`boa_acc_person`.

**Sibling of [ORG-IMPORT.md](ORG-IMPORT.md).** That file covers loading the
*organisations*. This one covers collecting their *people*.

## Live links

**Owner: `vipinmenon16@gmail.com`.** Every link below belongs to that Google
account. Links checked 21 Sep 2026: the script was run three times and printed
the same three links every time.

| What | Who gets it | Link |
|---|---|---|
| **The form** | **Send this to organisations.** The only link that leaves the team | <https://docs.google.com/forms/d/e/1FAIpQLSdJWSkxUFdhzB919ufQCJEvIqwEu-5yPw2U3D87z4uKd99Cfw/viewform> |
| Form editor | Desk only. Change questions in the script, not here | <https://docs.google.com/forms/d/1ITVqE7NAcwSDW_uZnGC5z7EaOTga-tyAATY_Xf07TPA/edit> |
| Response sheet | Desk only. Holds names and phone numbers, **never share outside the desk** | <https://docs.google.com/spreadsheets/d/1i8lwUIDdZ3BNuAN-QsTM0UsHceDXStGmINjb3bIVFXs/edit> |
| Apps Script project | Whoever maintains the form. Runs `build-roster-form.gs` | <https://script.google.com/home/projects/1rHY2JPc-l5T7Q4pAEKIku9OXaKKHBLK1cJwz8Avtx1-wkSINdScq6ZGv/edit> |

Form ID `1ITVqE7NAcwSDW_uZnGC5z7EaOTga-tyAATY_Xf07TPA` ·
response sheet ID `1i8lwUIDdZ3BNuAN-QsTM0UsHceDXStGmINjb3bIVFXs`.

Re-running the script keeps all of these. It changes only if someone runs
`forgetForm`, and then a **new** form and link are created, which would have to
be sent out again.

### Superseded: do not send

Four earlier test forms, owned by `vipinmenon006@gmail.com`, were created on
21 Sep before the script could update in place. They are **not** linked to
anything the desk reads. **Moved to Drive trash on 21 Sep** at Vipin's request
(recoverable from `vipinmenon006`'s trash). Their four response sheets were not
trashed and still exist:

| Form ID (`vipinmenon006`) | Notes |
|---|---|
| `1tqh0DpRcKbnW-QHZ9Su77eALKRR0WeToajJFph12Teo` | first run |
| `1Ro7gO5zIZSgEslfBbjlMGMrf6V8lC67M95wPGMdRTIo` | holds one test response |
| `1HwwXKCJwF36Q_fjv4fyf34uXn8-Z8VOHbaMKeoLfH_w` | |
| `1MlTEB1odW4QcrrguVfZKh2j4eYchlyX5C5MP8-feC4c` | |

## Why a form

Decided 21 Sep 2026 by Salman and Vipin, replacing a per-organisation workbook.
One Google Form, one linked response sheet: every submission from every
organisation lands in one place, and a form cannot have its columns renamed,
reordered or extended by the person filling it in.

The trade-off is one submission per person. The form shows "Submit another
response" after each one to keep that quick.

## Building it

`scripts/roster-form/build-roster-form.gs` is a Google Apps Script. It cannot be
created through the Drive connector — that connector has no Forms API — so it
is run by a human, in an Apps Script project at <https://script.google.com>:

1. Paste the file over everything ▸ Save
2. **Keeping a form that already exists?** Paste its *edit* link (ending
   `/edit`) into `KEEP_FORM` at the top. Not the respondent link — the script
   refuses that one, because its ID cannot be opened.
3. Select `buildRosterForm` ▸ Run, and authorise
4. The execution log prints the form link to send out, the edit link and the
   response spreadsheet

### One stable link

The first run creates the form (or adopts `KEEP_FORM`) and stores its ID in the
project's Script properties. **Every later run updates that same form in place**
— same respondent link, same response sheet. Change a question in the script,
run again, and the live form changes; nothing new is minted.

How it stays safe to re-run:

- Questions are matched by a stored ID, then by title, then by a known former
  title (`legacyTitles`), so a rename edits the existing question rather than
  adding a second one and splitting its column.
- It plans every change before touching the form. If a question must change
  *type* (e.g. free text → dropdown) Google cannot convert it in place; with no
  responses the script rebuilds it and logs a note, and **with responses it
  refuses before changing anything**.
- Questions it does not manage are left alone and named in the log.
- The linked response sheet is kept; one is created only if none is linked.

`forgetForm` clears the stored ID, so the next run creates a brand-new form. The
old form is not deleted.

The response sheet downloads as Excel (**File ▸ Download ▸ Microsoft Excel**)
whenever needed.

## What it asks

| # | Question | Type | Required | Rule |
|---|---|---|---|---|
| 1 | Organisation | dropdown, or text | yes | Dropdown once `ORGS` is filled in (ACC-030a); free text until then |
| 2 | Full name | text | yes | 2–80 characters, as on their photo ID |
| 3 | WhatsApp number | text | yes | 10 digits starting 6–9, no `+91`. The importer adds `+91`. Renamed from "Mobile number" by Vipin, 21 Sep |
| 4 | Crew type | multiple choice + Other | yes | Security · Bouncer · Bar Crew · Merch Crew · Artist Hospitality · Food Stalls · Cashless · Sound & Lights · Generator · Ground Production · Sponsor · Special Tickets Crew · BOA Internal Crew · **Other (write-in)** |
| 5 | Job title | text | no | 2–60 characters |
| 6 | Days on site | single choice | yes | Build days only (5–9 Oct) · Show day only (10 Oct) · Both build and show |
| 7 | Loading vehicle registration | text | no | Only for a vehicle loading or unloading equipment. e.g. `KA01AB1234`; lower case and spaces accepted, normalised on import |

The form does not collect respondents' email addresses.

**What it never asks:** ID number, Aadhaar, photograph, address, date of birth.
Non-negotiable #9. `tests/unit/roster-form.test.ts` fails if a question title
drifts toward any of them.

### Crew type, not band

Organisations do not know which wristband someone needs — they know what the
person does. So the form asks crew type, and the **desk assigns the band at
approval**, which is where the schema already puts that decision
(`boa_acc_person.type_code` is set only by `boa_acc_decide`). Non-negotiable #3
is untouched.

The crew type list is Salman's, plus **Special Tickets Crew**, **BOA Internal
Crew** and a write-in **Other**, all added by Vipin on 21 Sep so nobody who falls outside the list is
blocked from being submitted.

It is a multiple-choice question rather than a dropdown for exactly that
reason: Google Forms only offers a write-in "Other" on multiple choice. Whatever
is typed lands in the response sheet as the crew type itself — there is no
separate "Other" column.

Consequences for the desk and the importer:

- A write-in crew type has no band mapping. Those rows need a person to decide.
- The form cannot validate write-in text. It becomes the role text when there is
  no job title, and the database limits role text to 2–60 characters, so the
  importer must refuse and report anything outside that rather than truncate it.

Change the list in `CREW_TYPES` in the script, not in the form editor, so the
change is recorded.

**Open:** the desk needs a crew type → band mapping to approve quickly. That is
an operational call for Salman, not something to infer. Until it exists,
approvers decide per organisation or per person.

### Why days are required

`boa_acc_person`'s CHECK refuses an approval without a `day_validity`, and
`boa_acc_approve_org` applies one validity to a whole organisation. Without this
question an organisation with build riggers and show-day bar staff can only be
approved wrongly, or row by row. The three answers map one-to-one onto
`build`, `show` and `build_show`.

## The response sheet is a contract

Google names each response column after its question title. The importer
(ACC-117) reads those columns by name:

```
Timestamp, Organisation, Full name, WhatsApp number, Crew type, Job title,
Days on site, Loading vehicle registration
```

**Do not reword a question in the form editor after launch.** It renames the
column and breaks the import silently. Change the title in the script and here,
together.

### The desk's column: Accreditation type

Added 22 Sep 2026 **by hand in the sheet**, by Vipin, for Salman to fill in:
column **I**, header `Accreditation Type`, a dropdown. It is **not** a form
question — organisations never see it. It is the desk's band decision, per
person, recorded next to the response:

```
…, Loading vehicle registration, Accreditation Type
```

The dropdown's choices must be exactly the pack's tier labels, with a straight
apostrophe: AAA · Artist · Stage · Promoters Lounge · Crew · Photo · Eddie's
Lounge. **General Admission is not a choice**: it is the public ticket band, not
an accreditation.

**The importer accepts it** (`lib/roster-import.ts`, `DESK_HEADER`): the header
may be the eight form columns *optionally followed by this one*, and nothing
else — any other extra column is still refused. Because a person typed it, its
header is matched **ignoring case and surrounding space**; the form's own
headers stay exact.

- A filled cell becomes the row's tier hint (`requested_type_code`) and **wins
  over the crew-type mapping**, because a person decided.
- **AAA and Artist** are named lists behind a nomination; the import RPC refuses
  them as a hint. Those rows import with no hint and are listed in a warning, to
  be approved through the desk's AAA nomination.
- A blank cell means *not yet decided*: the row falls back to the crew-type
  mapping, never to a default tier.
- Anything that is not exactly one of the labels above refuses that row — a
  curly apostrophe in `Eddie’s Lounge` included.
- It remains a hint. The band is still set at approval, in the database
  (non-negotiable #3).

Rules for whoever edits the sheet by hand:

- Keep desk columns to the right. **Never insert a column between form
  columns**, and never insert rows: responses are written into the next empty
  row.
- Sorting and filtering are fine; they move whole rows.
- Adding a new *form question* later makes Google add its column after the
  form's existing ones, which may land where the desk column is. Check the
  header row after any question is added.

## What the form cannot enforce

- **Quota.** A form has no idea how many people an organisation has already
  submitted. The quota is enforced on import, under the same row lock as the
  web form (`boa_acc_submit`), and over-quota rows are refused and reported.
- **Duplicates.** The same person submitted twice is caught on import by the
  existing duplicate-phone check, not by the form.

## Importing

> **Built (ACC-117), not yet applied to the database.** The migration
> `202609211100_boa_acc_import_roster.sql` is committed but has **not** been
> pushed to production, so the loader's real-load mode fails until it is.
> No roster has been loaded. Do not claim one has.

Export the response sheet as CSV (**File ▸ Download ▸ Comma-separated values**),
then:

```bash
node scripts/import-roster.mjs responses.csv --offline   # validate only, touches nothing
node scripts/import-roster.mjs responses.csv --dry       # + read-only org match and quota preview
node scripts/import-roster.mjs responses.csv --as you@example.com --report data/roster-import.local.csv
```

(`corepack pnpm roster:import -- …` runs the same thing.)

**What the validator does** (`lib/roster-import.ts`, pure, unit-tested in
`tests/unit/import-roster.test.ts`):

| Column | Rule |
|---|---|
| header | exactly the contract above, in order, or nothing is read |
| Timestamp | US locale `M/D/YYYY H:MM:SS`, no zone in the cell. **Read as Asia/Kolkata** and sent as `…+05:30`. That is an assumption about the spreadsheet's time-zone setting, which the CSV does not carry — check **File ▸ Settings** on the response sheet says GMT+05:30 before the first real import. Becomes `submitted_at` |
| Organisation | matched to `boa_acc_org.name` trimmed, whitespace-collapsed, case-insensitive. Unmatched names are reported with their row numbers |
| Full name | 2–80 characters |
| WhatsApp number | read as a **string**; 10 digits starting 6–9 → `+91…`. Spaces and dashes tolerated; a spreadsheet round-trip like `9.87E9` is refused, never repaired |
| Crew type / Job title | role text is the job title if given, else the crew type; 2–60 characters or the row is **refused, never truncated** |
| Days on site | the three answers → `build` / `show` / `build_show` |
| Loading vehicle registration | upper-cased, spaces removed, then the database's plate CHECK; blank is no vehicle |

A row is refused with every problem listed, by sheet row number. A phone
repeated within one organisation is flagged, and the database refuses it.

**Crew type → tier.** `data/crew-type-tiers.json` is the mapping, and it is
**empty** — Salman owes it. Until it is filled, no row carries a tier hint and
the loader says so. Values may only be a tier a vendor can request (ADR-018:
stage, promoters_lounge, crew, photo, eddies_lounge); a write-in "Other" crew
type never gets a hint and is flagged for a person to decide.

**What the loader does.** One call per organisation to
`public.boa_acc_import_roster(p_org_id uuid, p_rows jsonb)`, as the session of
the operator named by `--as`, who must be an active **lead or admin**.
It refuses to load if any row was refused or names an unknown organisation,
unless `--partial` is given. The report file holds row number, organisation,
outcome and reason — never a name or a phone.

**What the RPC does.** Inserts each row as `submitted` and returns one result
per row: `inserted`, `duplicate_phone`, `quota_exceeded` or `invalid`.

- Quota under the same `select … for update` on the org row as `boa_acc_submit`,
  so a web submission and an import cannot both take the last seat.
- **Not** through `boa_acc_submit`, whose 60-per-hour-per-token throttle is a
  control on the public surface and would take nine hours for 500 people.
- Per row, not all-or-nothing: the rows that fit load, the others are reported.
  Re-running the same file is safe — loaded rows come back `duplicate_phone`.
  A closed org, an unknown org or a non-lead/admin caller refuses the whole call.
- Sets only the advisory `requested_type_code` and **`requested_day_validity`**
  — a column this migration adds, because `day_validity` cannot be set before
  approval (the `pass_only_when_approved` CHECK) and the days answer would
  otherwise be lost. Never `type_code`, `day_validity` or a pass. Nothing reads
  either hint yet: the queue and `boa_acc_approve_org` do not show or use them.

### What the import has and has not been verified to do

- **Unit tests** (`tests/unit/import-roster.test.ts`): every column rule above,
  a generated 500-row sheet validating into one 500-row payload, and pins to
  the form script's questions/crew types/days, to `lib/design.ts`'s requestable
  tiers, and to the exact jsonb fields the migration reads.
- **Database, inside a transaction that was rolled back** (21 Sep 2026, against
  production, nothing persisted — checked afterwards that the function, the
  column and the fixture rows were absent): the migration applied cleanly;
  `supabase/tests/import-roster.test.sql` passed 14/14 (500 rows in one call;
  no pass, tier or validity on any row; quota and duplicates refused per row;
  re-run refused as duplicates; approver and no-session callers refused); the
  extended `privileges.test.sql` passed 86/86. Loosening the quota check to
  `>` made the quota assertions fail. The loader's exact SQL
  (`importRosterSql`) on a 500-row CSV inserted 500 in one call and a re-run
  returned 500 `duplicate_phone`.
- `--offline` and `--dry` were run against a generated file; `--dry` read the
  live organisation list.
- **Not verified:** the loader's real-load mode against the database (it
  writes, and the migration is not applied); an export of the real response
  sheet (it has no responses); the sheet's time-zone setting.
- Until the migration is applied, `corepack pnpm test:db` fails on
  `import-roster.test.sql` and on the four new `privileges.test.sql` lines.

## What has and has not been verified

- `tests/unit/roster-form.test.ts` runs the script against a **stateful** fake
  of `FormApp`, `SpreadsheetApp` and `PropertiesService` — a Drive that keeps
  forms between runs, and script properties that persist — and proves: the
  questions, order, choices and validation; that a second run updates the same
  form and sheet; adoption of an existing form by edit link, with the old
  vehicle title renamed in place; rebuilding a retyped question when there are
  no responses; refusing, **with the form untouched**, when there are; refusing
  the respondent link; leaving unmanaged questions alone; and `forgetForm`. It
  also pins the phone and plate patterns to the database CHECKs after
  normalisation.
- That suite caught a real defect before release: the first idempotent version
  threw "Nothing has been changed" *after* it had already edited earlier
  questions. It now plans first and refuses before any change.
- Mutation-tested: renaming a crew type, loosening the phone pattern, enabling
  email collection, turning off Other, and not remembering the form each fail
  it.
- **Run live, 21 Sep 2026, in Chrome:** the script ran twice in the Apps Script
  project as `vipinmenon16@gmail.com` and printed the same form, send link and
  response sheet both times. The live form shows all seven questions with the
  committed wording, including the crew types and `Other:`. The response sheet's
  header row matches the column contract above exactly. Links are in
  `docs/CURRENT-STATE.md`.
- **End to end, 21 Sep 2026:** a test submission to the live form landed in
  the response sheet as one row with every answer under the right header,
  read back via CSV export. Importer notes from that row: the phone column is
  stored as a number (read it as a string), and the timestamp is US-locale
  `M/D/YYYY` with no timezone. The test response was then deleted from both
  the form and the sheet, and checked: **0 responses, header row only**.

### Clearing test responses

A response lives in two places. Deleting the sheet row leaves it in the form,
and a form response comes back into any newly linked sheet. Delete in the form
(**Responses ▸ ⋮ ▸ Delete all responses**) *and* in the sheet. Form responses
are deleted permanently, with no trash, so this is done by a person, never by
an agent.
