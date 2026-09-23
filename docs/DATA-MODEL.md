# Data model

> **Status: specification.** Nothing below is built. `supabase/migrations/` is
> empty. This is ACC-020. See CURRENT-STATE.md.

Prefix `boa_acc_`. Tables in `public`, helpers in `private`. Nine domain tables
plus one auth-plumbing table.

## Conventions (from boa-bar-control)

- `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`.
- `timestamptz` always, never `timestamp`. Store UTC, display Asia/Kolkata.
- Enums are `create type public.boa_acc_<thing> as enum (...)`, snake_case values.
  Where a vocabulary will grow, use `text` + a `check (... in (...))` instead.
- Explicit column lists everywhere. Never `select *`.
- Every migration: one `begin;`/`commit;`, a comment header explaining the defect
  it prevents and what was rejected, grants and revokes in the same block.

## The tables

| # | Table | Holds |
|---|---|---|
| 1 | `boa_acc_type` | the 8 woven wristband tiers of the printed pack (ADR-018) |
| 2 | `boa_acc_org` | one row per company or department |
| 3 | `boa_acc_org_invite` | **many** live links per org |
| 4 | `boa_acc_person` | the spine — one row per human |
| 5 | `boa_acc_checkin` | append-only ledger: wristbands **and** vehicle stickers |
| 6 | `boa_acc_vehicle_event` | barrier crossings |
| 7 | `boa_acc_device` | gate devices. No accounts |
| 8 | `boa_acc_aaa_nomination` | Salman's named list |
| 9 | `boa_acc_submit_throttle` | per-token per-hour counter |
| — | `boa_acc_operator` | desk roster (auth plumbing, not domain) |
| — | `boa_acc_zone_access` | the pack's 26 (zone, tier) allow rows: `+ photo ID` flag, optional IST time window. **Absence is refusal** |

`boa_acc_zone` enum ordinality **is** the pack's "ZONE n OF 6" order:
`festival_area`, `eddies_lounge`, `promoters_lounge`, `photo_pit`, `backstage`,
`main_stage`. Every zone strip renders in that order with unheld zones prefixed
`—— `. Do not reorder it. Tier display order is `boa_acc_type.sort_order`, not
enum order. Source for both: `design/source/accreditation/access-matrix.json`.

`boa_acc_person.requested_type_code` is **advisory** (the importer's crew-type
hint). `type_code` is still set only by `boa_acc_decide`.
`boa_acc_person.requested_day_validity` (ACC-117) is advisory too: the roster
form's "Days on site" answer. `day_validity` is still set only at approval —
the `pass_only_when_approved` CHECK refuses it on a submitted row.

## The load-bearing constraints

**`pass_only_when_approved`** on `boa_acc_person` — a `CHECK`, not a convention,
so the design's rule *"pass tokens generate on approval, nothing before"* holds
even when an RPC is wrong:

```sql
constraint pass_only_when_approved check (
  (status = 'approved') = (pass_token is not null)
  and (status = 'approved') = (pass_ref is not null)
  and (status = 'approved') = (type_code is not null)
  and (status = 'approved') = (day_validity is not null))
```

Also: `rejection_needs_reason`, `bms_flag_consistent`, `reissue_needs_note`,
`void_targets_a_row`, `sticker_needs_plate`, `turn_away_needs_reason`.

**Ledger immutability** is a trigger, not a convention, and `ENABLE ALWAYS` so it
fires for the table owner too:

```sql
create trigger boa_acc_checkin_immutable before update or delete
  on public.boa_acc_checkin for each row
  execute function private.boa_acc_reject_mutation();
alter table public.boa_acc_checkin enable always trigger boa_acc_checkin_immutable;
```

A reissue appends with `is_reissue = true` and a mandatory supervisor note. A void
appends with `voids_checkin_id`. Nothing is ever updated.

## Two identifiers per person — never couple them

- `pass_ref` — `BOA26-0412`, from a sequence, human-readable, printed on the pass.
- `pass_token` — 22 random chars, secret, what the QR encodes.

The design's mock data has Ranjith as `BOA26-0412` **and** band `#0412`. That is a
coincidence in a mock. Coupling them would make the ledger's evidence circular.

## Serials are not unique — deliberately

`band_serial` and `sticker_no` are typed at the gate and are **not** uniquely
indexed (except a partial unique index on `sticker_no` for active stickers).

A unique index would reject an **offline write at drain time**, days after the
band was physically fastened to a wrist. An append-only ledger must never refuse a
drain for a data-quality reason: the event already happened. Typos surface as a
desk duplicate report, where a human can fix them.

## C9 — the AAA arithmetic

The design shows AAA count `14`, approved total `612 = 520+78+14`, but the AAA
panel says *"14 issued of 18 approved"* and the queue filter says `AAA flagged 18`.

These are two different statistics and both are true:

- `aaa_nominated_approved = 18` — Salman's list (`where approved`).
- `aaa_stamped = 14` — stamped onto an approved pass (`where person_id is not null`).

Four nominees have no person row yet. The types card shows *stamped*.

## Projections

- `boa_acc_person_state` — person + type + org + the latest non-voided issue.
  This is the Master list and the amber line *"Issued 14:02 · Gate 1 · band #0412 by Ravi"*.
- `boa_acc_sticker_current` — plate → active sticker. The barrier's lookup.
- `boa_acc_desk_dashboard()` — every Control-room number in **one** round trip.
  The Control room is one query, not eight. Since ACC-148 it also carries
  `doubleIssues`: a count of people holding two or more live wristbands.
- `boa_acc_double_issues()` (ACC-148, `202609221300`) — the names behind that
  count. One element per person holding **two or more live, non-reissue**
  wristband rows ("live" = no void row targets it, ADR-012), listing every live
  band they hold: serial, issuer, gate, `occurredAt` (phone clock, clamped) and
  `postedAt` (sync time). The issuer is `coalesce(operator display_name,
  volunteer_name)`: the operator is read by probing the row for an
  `operator_id` key (ACC-150), so legacy device rows fall back to the
  volunteer name the gate RPC wrote. A supervisor-noted reissue does not by
  itself raise a warning. Read-only: the ledger keeps every row; the desk voids
  the spare at the gate. Active lead/approver/admin only.

Neither view is granted to `anon`.

> ⚠ **A Postgres view bypasses RLS by default** — it runs as its owner, not its
> caller, so a view over `boa_acc_person` would hand `authenticated` every column
> the *owner* can see, `pass_token` included. Both views must be created
> `with (security_invoker = true)` (Postgres 15+; this project is on 17).
>
> This is the single easiest way to undo the entire column-grant defence in
> SECURITY.md, and it fails silently — the view simply works, and returns too
> much. `privileges.test.sql` must assert that `authenticated` cannot read
> `pass_token` **through the views**, not only through the base table.
