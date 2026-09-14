# Organisation input and invite handoff

ACC-030 and ACC-031 are not complete in this checkout. The live database has
zero `boa_acc_org` rows, and no authoritative 38-organisation source file is
committed. Do not populate it from mock design data, memory, WhatsApp
messages, or inferred quotas.

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
- `default_type` is `crew`, `stage`, or `aaa`; leave it empty only if the
  lead explicitly chooses the system default;
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

## Human input and handling required for ACC-031

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
Vipin's request, so desk-screen work could proceed without waiting.
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
