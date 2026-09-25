# Roster import — 25 September 2026 (ACC-145)

**Nothing has been written to the database.** This records the first real read
of the live response sheet, the two things blocking the load, and the counts to
reconcile against once it runs.

**No names and no phone numbers appear in this file, by design** (ACC-145, and
non-negotiable #9). The export itself lives at
`data/roster-2026-09-25.local.csv`, which `/data/*.local.csv` in `.gitignore`
keeps out of the repository. It must stay there.

## Source

| | |
|---|---|
| Sheet | "BOA 2026 — Crew roster (form responses)" |
| File id | `1i8lwUIDdZ3BNuAN-QsTM0UsHceDXStGmINjb3bIVFXs` |
| Owner | vipinmenon16@gmail.com |
| Sheet last modified | 24 Sep 2026 14:41 UTC |
| Exported | 25 Sep 2026, as `text/csv` |
| Rows | 26 data rows under one header row |

The link Vipin sent carries `gid=1269468503`. A Drive CSV export takes the
**first** sheet and cannot select a gid, so if that gid is not the first tab,
this export is of a different tab. The data looks like raw form responses
(column A holds real timestamps), so this is recorded as a caveat, not a
finding — worth one look before the load.

## What parses, and what does not

`node scripts/import-roster.mjs data/roster-2026-09-25.local.csv --offline`
fails on the header alone:

```
Invalid header. Expected exactly: Timestamp, Organisation, Full name,
WhatsApp number, Crew type, Job title, Days on site,
Loading vehicle registration — optionally followed by the desk's
"Accreditation type" column, and nothing else
```

**Column A of the sheet is named `Column 1`. It must be `Timestamp`.** That is
the only mismatch in the whole header. `Accreditation Type` is already accepted:
`lib/roster-import.ts` matches the desk's own column ignoring case, because a
person types it. The seven form-generated headers are matched **exactly**, on
purpose — Google writes them, so any deviation means the tab is not the raw
responses sheet, or someone has edited it. That guard was not relaxed to make
this import run.

Re-running against a local copy with only `Column 1` → `Timestamp` changed,
**every remaining row parses**:

```
25 valid row(s): 25 decided in column I (to approve), 0 undecided.
1 refused row(s).
```

## The two blockers

**1. The sheet's header.** Rename cell A1 from `Column 1` to `Timestamp`.
Vipin's action — an agent editing the live sheet is not in scope here.

**2. No organisation exists.** `boa_acc_org` has **0 rows**, so every valid row
is unmatched and the import refuses to load:

```
[unmatched] "Bangalore Open Air" is neither a boa_acc_org name nor an alias — 19 rows
[unmatched] "Banglore Open Air" is an alias of "Bangalore Open Air", which is not a boa_acc_org yet — 1 row
[unmatched] "Bangalore open air" is an alias of "Bangalore Open Air", which is not a boa_acc_org yet — 4 rows
[unmatched] "Bangalore open Air" is an alias of "Bangalore Open Air", which is not a boa_acc_org yet — 1 row
```

The alias layer is doing its job — all four spellings already resolve to one
canonical name. They are unmatched only because that organisation has never
been created.

Creating it runs `scripts/replace-placeholder-orgs.mjs` from `data/orgs.json`,
whose single entry still has `contactName` and `contactPhone` set to the
literal `TODO`. The script **refuses** an entry with `TODO` contacts, and that
refusal is correct: an agent must not invent contact details
(`docs/ORG-IMPORT.md`, non-negotiable #9). **Vipin supplies a real contact name
and phone for Bangalore Open Air**, then the script runs.

## Counts to reconcile against

From the export. The load must produce figures that match these exactly.

| | Rows |
|---|---|
| Data rows in the sheet | 26 |
| Valid | 25 |
| Refused | 1 |
| Decided in column I | 25 |
| Undecided (would import as `submitted`) | 0 |

**Column I — `Accreditation Type`:**

| Tier | Sheet | Valid rows |
|---|---|---|
| AAA | 12 | 11 |
| Crew | 9 | 9 |
| Stage | 5 | 5 |

The AAA column differs by one because the single refused row carries `AAA` in
column I and nothing else — see below. After the load, expect **25 approved
people: 11 AAA, 9 Crew, 5 Stage**, and a pass minted for each.

**Days on site:** Show day only (10 Oct) 14 · Both build and show 11 · empty 1
(the refused row).

**Vehicle registrations: 0.** Not one row filled it in. No vehicle stickers
will exist after this import, so `/gate/vehicle` has nothing to check against
until some arrive.

**Job titles filled: 4 of 26.** Optional, so this refuses nothing.

## The refused row

One row (sheet row 27) has **only column I filled, with `AAA`** — no timestamp,
no organisation, no name, no phone, no crew type, no days. The importer refuses
it and names every reason:

```
[refused] row 27 (no organisation): Timestamp "" is not M/D/YYYY H:MM:SS;
Organisation is empty; Full name must be 2–80 characters; WhatsApp number must
be 10 digits starting 6–9; Crew type is empty; Crew type is used as the role
and must be 2–60 characters (has 0); Days on site "" is not one of the form's
answers
```

This is the importer behaving correctly — a stray `AAA` with no person attached
must never become an accreditation. It most likely comes from someone setting
the column I dropdown on an empty row. Clearing that cell in the sheet would
make the refusal disappear; leaving it costs nothing, since the row is refused
either way.

## Write-in crew types

Twelve distinct values were typed, and ACC-143's normalisation already groups
the case and spacing variants — `Tech Production (Stage)` and
`Tech Production (stage)` are one type, as are `Artist Logistics` and
`Artist logistics`:

> Artist Catering (1) · Artist Logistics (3) · Artist Logistics + Festival
> Operations (1) · House Keeping (1) · Tech Production (Stage) (5)

These are **display only and never set a tier** — column I does, exactly as
ADR-019 decided. `Artist Logistics + Festival Operations` is one person
describing two jobs; it needs no mapping.

## What runs once both blockers clear

```bash
node scripts/import-roster.mjs data/roster-2026-09-25.local.csv --offline
node scripts/import-roster.mjs data/roster-2026-09-25.local.csv --dry
node scripts/import-roster.mjs data/roster-2026-09-25.local.csv --as <operator>
```

With `corepack pnpm db:state` before and after. **Before, 25 Sep:**
`boa_acc_org` 0, `boa_acc_person` 0, `boa_acc_operator` 1, `boa_acc_type` 8,
`boa_acc_zone_access` 26, `auth.users` 1, `anon` 0 grants / 0 EXECUTE.
