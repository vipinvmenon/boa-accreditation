# The roster workbook

How the 38 organisations tell us who is coming, and how that becomes rows in
`boa_acc_person`.

**Sibling of [ORG-IMPORT.md](ORG-IMPORT.md).** That file covers loading the
*organisations*. This one covers loading their *people*.

---

## Read this before you share the workbook

**Google Sheets cannot hide one tab from another editor.** Protected ranges stop
editing, not reading. A hidden tab is two clicks from visible. Anyone you give
edit access to can read every organisation's tab — every name, every phone
number.

This is a deliberate, accepted trade-off (Vipin, 21 Sep 2026; recorded in
ADR-018), chosen over 38 separate spreadsheets because one workbook is far
easier to chase and review. It is written down here so that nobody discovers it
in October and treats it as a breach.

Practical consequences:

- Give **edit** access only to the organisation contacts, and treat the list of
  editors as the real access-control decision.
- Do **not** publish the link, put it in a public channel, or turn on "anyone
  with the link can edit".
- If an organisation objects to being visible to the others, give that one its
  own copy of the workbook with a single tab. The loader does not care whether
  the CSVs came from one workbook or five.

---

## What we collect, and what we never collect

Six columns. That is the whole contract.

| Column | Required | Rule |
|---|---|---|
| `full_name` | yes | 2–80 characters, as printed on the photo ID they will carry |
| `phone` | yes | **Ten digits only** — `9876543210`. No `+91`, no spaces, no dashes |
| `role` | yes | 2–60 characters. What they actually do: Rigger, Sound engineer, Bar staff |
| `vehicle_reg` | no | Only if they drive in. `KA01AB1234`, no spaces |
| `requested_tier` | no | Advisory. Crew · Stage · Photo · Eddie's Lounge · Promoters Lounge |
| `days_needed` | **yes** | Build · Show · Both. Build = 5–9 Oct load-in, Show = 10 Oct |

**Never**: ID number, Aadhaar, photograph, address, date of birth. That is
non-negotiable #9, and it is enforced mechanically — the validator refuses any
column it does not recognise, and the import RPC raises on any unexpected key.
An organisation that adds an "Aadhaar" column gets a refused file, not a
data-protection incident.

### Why the phone column is ten digits, not `+91…`

A Google Sheets cell whose content starts with `+` is parsed as a **formula**.
`+919886104422` becomes a broken expression or a mangled number, silently, and
you find out at the gate. Ten digits in a plain-text column survives the round
trip. The loader prepends `+91` on import, so what reaches the database is still
the `^\+91[6-9][0-9]{9}$` the schema requires.

### Why `days_needed` is required

`boa_acc_person`'s own CHECK refuses an approval without it:

```sql
(status = 'approved') = (type_code    is not null) and
(status = 'approved') = (day_validity is not null)
```

Nobody can be approved without a band tier **and** a day validity. Bulk approval
takes one validity for a whole organisation —
`boa_acc_approve_org(p_org_id, p_type_code, p_day_validity)` — so an org with
riggers on build and bar staff on show day gets one blanket answer unless the
sheet says otherwise. Either show-day staff get bands valid during load-in, or
the desk opens every row by hand.

The organisation knows; the desk is guessing. So the sheet asks.

It is not personal data, so non-negotiable #9 is untouched.

### `requested_tier` is advisory

It is what the organisation *thinks* the person needs. It grants nothing. The
desk still assigns the real tier at approval, in the database — non-negotiable
#3. It exists so that approving a 500-row roster takes minutes instead of going
row by row.

**AAA and Artist are not on the list.** They are named lists approved separately
and are not requestable on any org-facing form.

---

## Building the workbook

The organisation list comes from **ACC-030a** — the same reviewed CSV that
`docs/ORG-IMPORT.md` specifies, needing at least `name` and `quota` columns.

```bash
corepack pnpm make:roster-sheet -- data/organisations.csv
```

This writes three files into `build/roster/` (gitignored — they carry real
organisation names):

| File | What it is |
|---|---|
| `build-roster-workbook.gs` | The Apps Script, with the real organisations filled in |
| `boa-2026-rosters-lean.xlsx` | The same workbook stripped for upload over an API that only takes inline content |
| `roster-template.csv` | Plain-CSV fallback, for an org that will not use Sheets |
| `roster-template-HOW-TO.txt` | The fill rules, to send **with** the CSV |
| `tabs.csv` | `org_name,quota,tab_name` — what the workbook *should* contain, for checking |

It refuses, with the line number, on: an empty name, a quota outside 1–500, a
missing `name` or `quota` column, and two organisations whose names collapse to
the same Sheets tab name.

The committed template at `scripts/roster-sheet/build-roster-workbook.gs` is
**never** modified by the generator. It keeps an `EXAMPLE` stub so the file in
git stays readable and free of real names.

Then, once:

1. Create a **new, empty** Google Sheet.
2. **Extensions ▸ Apps Script**, paste `build/roster/build-roster-workbook.gs`
   over everything, **Save**.
3. **Run ▸ buildWorkbook**. Authorise it when Google asks — it touches only this
   spreadsheet, and one Drive folder it creates itself for the export.
4. Check the tab count and the quotas against `build/roster/tabs.csv`.
5. Share, per the warning at the top of this file.

Each tab gets: the org name and quota in a locked header, a live
`Quota / Filled / Left` counter, five validated columns, exactly `quota` usable
rows, and ten grey rows past the quota line so the ceiling is visible rather
than discovered.

### Re-running it is safe

`buildWorkbook` never silently replaces a tab that already has people on it. If
an organisation has started typing, that tab is left exactly as it is and the
run reports how many it skipped. So you can add a late organisation by running
it again — only the missing tabs get built.

Starting the whole workbook over is deliberately awkward: set
`ALLOW_OVERWRITE = true` at the top of the script, run once, set it back. That
flag is the only way to destroy a filled tab.

### The standalone CSV template

For an organisation that will not touch the workbook — an old hand with Excel, or
someone on a bad connection — send `roster-template.csv` and
`roster-template-HOW-TO.txt` together. The CSV is deliberately kept
machine-clean: no comment lines, no title row, no merged cells, because the
validator parses it directly. That is why the guidance is a separate file rather
than a banner inside the sheet.

It carries three example rows, the last of which has both *optional* columns
empty while still filling `days_needed` — that is the one people get wrong. The HOW-TO opens by telling them to delete
all three.

A returned CSV goes through the same validator and the same loader as a tab
exported from the workbook. There is one import path, not two.

---

## Getting the data back

In the workbook: **BOA ▸ Export all tabs to CSV** (the menu appears after a
reload; or run `exportAllTabsToCsv` from the script editor).

It writes one CSV per organisation into a dated Drive folder,
`boa-rosters-YYYY-MM-DD-HHMM`, skipping the Rules tab and any tab nobody filled
in. Rows with no name are dropped — a half-typed row is not a person.

Download that folder and hand it over for import.

---

## Validating and loading

> **Not built yet — ACC-117.** `scripts/validate-roster.mjs` and
> `scripts/load-roster.mjs` do not exist at the time of writing, and neither
> does the `boa_acc_import_roster` RPC. Do not claim a roster has been loaded
> until they do. This section records the intended shape so the sheet and the
> loader are designed against each other, not in sequence.

```bash
corepack pnpm validate:roster -- build/rosters/*.csv           # offline, no database
corepack pnpm validate:roster -- build/rosters/acme.csv --json # normalised rows
node scripts/load-roster.mjs build/rosters/acme.csv --org "Acme" --dry
node scripts/load-roster.mjs build/rosters/acme.csv --org "Acme"
```

The loader goes through `public.boa_acc_import_roster`, an operator-only
`SECURITY DEFINER` function — **not** through `boa_acc_submit`.
`boa_acc_submit` counts every call against a throttle of 60 per hour per invite
token, which is a deliberate control on the *public* surface; a 500-person
roster through it would take nine hours or force the limit up for everybody.

The import holds the same guarantees the web form does, because it shares the
same insert path: the quota row lock, the duplicate-phone check, `org_closed`,
rows landing at `submitted` with no `pass_token`, and no band serial
pre-assigned. A batch that would exceed quota is refused **whole**, with the
numbers, so the file can be fixed and re-run. Re-running a loaded file reports
every row as already present rather than duplicating it.
