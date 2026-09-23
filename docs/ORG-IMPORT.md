# Organisation input and invite handoff

**Current flow (ADR-019, 22 Sep 2026 — read this section first).** Crew now
register on one Google Form (`docs/ROSTER-FORM.md`); there is no per-org
invite link any more, and nothing in the app mints one. `/desk/orgs`'s job is
to hold the canonical organisation names `lib/roster-import.ts`'s importer
matches the form's free-text "Organisation" answer against
(`data/org-aliases.json` catches misspellings), show how many people each
organisation has sent and how many are approved, and hold the contact to
chase. Quotas were dropped the same day (ACC-140g): `boa_acc_org.quota`
stays in the schema and in the create RPC's signature, but nothing reads or
enforces it, it is not collected on the create form, and it is not shown in
the org list.

Everything below this point that talks about **minting an invite link**
(ACC-031, "Human input and handling required for ACC-031") describes the
**retired** collection path (`/s/[token]`) and is kept only as a historical
record of ACC-030/031's original design — do not act on it. The "Human input
required for ACC-030" section below is still accurate for how an organisation
name, kind, contact and default tier get created; only the invite-minting
step after it no longer applies.

## Keeping the form's dropdown organisation list in step

The form's Organisation question (`docs/ROSTER-FORM.md`) is free text until
someone fills in `ORGS` in `scripts/roster-form/build-roster-form.gs`
(ACC-116). Once `boa_acc_org` holds the real names, `/desk/orgs`' **"Copy
names for the form dropdown"** button copies every organisation's exact name
— one per line, and again as the `var ORGS = [...]` array literal the script
needs — so pasting either into the script keeps the dropdown matching what
the importer will actually accept. Re-copy and re-paste whenever an
organisation is added, renamed or removed, then re-run the script (see
"Building it" in `docs/ROSTER-FORM.md` — re-running updates the live form in
place, it does not mint a new one).

## Replacing the 38 placeholder organisations

`scripts/replace-placeholder-orgs.mjs` (23 Sep 2026) does the two things
needed to move off the 14-Sep rehearsal fixtures:

1. deletes every `PLACEHOLDER — ` organisation that has **zero** dependent
   rows (no people, no check-ins, no invites, no AAA nominations) — anything
   with dependents is reported and skipped, never force-deleted;
2. creates the real organisations listed in the committed `data/orgs.json`
   through the same `boa_acc_create_org` RPC `/desk/orgs` itself calls,
   skipping any name that already exists.

It defaults to `--dry` (prints what it would do, writes nothing) and only
writes with `--apply`:

```bash
corepack pnpm orgs:replace-placeholders           # --dry, the default
corepack pnpm orgs:replace-placeholders -- --apply
```

**This script is destructive and is run by Vipin, not an agent** (CLAUDE.md:
an agent may not write to production here). `data/orgs.json` currently holds
one entry — Bangalore Open Air's own crew — with `contactName`/
`contactPhone` left as the literal `"TODO"`; the script refuses to create an
entry whose contact fields are still `"TODO"` rather than invent them. Add
the real 38 to that same file, one at a time, as Bhoopesh's list arrives
(the "Human input required for ACC-030" rules below still apply to what goes
in it), and re-run with `--apply` — it is idempotent by name.

## Human input required for ACC-030

Bhoopesh must provide one reviewed CSV with exactly these columns:

```text
name,kind,quota,contact_name,contact_phone,default_type
```

Rules:

- exactly 38 rows;
- `kind` is one of `vendor`, `crew`, `sponsor`, `media`, `security`,
  `contractor`;
- `quota` is an integer from 0 through 500;
- `contact_phone` is the full Indian mobile form `+91XXXXXXXXXX`;
- `default_type` is a requestable tier (ADR-018): `stage`, `promoters_lounge`,
  `crew`, `photo` or `eddies_lounge`. AAA and Artist are named lists approved
  per person, and General Admission is ticketing. Leave it empty only if the
  lead explicitly chooses the system default (`crew`);
- names must be unique, and the lead must confirm each quota and contact;
- do not add email, ID number, address, date of birth, token, or any other
  personal field.

Validate without touching Supabase:

```bash
corepack pnpm validate:org-import -- path/to/organisations.csv
corepack pnpm validate:org-import -- path/to/organisations.csv --json > organisations.normalized.json
```

The validator rejects malformed CSV, unknown columns, invalid values, empty
files, and case-insensitive duplicate names. It does not create organisations
or claim that the rows are approved.

After validation, a lead/admin must create each organisation through
`/desk/orgs`, reviewing the returned row against the supplied source. This
keeps the existing database authorization in force. The final count and
source/as-of time should be recorded by the human operator; an agent must not
invent or backfill missing values.

## Human input and handling required for ACC-031 (retired — see top of this file)

**Superseded 22 Sep 2026 by ADR-019.** `/s/[token]` and invite minting are no
longer the collection path; kept below only as a historical record.

Invite tokens are secret and are returned only once by
`boa_acc_mint_invite`. The database stores only a hash and a short hint, so a
later exporter cannot recover a forgotten token. For each validated
organisation, a lead/admin must:

1. open its invite-link panel in `/desk/orgs`;
2. mint one link with a human label (normally the organisation name);
3. copy the complete URL immediately into the approved WhatsApp handoff
   document;
4. verify the URL opens the matching organisation's submission screen;
5. record the organisation name, contact name/phone, quota, URL, and a
   sent/confirmed status in the handoff document.

Do not put raw tokens in git, logs, screenshots, the database, or this
repository. Do not mark ACC-031 complete until all 38 URLs have been copied,
labelled, spot-checked, and sent by the human operator. Real operator/contact
emails remain human-dependent per `docs/CURRENT-STATE.md`.

## Placeholder data — rehearsal only, not ACC-030/031

Added 14 Sep 2026 while ACC-030a was still blocked on Bhoopesh's real list, at
Vipin's request, so desk-screen work could proceed without waiting. **These 38
rows are currently loaded into the real production database** (ACC-030 is
marked `[~]` IN FLIGHT in ROADMAP.md, not `[x]` done, for exactly this
reason — placeholder data satisfies "something to unblock desk work with,"
not "the real 38 organisations"). Delete them (`node scripts/wipe-orgs.mjs
--prefix "PLACEHOLDER — "`) before loading the real list — see below.
`data/orgs-placeholder.csv` is 38 fabricated rows in exactly this format, every
name prefixed `PLACEHOLDER — `, validated by `corepack pnpm validate:org-import
-- data/orgs-placeholder.csv`. **This is not the real 38 and must never be
treated as satisfying ACC-030a, ACC-030, or ACC-031.**

`scripts/load-orgs.mjs` loads any validated CSV — this placeholder file or,
later, the real one — into the database through the same
`boa_acc_create_org` / `boa_acc_mint_invite` RPCs the app itself calls
(the technique `scripts/seed-dummy.mjs`/ACC-035 already uses), skipping any
organisation whose name already exists:

```bash
node scripts/load-orgs.mjs data/orgs-placeholder.csv --out data/placeholder-invites.local.csv
```

The `--out` file holds the raw invite URLs (tokens included) and is
`.gitignore`d by the `*.local.csv` pattern — never commit it, delete it once
you're done rehearsing. `scripts/wipe-orgs.mjs --prefix "PLACEHOLDER — "`
removes every placeholder org (and its people/invites) by the same cascade
`wipe-dummy.mjs` uses, the same way the roadmap already requires 0 `TEST — `
orgs before the real 38 go out — run it before loading the real list.

This script is deliberately **not** how the real 38 should be loaded: the
"Human input required" sections above still apply to real organisations —
one at a time through `/desk/orgs`, reviewed against Bhoopesh's source,
tokens copied by a human straight into the WhatsApp handoff document. Bulk
loading real orgs by script would skip that review step.

### 19 Sep 2026 — two placeholder rows renamed to confirmed org names, quota/contact still TBD

Vipin has received 2 of the 38 real org names so far (Reynolds, F5 Events)
and asked not to sit idle waiting for the full list. Rather than invent a
`kind`/`quota`/`contact` for either (`docs/ORG-IMPORT.md` above is explicit:
"an agent must not invent or backfill missing values"), two of the 38
`PLACEHOLDER —` rows were renamed in place, keeping their existing
fabricated `kind`/`quota`/`contact` values and the `PLACEHOLDER — ` prefix
(so `wipe-orgs.mjs --prefix "PLACEHOLDER — "` still catches them, and
`test:visual`/desk-screen rehearsal shows real names where known without
anyone mistaking this for confirmed ACC-030 data):

- `PLACEHOLDER — Vendor 01` → `PLACEHOLDER — Reynolds (name confirmed / quota+contact TBD)`
- `PLACEHOLDER — Vendor 02` → `PLACEHOLDER — F5 Events (name confirmed / quota+contact TBD)`

Applied to `data/orgs-placeholder.csv` (validated: `corepack pnpm
validate:org-import -- data/orgs-placeholder.csv`, 38 rows, no errors) and to
the live production database: the two old-named rows were removed via
`private.boa_acc_wipe_org` (the same cascade `wipe-orgs.mjs` uses) and the
full 38-row CSV was reloaded through `scripts/load-orgs.mjs`, which is
idempotent by name — the 36 unchanged rows were skipped, only the 2 renamed
rows were (re)created. `boa_acc_org` count confirmed still 38 afterward via
`corepack pnpm db:state`. This is still placeholder data, not ACC-030 — the
`kind` (guessed as `vendor`, unverified) and the fabricated quota/contact
values must be replaced with Bhoopesh's real figures before either
organisation is treated as invite-ready.
