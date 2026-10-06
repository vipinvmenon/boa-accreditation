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
| 3 | WhatsApp number | text | yes | India: 10 digits starting 6–9, no `+91` (the importer adds it). Any other country: country code then number, with or without a leading `+` (ACC-195). Renamed from "Mobile number" by Vipin, 21 Sep |
| 4 | Crew type | multiple choice + Other | yes | Security · Bouncer · Bar Crew · Merch Crew · Artist Hospitality · Food Stalls · Cashless · Sound & Lights · Generator · Ground Production · Sponsor · Special Tickets Crew · BOA Internal Crew · Family & Friends · Media / Photo · **Other (write-in)** |
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

- A write-in crew type has no band mapping, and needs none: column I decides
  every row (ACC-141). The importer normalises a write-in's case and spacing
  for display and role text only — `Tech Production (stage)` and
  `Tech Production (Stage)` are one crew type (ACC-143, `normaliseCrewType`).
- The form cannot validate write-in text. It becomes the role text when there is
  no job title, and the database limits role text to 2–60 characters, so the
  importer must refuse and report anything outside that rather than truncate it.

Change the list in `CREW_TYPES` in the script, not in the form editor, so the
change is recorded.

**Verified live, 22 Sep 2026:** the respondent form's Crew type options were
read from the live form (not the sheet) and match `CREW_TYPES` in
`build-roster-form.gs` exactly, in order, with `Other:` last. So values seen
in the response sheet that are not on that list — `Artist Logistics`,
`Tech Production (Stage)`, `Tech Production (stage)` — are **write-ins under
Other**, working as designed, not a form edited out of band. They have no
crew-type → band mapping and never will (see below).

**Superseded 22 Sep (ADR-019):** the crew type → band mapping described as
"Open" here is no longer being built. Column I, "Accreditation Type", set by
Salman directly in the sheet, is the approval (ACC-140a) and always wins over
crew type (see "The desk's column" below) — including for write-ins. A row
with no column I value stays undecided; it does not fall back to a mapping.

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

### Three columns, three owners — and only one of them is yours to type

This caught us on 25 Sep 2026: the sheet's column A had been renamed to
`Column 1`, and the first real import refused the whole file. Re-running
`build-roster-form.gs` would not have fixed it, because the script never writes
that column.

| Column | Written by | How it changes |
|---|---|---|
| **A — `Timestamp`** | **Google Forms itself**, when it creates the sheet | Nothing should change it. Not the script, not by hand. |
| **B–H** | The form's question titles | Only by editing `build-roster-form.gs` **and this file** together — never in the sheet, never in the form editor |
| **I — `Accreditation Type`** | The desk, by hand | By hand, by design. It is the one column a person is meant to type |

**Column A is not the form script's to manage.** `build-roster-form.gs` controls
question titles, which become B–H. Google writes `Timestamp` once, when it links
the sheet, and never rewrites it — which is exactly why a rename sticks and why
it broke the import rather than healing on the next submission. If it is ever
wrong again, correct the cell in the sheet by hand. That is the only column for
which hand-editing the header is the right answer.

`lib/roster-import.ts` matches the seven form-generated headers **exactly** and
the desk's column I ignoring case. That asymmetry is deliberate: Google writes
the first seven, so any deviation means the tab is not the raw responses sheet
or someone has edited it — worth refusing over. A person types column I, so its
capitalisation is not worth refusing over.

### A repeated column: Google's, after a question is re-added (6 Oct 2026)

If a question is deleted and re-added, or duplicated and the original deleted,
in the **form editor**, Google keeps the old column with every answer already in
it. It then inserts a new column with the same title after the form's last
column, ahead of the desk's. On 6 Oct the sheet had a second `Crew type` at I,
with the desk's columns pushed to J–L.

`lib/roster-import.ts` accepts an **exact** repeat of a form title in that
position. Each row takes the answer from whichever copy holds it. A row with an
answer in both is refused with both column letters. Do not cut and paste
answers between the two columns, and do not delete the newer one until **Responses ▸
Question** in the form editor shows which copy the live question writes to.

Two causes, both avoidable:

- **Re-run the script only from the whole repo file.** On 1 Oct an Apps Script
  copy patched for one question was run. Its older `CREW_TYPES` removed
  "Family & Friends" and "Media / Photo" from the live form.
- **Do not fix the form in the form editor.** Retyping a choice changes its
  spelling (the live form says "Family and Friends"). Re-adding a question
  creates the repeat column.

### File ▸ Settings: one must be India, the other must not

Verified in the live sheet on 25 Sep 2026. Both are already correct. They look
inconsistent, and they are not — **changing the second one breaks the import.**

| Setting | Must be | Why |
|---|---|---|
| **Time zone** | **(GMT+05:30) India Standard Time** | The CSV carries no zone. The importer reads every timestamp as Asia/Kolkata, so any other setting silently shifts every `submitted_at`. |
| **Locale** | **United States** | The locale decides the date *format*. US gives `M/D/YYYY H:MM:SS`, which is exactly what `lib/roster-import.ts` parses. |

**Do not "correct" the Locale to India.** Sitting beside a time zone that says
India, `United States` reads like an oversight someone should tidy up. It is
not. Switching it re-formats every timestamp as `D/M/YYYY`, and the importer
refuses each row with *"Timestamp … is not M/D/YYYY H:MM:SS"* — or worse,
silently misreads the days 1–12 of each month, where both formats parse but
mean different dates.

Neither setting is visible in the CSV, so neither can be checked from the
export. They can only be read in the sheet.

### The desk's T-shirt columns: J and K (ACC-197, 30 Sep 2026)

Two more columns typed **by hand in the sheet** after column I, for Salman to
fill in for the crew who are to get a T-shirt at check-in:

```
…, Accreditation Type, T-Shirt, T-Shirt Size
```

- **J `T-Shirt`**: a dropdown, `Yes` or blank. Blank means no shirt.
- **K `T-Shirt Size`**: a dropdown, `S · M · L · XL · XXL · 3XL`.
- Not form questions; organisations never see them. Optional: a sheet ending at
  column I (or with no desk column) still imports, with no shirts.
- **Both or neither.** `Yes` with a blank size, a size with no `Yes`, or a size
  outside the list refuses that row with the reason; nothing is guessed.
- **The header must be exactly the three, in this order** (matched ignoring
  case and spacing, like column I). J on its own, or K before J, is refused.
- **What it does:** the gate shows "Crew T-shirt · L" on the scan result, in
  person search and on the desk Master list. **The holder's pass
  (`/p/[passToken]`, `boa_acc_pass_view`) never carries it** (pgTAP proves it).
- **Handed over:** the gate's "Mark given" records it (`boa_acc_tshirt_handover`),
  so a rescan shows "Given" and the shirt is not handed out twice.
- **A later change applies** to people who are already approved, unlike the
  tier: a shirt is a cue, not a band. It reaches the gate on its next pull.

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

**What the importer does with it (ACC-141, built 22 Sep on a branch; ADR-019,
ACC-140a/b):**

- A filled cell **is the approval.** The row's tier is column I and nothing
  else — there is no crew-type mapping. The database approves the person and
  mints the pass, inside `boa_acc_import_approve`, run by a lead/admin
  (non-negotiables #3, #5). The spreadsheet cell itself authorises nothing.
- **AAA and Artist are approvals too** (ACC-140b). For AAA the database
  records the nomination column I stands for, then approves through the same
  nomination guard the desk uses. `/desk/aaa` is not part of this path.
- A blank cell means *not yet decided*: the row imports as `submitted`, with
  no pass, and the importer lists it for Salman.
- Anything that is not exactly one of the seven labels refuses that row — a
  curly apostrophe in `Eddie’s Lounge`, a lower-case `stage` and
  `General Admission` included.
- Changing a cell for someone **already approved** is reported by the next
  import (`tier_changed`) and **not applied**: their pass may already be out.
  The desk changes it, not the sheet.

Rules for whoever edits the sheet by hand:

- Keep desk columns to the right. **Never insert a column between form
  columns**, and never insert rows: responses are written into the next empty
  row.
- Sorting and filtering are fine; they move whole rows.
- Adding a new *form question* later makes Google add its column after the
  form's existing ones, which may land where the desk column is. Check the
  header row after any question is added.

## What the form cannot enforce

- **Quota.** Not enforced at all for now (ACC-140g). `boa_acc_org.quota`
  stays in the schema, unread by the import.
- **Duplicates.** The same person submitted twice is caught on import by
  phone, not by the form: twice in one sheet, or already on another
  organisation's roster.
- **Spelling of the organisation.** Free text until the question becomes a
  dropdown (ACC-116); misspellings are matched through a committed alias map
  (below).

**Keeping the dropdown in step (ACC-116/ADR-019, see `docs/ORG-IMPORT.md`
"Keeping the form's dropdown organisation list in step" for the full flow):**
once the Organisation question does become a dropdown, its `ORGS` list
(`scripts/roster-form/build-roster-form.gs`) must match `boa_acc_org.name`
exactly — a name the dropdown offers that the importer does not recognise, or
vice versa, produces refused or unmatched rows. `/desk/orgs`'s **"Copy names
for the form dropdown"** button copies the live organisation list in both the
plain one-per-line form and as the `var ORGS = [...]` literal the script
expects, so `ORGS` is a paste from the database, never retyped by hand.

## Importing

> **Built (ACC-141–143) on a branch, not applied.** The loader now calls
> `public.boa_acc_import_approve`, created by
> `supabase/migrations/202609221000_boa_acc_import_approve.sql`. **That
> migration is not in production** until someone runs `db:push`; until then
> the loader's real-load mode fails with "function does not exist", and
> `corepack pnpm test:db` fails on `import-approve.test.sql` and on three
> `privileges.test.sql` lines. `--offline` and `--dry` do not need it.
>
> ACC-117's `boa_acc_import_roster` (submitted-only, with a quota) is still
> applied in production and untouched, but **nothing calls it any more**.
>
> **`boa_acc_org` holds only 38 `PLACEHOLDER — …` fixture rows** (checked
> 22 Sep). There are no real organisations yet; every real row is reported
> as an unmatched organisation until the admin creates them.

Export the response sheet as CSV (**File ▸ Download ▸ Comma-separated values**),
then:

```bash
node scripts/import-roster.mjs responses.csv --offline   # validate only, touches nothing
node scripts/import-roster.mjs responses.csv --dry       # + read-only organisation match
node scripts/import-roster.mjs responses.csv --as you@example.com --report data/roster-import.local.csv
```

(`corepack pnpm roster:import -- …` runs the same thing.)

**What the validator does** (`lib/roster-import.ts`, pure, unit-tested in
`tests/unit/import-roster.test.ts`):

| Column | Rule |
|---|---|
| header | exactly the contract above, in order, optionally followed by the desk's column I, or nothing is read |
| Timestamp | US locale `M/D/YYYY H:MM:SS`, no zone in the cell. **Read as Asia/Kolkata** and sent as `…+05:30`. That is an assumption about the spreadsheet's time-zone setting, which the CSV does not carry — check **File ▸ Settings** on the response sheet says GMT+05:30 before the first real import. Becomes `submitted_at` |
| Organisation | through `data/org-aliases.json`, then matched to `boa_acc_org.name` trimmed, whitespace-collapsed, case-insensitive. Unmatched names are reported with their row numbers, never guessed |
| Full name | 2–80 characters |
| WhatsApp number | read as a **string**; 10 digits starting 6–9 → `+91…`; `+…`, `00…` or 11–15 bare digits → international as typed. Spaces and dashes tolerated; a spreadsheet round-trip like `9.87E9` is refused, never repaired |
| Crew type | case and spacing normalised (`normaliseCrewType`): a fixed choice takes the form's spelling; a write-in gets each word's first letter upper-cased, nothing lower-cased. Display and role text only — **never the tier** |
| Job title | role text is the job title if given, else the crew type; 2–60 characters or the row is **refused, never truncated** |
| Days on site | the three answers → `build` / `show` / `build_show`; sent as `day_validity` |
| Loading vehicle registration | upper-cased, spaces removed, then the database's plate CHECK; blank is no vehicle |
| Accreditation Type (column I) | exactly one of the seven labels → `type_code`; blank → `null` (undecided) |

A row is refused with every problem listed, by sheet row number. The output
also lists undecided rows (for Salman), write-in crew types with their rows,
and any phone that appears twice in the sheet.

**Organisation aliases (ACC-142).** `data/org-aliases.json` maps a misspelling
seen in the sheet to the organisation's canonical name — seeded with
`Banglore Open Air` and `Bangalore open air` → `Bangalore Open Air`. Add a line
only for a spelling actually seen. The file refuses chains and conflicting
entries. An alias whose canonical org has not been created yet is reported as
unmatched ("is an alias of …, which is not a boa_acc_org yet"). The importer
never creates or deletes an organisation.

**What the loader does.** One call per organisation (1000 rows per call at
most) to `public.boa_acc_import_approve(p_org_id uuid, p_rows jsonb)`, as the
session of the operator named by `--as`, who must be an active **lead or
admin** — the database checks, not the script. It refuses to load if any row
was refused or names an unknown organisation, unless `--partial` is given. The
report file holds row number, organisation, outcome and reason — never a name
or a phone.

**What the RPC does**, per row, in one transaction per organisation:

| Outcome | When |
|---|---|
| `approved` | column I filled, person new or still `submitted` → approved through `private.boa_acc_decide_one`: `type_code`, `day_validity`, `pass_token`, `pass_ref`, `approved_by` = the importing lead/admin |
| `inserted` | column I blank, new person → `submitted`, no pass; the days answer kept in `requested_day_validity` |
| `unchanged` | already imported and the sheet says the same thing. What a re-run returns |
| `tier_changed` | already **approved**, and the sheet now says another tier or days, or the cell was cleared. **Reported, not applied** |
| `skipped` | the person was rejected by the desk (or is a web-form draft); column I is not applied over it |
| `refused` | a guard refused the approval (e.g. `aaa_not_nominated` when that phone's AAA nomination is already stamped to someone else). A new person stays imported as `submitted` |
| `duplicate_phone` | the phone is earlier in the same call, or live on **another** organisation's roster |
| `invalid` | a field rule failed, no days, or `general_admission` |

- **Idempotent on phone.** A person is matched by organisation and phone
  (non-voided). Re-running the same file approves rows decided since the last
  run and writes nothing else — name, role and plate edits in the sheet are
  not applied to an existing person either.
- **AAA.** Before approving as `aaa` the RPC records the nomination column I
  stands for (`nominated_by` / `approved_by` = the importing lead/admin,
  `org_hint` = the org), or approves an unapproved one already on file for
  that phone. `decide_one` then checks and stamps it exactly as for the desk.
  The nomination and the approval share one sub-transaction, so a refused
  approval leaves no nomination behind. Artist has no nomination and is
  approved like any other tier.
- **No quota** (ACC-140g). The org row lock (`for update`, as
  `boa_acc_submit`) and the closed-org refusal stay.
- A closed or unknown org, a non-lead/admin caller, or a payload that is not
  an array of at most 1000 refuses the whole call.

### What the import has and has not been verified to do

- **Unit tests** (`tests/unit/import-roster.test.ts`, 37): every column rule
  above; column I → `type_code`, blank → undecided and listed, AAA/Artist
  carried, General Admission and a curly apostrophe refused; the live sheet's
  write-ins (`Tech Production (stage)` ≡ `(Stage)`, `Artist Logistics`)
  normalised and never setting a tier; the committed alias map resolving the
  live sheet's variants and refusing chains/conflicts; a generated 500-row
  sheet as one payload; and pins to the form script's questions/crew
  types/days, to `lib/design.ts`'s tier labels, and to the exact jsonb fields
  and outcomes the migration uses.
- **Database, inside transactions that were rolled back** (22 Sep 2026,
  against production via the Management API; afterwards a read-only query
  confirmed `boa_acc_import_approve` does not exist, `boa_acc_person` and
  `boa_acc_aaa_nomination` still hold 0 rows, `boa_acc_org` 38, and no test
  user remains): the migration applied cleanly;
  `supabase/tests/import-approve.test.sql` passed **26/26** (approve with
  column I, blank stays submitted with no pass, AAA recorded-then-approved
  through the guard, AAA with an unapproved nomination, AAA with a stamped
  nomination still refused, Artist, re-run unchanged, a later run approving
  only the newly decided row, changed tier and days and a cleared cell
  reported and not applied with the pass unchanged, duplicates in-call and
  cross-org, approver and no-session refused); `privileges.test.sql` with the
  three new lines passed **89/89**.
- **Mutation-tested** (each in its own rolled-back transaction): approving a
  blank column I as `crew` failed 4 assertions; skipping the AAA nomination
  record failed 10 (decide_one's guard refused every AAA row — the guard is
  live, not bypassed); letting an approver call it failed the approver test.
- **The loader's exact SQL** (`importApproveSql`) on a generated 501-row CSV
  whose Organisation cells were the two seeded misspellings, against a
  throwaway org with quota 1, rolled back: 401 approved (including one AAA)
  and 100 submitted in one call, every approved row with a pass and no
  submitted row with one; a re-run returned 501 `unchanged`.
- `--offline` and `--dry` were run against a generated file; `--dry` read the
  live organisation list (read-only).
- **Not verified:** the loader's real-load mode against production (the
  migration is not applied); `corepack pnpm test:db` as a whole (it would fail
  until the migration is applied); an export of the real response sheet; the
  sheet's time-zone setting.

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
