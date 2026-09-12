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
