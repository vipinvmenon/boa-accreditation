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
