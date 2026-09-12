# Setup — the credentials handover

> **Status: current, 11 Sep 2026.** This is the checklist that unblocks the
> critical path. Everything on it needs a browser, which is why an agent cannot
> do it.

Three logins, then one command. That is the whole thing.

## Before you start — a thing worth deciding

The new project is in a **different account/org** from its siblings, on both
platforms. Verified, not guessed:

| | boa-accreditation | boa-bar-control / boa-stok-form |
|---|---|---|
| Supabase org | ? (returns **403** to the CLI token on this Mac) | `vipinvmenon's Org` |
| Vercel scope | `vipin-menon` | `team_rDgA7v4RmDHjA3gFRapQoccp` |

Nothing is broken by this, but billing, access and team membership are
per-scope, and a second person cannot be added to a project they cannot see.
**It is much cheaper to move it now than after 641 people are registered in it.**

If you want it consolidated, do that first — Supabase can transfer a project
between orgs, and Vercel can transfer a project between scopes — then come back
to step 1.

---

## Step 1 · Log the Supabase CLI into the account that owns the project

The token currently on this Mac belongs to the org holding bar-control and
stok-form, and it gets a 403 on `tjbfvuboyvaephtewjwq`.

```bash
cd "/Users/USER/My Works/boa-accreditation"
corepack pnpm exec supabase logout
corepack pnpm exec supabase login
```

## Step 2 · Log the Vercel CLI in

**Done, 12 Sep 2026.** `vercel whoami` returns `vipinmenon006` and
`.vercel/project.json` is linked to `boa-accreditation`
(`team_rDgA7v4RmDHjA3gFRapQoccp`). `vercel --prod` works as a direct deploy
path — useful when the GitHub integration is slow or its status is unclear.
If this ever needs redoing:

```bash
corepack pnpm exec vercel login
corepack pnpm exec vercel link      # pick the boa-accreditation project
```

## Step 3 · Get the database password

Supabase does **not** expose it through the API — by design. Either you have it
from when the project was created, or reset it:

<https://supabase.com/dashboard/project/tjbfvuboyvaephtewjwq/settings/database>

Then, in the same shell you will run step 4 in:

```bash
export SUPABASE_DB_URL='postgresql://postgres.tjbfvuboyvaephtewjwq:<PASSWORD>@aws-0-<region>.pooler.supabase.com:6543/postgres'
```

Copy the exact string from **Connection string → Transaction pooler** and
substitute the password. Do not hand-assemble it — the pooler host differs by
region and a wrong one fails with a confusing DNS error.

## Step 4 · One command

```bash
corepack pnpm bootstrap
```

It will, all idempotently:

1. verify the logged-in Supabase account can actually see the project
2. fetch the publishable + service-role keys
3. write `.env.local` (gitignored, never printed)
4. push all five env vars to Vercel — Production, Preview and Development
5. set `SUPABASE_DB_URL` as a GitHub Actions secret **and confirm it landed**
6. report anything still outstanding

Dry run first if you like: `corepack pnpm bootstrap --check`.

It never prints a key. It reports lengths and prefixes only.

## Step 5 · Authenticate the MCP servers

This is an OAuth flow per server and must be a **regular terminal**, not an IDE
extension or a non-interactive session.

```bash
cd "/Users/USER/My Works/boa-accreditation"
claude
```

Approve the project-scoped servers when prompted, then:

```
/mcp
```

Select each of `supabase`, `vercel`, `github`, `playwright` → **Authenticate**.

In **Cursor**, MCP authenticates separately: Settings → MCP. It reads the same
`.mcp.json`.

## Step 6 · Confirm it all took

```bash
corepack pnpm db:state       # asks the database, not a document
corepack pnpm verify:deploy  # 18 checks against the live site
corepack pnpm task           # the blockers should now be clear
```

Then tick these in `docs/ROADMAP.md`:
`ACC-009a`, `ACC-009b`, `ACC-009c`, `ACC-010b`.

---

## What is still yours after this

- **The 38 organisations** — name, kind, quota, contact name, contact phone.
  Needed **17 Sep** for Phase 2.
- **Email addresses** for Bhoopesh, Salman and the two approvers. Needed **16 Sep**.
- **`BACKUP_ENCRYPTION_KEY`** GitHub secret (ACC-028, replaces PITR — see
  `docs/OPERATIONS.md` — Backups). Generate with `openssl rand -base64 32`,
  add as a repo secret, and save the passphrase outside GitHub too.

## If something fails

`bootstrap` names the failing step and what to do. The two likely ones:

- **403 on the project** → step 1 logged into the wrong account.
- **`api_keys:read` denied** → take the keys from
  <https://supabase.com/dashboard/project/tjbfvuboyvaephtewjwq/settings/api-keys>
  and paste them into `.env.local` by hand. The file's shape is in `.env.example`.
