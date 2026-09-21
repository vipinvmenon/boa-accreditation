# The roster form

How the organisations tell us who is coming, and how that becomes rows in
`boa_acc_person`.

**Sibling of [ORG-IMPORT.md](ORG-IMPORT.md).** That file covers loading the
*organisations*. This one covers collecting their *people*.

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
is run once by a human:

1. <https://script.google.com> ▸ New project
2. Paste the file over everything ▸ Save
3. Select `buildRosterForm` ▸ Run, and authorise
4. The execution log prints three links: **the form link to send out**, the
   form's edit link, and the response spreadsheet

Re-running creates a second form and sheet. It never edits or deletes an
existing one, so a mistaken re-run cannot touch responses already in.

The response sheet downloads as Excel (**File ▸ Download ▸ Microsoft Excel**)
whenever needed.

## What it asks

| # | Question | Type | Required | Rule |
|---|---|---|---|---|
| 1 | Organisation | dropdown, or text | yes | Dropdown once `ORGS` is filled in (ACC-030a); free text until then |
| 2 | Full name | text | yes | 2–80 characters, as on their photo ID |
| 3 | Mobile number | text | yes | 10 digits starting 6–9, no `+91`. The importer adds `+91` |
| 4 | Crew type | multiple choice + Other | yes | Security · Bouncer · Bar Crew · Merch Crew · Artist Hospitality · Food Stalls · Cashless · Sound & Lights · Generator · Ground Production · Sponsor · **Other (write-in)** |
| 5 | Job title | text | no | 2–60 characters |
| 6 | Days on site | single choice | yes | Build days only (5–9 Oct) · Show day only (10 Oct) · Both build and show |
| 7 | Vehicle registration | text | no | e.g. `KA01AB1234`; lower case and spaces accepted, normalised on import |

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

The crew type list is Salman's, plus a write-in **Other** added by Vipin on
21 Sep so nobody who falls outside the list is blocked from being submitted.

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
Timestamp, Organisation, Full name, Mobile number, Crew type, Job title,
Days on site, Vehicle registration
```

**Do not reword a question in the form editor after launch.** It renames the
column and breaks the import silently. Change the title in the script and here,
together.

## What the form cannot enforce

- **Quota.** A form has no idea how many people an organisation has already
  submitted. The quota is enforced on import, under the same row lock as the
  web form (`boa_acc_submit`), and over-quota rows are refused and reported.
- **Duplicates.** The same person submitted twice is caught on import by the
  existing duplicate-phone check, not by the form.

## Importing

> **Not built yet — ACC-117.** No validator or loader exists for the response
> sheet, and neither does `boa_acc_import_roster`. Do not claim a roster has been
> loaded until they do.

Intended shape: export the response sheet as CSV, validate it offline, then load
it through an operator-only `SECURITY DEFINER` RPC — **not** through
`boa_acc_submit`, whose 60-per-hour-per-token throttle is a control on the public
surface and would take nine hours for a 500-person roster. Role text is the job
title where given, otherwise the crew type.

## What has and has not been verified

- `tests/unit/roster-form.test.ts` runs the script against recording stubs of
  `FormApp` and `SpreadsheetApp` and proves the questions, their order, the
  dropdown values, the validation patterns and the sheet link. It also pins the
  phone and plate patterns to the database CHECKs after normalisation.
  Mutation-tested: renaming a crew type, loosening the phone pattern, or turning
  on email collection each fail it.
- **Not verified:** that Google renders it as intended. The script has never
  been executed by Google. Run it, open the form, and make one test submission
  before sending the link.
