-- ACC-041 · boa_acc_checkin's own CHECK constraints, without ever writing a
-- real row to it.
--
-- @proves: CRITICAL | a reissue with no supervisor_note is refused (boa_acc_checkin_reissue_needs_note)
-- @proves: CRITICAL | a void row with no voids_checkin_id is refused (boa_acc_checkin_void_targets_a_row)
-- @proves: HIGH     | a vehicle_sticker row with no plate is refused (boa_acc_checkin_sticker_needs_plate)
--
-- WHY THIS FILE NEVER LEAVES A ROW IN boa_acc_checkin
--
-- boa_acc_checkin_immutable is ENABLE ALWAYS (non-negotiable #2): nobody,
-- including the table owner, can UPDATE or DELETE a row in it, ever. A test
-- that successfully inserts a checkin row therefore can never clean itself
-- up — supabase/tests/dashboard.test.sql already hit this for real (an
-- earlier draft's two leftover rows had to be removed from the live ledger
-- by hand, disabling and re-enabling the trigger, with the user's explicit
-- approval) and its own header says so.
--
-- Every assertion below is a throws_ok against a FAILING insert. A failing
-- INSERT is rolled back by Postgres before it commits anything — pgTAP's
-- throws_ok catches the exception inside its own PL/pgSQL block, which
-- rolls back to an implicit savepoint at the start of that block, undoing
-- the insert's effects entirely. So this file gets real, permanent,
-- automated coverage of the ledger's reissue/void shape without ever
-- creating a row that would need deleting. See docs/DECISIONS.md ADR-012.
--
-- What this file deliberately does NOT prove, and why:
--
--  * That a WELL-FORMED reissue row (all three CHECKs satisfied) actually
--    inserts successfully. Proving that needs either a row that commits
--    (which this ledger can never let a test delete again) or a contrived
--    "make it fail for an unrelated reason afterwards" trick that is more
--    fragile than the guarantee it buys. Skipped on purpose rather than
--    shipped half-working.
--  * The aggregate "latest non-voided checkin per person" logic
--    (bandsIssued/stickersActive) — that needs a real, successfully
--    committed row and was verified by hand once, per dashboard.test.sql's
--    own header, not automated.
--  * Any actual write path to this table. Nothing in this project writes to
--    boa_acc_checkin yet — the gate-scan RPC that will is Phase 4 scope
--    (ACC-052 gate/resolve.ts, ACC-056 /api/gate/*), deliberately not
--    anticipated here. See docs/DECISIONS.md ADR-012 for why "reissue" in
--    this codebase means a physical-article ledger append at the gate, not
--    a new pass_token, and why that RPC does not exist yet.
--
-- ONE statement. The only rows this file creates permanently, for the
-- duration of the statement, are one throwaway org/person (cleaned up via
-- private.boa_acc_wipe_org). Since ACC-150 no device row is needed at all.

with
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-041 ledger')
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-041 ledger', 'vendor', 5, 'Ledger Contact', '+919877000003'
     where (select count(*) from wiped) >= 0
    returning *
  ),
  tok as materialized (
    select private.boa_acc_new_token() as token from org
  ),
  inv as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org), private.boa_acc_hash_token(tok.token), left(tok.token, 6)
      from tok
    returning id
  ),
  person as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC041 Ledger Person', '+919821000301', 'Crew'
    ) as id from inv
  ),
  -- ACC-150: rows now carry operator_id (boa_acc_checkin_actor_required)
  -- and device_id is NULL. A random operator id is enough: the column has no
  -- FK on purpose (202609221201). Without it every insert below would be
  -- refused by actor_required first, and these assertions would pass for
  -- the wrong reason — hence each one now names the constraint it expects.
  actor as materialized (
    select gen_random_uuid() as operator_id
     where (select id from person) is not null
  ),
  results as materialized (
    select 0 as n, plan(3) as line

    union all select 1, throws_ok(
      format(
        'insert into public.boa_acc_checkin
           (person_id, kind, idempotency_key, operator_id, gate_label, volunteer_name, occurred_at, is_reissue, supervisor_note)
         values (%L, %L, %L, %L, %L, %L, %L, %L, %L)',
        (select id from person), 'wristband', gen_random_uuid(), (select operator_id from actor),
        'ACC-041 Gate', 'ACC-041 Volunteer', clock_timestamp(), true, null
      ),
      '23514',
      'new row for relation "boa_acc_checkin" violates check constraint "boa_acc_checkin_reissue_needs_note"',
      'a reissue with no supervisor_note is refused (boa_acc_checkin_reissue_needs_note)'
    )

    union all select 2, throws_ok(
      format(
        'insert into public.boa_acc_checkin
           (person_id, kind, idempotency_key, operator_id, gate_label, volunteer_name, occurred_at, voids_checkin_id)
         values (%L, %L, %L, %L, %L, %L, %L, %L)',
        (select id from person), 'void', gen_random_uuid(), (select operator_id from actor),
        'ACC-041 Gate', 'ACC-041 Volunteer', clock_timestamp(), null
      ),
      '23514',
      'new row for relation "boa_acc_checkin" violates check constraint "boa_acc_checkin_void_targets_a_row"',
      'a void row with no voids_checkin_id is refused (boa_acc_checkin_void_targets_a_row)'
    )

    union all select 3, throws_ok(
      format(
        'insert into public.boa_acc_checkin
           (person_id, kind, idempotency_key, operator_id, gate_label, volunteer_name, occurred_at, vehicle_reg)
         values (%L, %L, %L, %L, %L, %L, %L, %L)',
        (select id from person), 'vehicle_sticker', gen_random_uuid(), (select operator_id from actor),
        'ACC-041 Gate', 'ACC-041 Volunteer', clock_timestamp(), null
      ),
      '23514',
      'new row for relation "boa_acc_checkin" violates check constraint "boa_acc_checkin_sticker_needs_plate"',
      'a vehicle_sticker row with no plate is refused (boa_acc_checkin_sticker_needs_plate)'
    )
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-041 ledger')
     where (select count(*) from kept) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
