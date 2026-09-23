-- ACC-150 · The `issuer` role and the session-authorised gate (ADR-020).
--
-- @proves: CRITICAL | an issuer can pull the gate roster, issue a band and log a vehicle event
-- @proves: CRITICAL | every ledger and vehicle row an issuer writes records that issuer's operator id and name
-- @proves: CRITICAL | an issuer is refused by decide, approve/reject org, import, invite, create org, user admin and AAA approval
-- @proves: CRITICAL | an issuer fails the desk predicate every desk read policy uses, so desk tables read as empty
-- @proves: CRITICAL | no session, an inactive issuer, and an approver are refused by every gate RPC
-- @proves: HIGH     | lead and admin can use the gate; an approver keeps full desk access
--
-- ONE statement, the same shape as operator-active.test.sql: fixtures are
-- sequential materialized CTEs, cleanup is in the same statement, and a live
-- run leaves no ACC-150 rows.
--
-- WHO IS CALLING: every assertion sets request.jwt.claims itself, inside the
-- SQL it runs, through `from (select set_config(...) as c) s where s.c is not
-- null` — the WHERE makes the RPC depend on the claim being set first. No
-- assertion relies on the order another one ran in.
--
-- THE LEDGER IS NEVER WRITTEN FOR KEEPS. boa_acc_checkin and
-- boa_acc_vehicle_event are ENABLE ALWAYS immutable (non-negotiable #2), so a
-- committed test row could never be removed. Each "allowed" write below
-- really inserts, reads its own reply, and then deliberately fails a cast
-- whose error text says what it saw: 'invalid input syntax for type
-- integer: "recorded"' only if the reply carried this issuer's operator id
-- and name. throws_ok runs the SQL inside its own exception block, so that
-- error rolls the insert back to a savepoint. The assertion therefore proves
-- the write was authorised and attributed, and leaves nothing behind.
-- Refusals are asserted by SQLSTATE and message: 42501 'not authorized'.
--
-- The desk predicate is read the same way ('"desk"' / '"not-desk"'), and for
-- the same second reason: private.boa_acc_is_operator() is STABLE, so called
-- directly in this statement it would use the statement's own snapshot and
-- could not see the operator rows the CTEs above just inserted — it would
-- answer false for everyone and an "issuer is refused" check would pass
-- vacuously. Run through throws_ok, it gets a fresh snapshot.

with
  wiped_org as materialized (
    select private.boa_acc_wipe_org('ACC-150 issuer')
  ),
  wiped_emails as materialized (
    select private.boa_acc_wipe_email(e)
      from unnest(array[
        'acc150-issuer@invalid.test',
        'acc150-issuer-off@invalid.test',
        'acc150-lead@invalid.test',
        'acc150-admin@invalid.test',
        'acc150-approver@invalid.test'
      ]) as e
     where (select count(*) from wiped_org) >= 0
  ),
  usr as materialized (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           e,
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
      from unnest(array[
        'acc150-issuer@invalid.test',
        'acc150-issuer-off@invalid.test',
        'acc150-lead@invalid.test',
        'acc150-admin@invalid.test',
        'acc150-approver@invalid.test'
      ]) as e
     where (select count(*) from wiped_emails) >= 0
    returning id, email
  ),
  op_issuer as materialized (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'issuer', 'ACC-150 Issuer' from usr where email = 'acc150-issuer@invalid.test'
    returning user_id
  ),
  op_issuer_off as materialized (
    insert into public.boa_acc_operator (user_id, role, display_name, active)
    select id, 'issuer', 'ACC-150 Former Issuer', false from usr where email = 'acc150-issuer-off@invalid.test'
    returning user_id
  ),
  op_lead as materialized (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-150 Lead' from usr where email = 'acc150-lead@invalid.test'
    returning user_id
  ),
  op_admin as materialized (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'admin', 'ACC-150 Admin' from usr where email = 'acc150-admin@invalid.test'
    returning user_id
  ),
  op_approver as materialized (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-150 Approver' from usr where email = 'acc150-approver@invalid.test'
    returning user_id
  ),
  claims as materialized (
    select
      json_build_object('sub', (select user_id from op_issuer)::text,     'role', 'authenticated')::text as issuer,
      json_build_object('sub', (select user_id from op_issuer_off)::text, 'role', 'authenticated')::text as issuer_off,
      json_build_object('sub', (select user_id from op_lead)::text,       'role', 'authenticated')::text as lead,
      json_build_object('sub', (select user_id from op_admin)::text,      'role', 'authenticated')::text as admin,
      json_build_object('sub', (select user_id from op_approver)::text,   'role', 'authenticated')::text as approver,
      ''::text as nobody
  ),
  org as materialized (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-150 issuer', 'vendor', 5, 'Issuer Contact', '+919877000150'
     where (select issuer from claims) is not null
    returning id
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
      (select token from tok), 'ACC150 Gate Person', '+919821000150', 'Driver', 'KA05MJ1500'
    ) as id
    from inv
  ),
  approved as materialized (
    select private.boa_acc_test_approve_person((select id from person), 'crew') as done
     where (select id from person) is not null
  ),
  -- `%1$s` is the call, `%2$L` the claims it runs under.
  q as materialized (
    select 'select %1$s from (select set_config(''request.jwt.claims'', %2$L, true) as c) s where s.c is not null'::text as as_user
     where (select count(*) from approved) >= 0
  ),
  results as materialized (
    select 0 as n, plan(37) as line
     where (select as_user from q) is not null

    -- ---------------------------------------------------------------
    -- The issuer at the gate: allowed, and attributed.
    -- ---------------------------------------------------------------
    union all select 1, is(
      (select public.boa_acc_gate_pull() ->> 'operatorId'
         from (select set_config('request.jwt.claims', (select issuer from claims), true) as c) s
        where s.c is not null),
      (select user_id from op_issuer)::text,
      'issuer: boa_acc_gate_pull() answers, for the issuer''s own session'
    )
    union all select 2, ok(
      (select (public.boa_acc_gate_pull() -> 'roster') @> jsonb_build_array(jsonb_build_object('personId', (select id from person)))
         from (select set_config('request.jwt.claims', (select issuer from claims), true) as c) s
        where s.c is not null),
      'issuer: the pulled roster carries the approved person'
    )
    union all select 3, is(
      (select public.boa_acc_gate_pull() ->> 'volunteerName'
         from (select set_config('request.jwt.claims', (select issuer from claims), true) as c) s
        where s.c is not null),
      'ACC-150 Issuer',
      'issuer: the pull names the issuer (the gate shows who is signed in)'
    )
    union all select 4, throws_ok(
      format(
        $f$select (case when r->>'operatorId' = %1$L and r->>'volunteerName' = 'ACC-150 Issuer' and r->>'kind' = 'wristband'
                          then 'recorded' else 'unattributed' end)::int
             from (select public.boa_acc_gate_issue(gen_random_uuid(), p.pass_token, 'wristband') as r
                     from public.boa_acc_person p,
                          (select set_config('request.jwt.claims', %2$L, true) as c) s
                    where s.c is not null and p.id = %3$L) x$f$,
        (select user_id from op_issuer), (select issuer from claims), (select id from person)
      ),
      '22P02', 'invalid input syntax for type integer: "recorded"',
      'issuer: boa_acc_gate_issue appends a wristband row that records the issuer''s operator id and name (rolled back)'
    )
    union all select 5, throws_ok(
      format(
        $f$select (case when r->>'operatorId' = %1$L and r->>'officerName' = 'ACC-150 Issuer' and r->>'outcome' = 'turned_away'
                          then 'recorded' else 'unattributed' end)::int
             from (select public.boa_acc_gate_vehicle(gen_random_uuid(), 'KA05MJ1500', 'turned_away', null, null, '{}'::jsonb, 'No sticker') as r
                     from (select set_config('request.jwt.claims', %2$L, true) as c) s
                    where s.c is not null) x$f$,
        (select user_id from op_issuer), (select issuer from claims)
      ),
      '22P02', 'invalid input syntax for type integer: "recorded"',
      'issuer: boa_acc_gate_vehicle records a barrier event that names the issuer (rolled back)'
    )
    union all select 6, throws_ok(
      format((select as_user from q), format('public.boa_acc_gate_issue(gen_random_uuid(), %L, ''wristband'')', 'no-such-pass'), (select issuer from claims)),
      'P0002', 'person not found',
      'issuer: an unknown pass reaches validation (authorised), and is refused as not found'
    )

    -- ---------------------------------------------------------------
    -- The issuer at the desk: refused, in the database.
    -- ---------------------------------------------------------------
    union all select 7, throws_ok(
      format((select as_user from q), format('public.boa_acc_decide(%L, true)', (select id from person)), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_decide (approve a person) is refused'
    )
    union all select 8, throws_ok(
      format((select as_user from q), format('public.boa_acc_approve_org(%L, null, null)', (select id from org)), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_approve_org is refused'
    )
    union all select 9, throws_ok(
      format((select as_user from q), format('public.boa_acc_reject_org(%L, %L)', (select id from org), 'no'), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_reject_org is refused'
    )
    union all select 10, throws_ok(
      format((select as_user from q), format('public.boa_acc_import_roster(%L, %L::jsonb)', (select id from org), '[]'), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_import_roster is refused'
    )
    union all select 11, throws_ok(
      format((select as_user from q), format('public.boa_acc_mint_invite(%L, null)', (select id from org)), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_mint_invite (invite an org) is refused'
    )
    union all select 12, throws_ok(
      format((select as_user from q), 'public.boa_acc_create_org(''ACC-150 nope'', ''vendor'', 1, ''No One'', ''+919877000151'', null)', (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_create_org is refused'
    )
    union all select 13, throws_ok(
      format((select as_user from q), format('public.boa_acc_set_operator_active(%L, false)', (select user_id from op_lead)), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_set_operator_active (user admin) is refused'
    )
    union all select 14, throws_ok(
      format((select as_user from q), format('public.boa_acc_approve_aaa_nomination(%L)', gen_random_uuid()), (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_approve_aaa_nomination is refused'
    )
    union all select 15, throws_ok(
      format((select as_user from q), 'public.boa_acc_nominate_aaa(''ACC150 Nominee'', ''+919821000151'', ''ACC-150'')', (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_nominate_aaa is refused'
    )
    union all select 16, throws_ok(
      format((select as_user from q), 'public.boa_acc_desk_dashboard()', (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_desk_dashboard is refused'
    )
    union all select 17, throws_ok(
      format((select as_user from q), 'public.boa_acc_approval_queue(''pending'')', (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_approval_queue is refused'
    )
    union all select 18, throws_ok(
      format((select as_user from q), 'public.boa_acc_passes()', (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_passes is refused'
    )
    union all select 19, throws_ok(
      format((select as_user from q), 'public.boa_acc_list_aaa_nominations()', (select issuer from claims)),
      '42501', 'not authorized', 'issuer: boa_acc_list_aaa_nominations is refused'
    )
    union all select 20, throws_ok(
      format((select as_user from q), '(case when private.boa_acc_is_operator() then ''desk'' else ''not-desk'' end)::int', (select issuer from claims)),
      '22P02', 'invalid input syntax for type integer: "not-desk"',
      'issuer: fails private.boa_acc_is_operator(), the desk read predicate'
    )
    union all select 21, ok(
      not exists (
        select 1
          from pg_policies p
         where p.schemaname = 'public'
           and p.tablename like 'boa\_acc\_%'
           and p.policyname <> 'boa_acc_operator_read'
           and p.qual is distinct from 'private.boa_acc_is_operator()'
      ),
      'every boa_acc read policy (except own-operator-row) is exactly the bare desk predicate, so an issuer reads nothing'
    )

    -- ---------------------------------------------------------------
    -- Everyone else at the gate.
    -- ---------------------------------------------------------------
    union all select 23, is(
      (select public.boa_acc_gate_pull() ->> 'operatorRole'
         from (select set_config('request.jwt.claims', (select lead from claims), true) as c) s
        where s.c is not null),
      'lead',
      'lead: may use the gate (pull answers)'
    )
    union all select 24, is(
      (select public.boa_acc_gate_pull() ->> 'operatorRole'
         from (select set_config('request.jwt.claims', (select admin from claims), true) as c) s
        where s.c is not null),
      'admin',
      'admin: may use the gate (pull answers)'
    )
    union all select 25, throws_ok(
      format((select as_user from q), 'public.boa_acc_gate_pull()', (select approver from claims)),
      '42501', 'not authorized', 'approver: boa_acc_gate_pull is refused (approvers are desk-only)'
    )
    union all select 26, throws_ok(
      format((select as_user from q), format('public.boa_acc_gate_issue(gen_random_uuid(), %L, ''wristband'')', 'no-such-pass'), (select approver from claims)),
      '42501', 'not authorized', 'approver: boa_acc_gate_issue is refused before any validation'
    )
    union all select 27, throws_ok(
      format((select as_user from q), 'public.boa_acc_gate_vehicle(gen_random_uuid(), ''KA05MJ1500'', ''turned_away'', null, null, ''{}''::jsonb, ''x'')', (select approver from claims)),
      '42501', 'not authorized', 'approver: boa_acc_gate_vehicle is refused'
    )
    union all select 28, throws_ok(
      format((select as_user from q), '(case when private.boa_acc_is_operator() then ''desk'' else ''not-desk'' end)::int', (select approver from claims)),
      '22P02', 'invalid input syntax for type integer: "desk"',
      'approver: still passes the desk predicate (desk access unchanged)'
    )
    union all select 29, throws_ok(
      format((select as_user from q), '(case when private.boa_acc_is_operator() then ''desk'' else ''not-desk'' end)::int', (select lead from claims)),
      '22P02', 'invalid input syntax for type integer: "desk"',
      'lead: still passes the desk predicate'
    )
    union all select 30, throws_ok(
      format((select as_user from q), 'public.boa_acc_gate_pull()', (select issuer_off from claims)),
      '42501', 'not authorized', 'a deactivated issuer: boa_acc_gate_pull is refused'
    )
    union all select 31, throws_ok(
      format((select as_user from q), format('public.boa_acc_gate_issue(gen_random_uuid(), %L, ''wristband'')', 'no-such-pass'), (select issuer_off from claims)),
      '42501', 'not authorized', 'a deactivated issuer: boa_acc_gate_issue is refused'
    )
    union all select 32, throws_ok(
      format((select as_user from q), 'public.boa_acc_gate_pull()', (select nobody from claims)),
      '42501', 'not authorized', 'no session: boa_acc_gate_pull is refused'
    )
    union all select 33, throws_ok(
      format((select as_user from q), format('public.boa_acc_gate_issue(gen_random_uuid(), %L, ''wristband'')', 'no-such-pass'), (select nobody from claims)),
      '42501', 'not authorized', 'no session: boa_acc_gate_issue is refused'
    )
    union all select 34, throws_ok(
      format((select as_user from q), 'public.boa_acc_gate_vehicle(gen_random_uuid(), ''KA05MJ1500'', ''turned_away'', null, null, ''{}''::jsonb, ''x'')', (select nobody from claims)),
      '42501', 'not authorized', 'no session: boa_acc_gate_vehicle is refused'
    )

    -- ---------------------------------------------------------------
    -- The constraint behind "every row records the operator".
    -- ---------------------------------------------------------------
    union all select 35, throws_ok(
      format(
        'insert into public.boa_acc_checkin (person_id, kind, idempotency_key, gate_label, volunteer_name, occurred_at)
         values (%L, ''wristband'', gen_random_uuid(), ''Check-in'', ''Nobody'', clock_timestamp())',
        (select id from person)
      ),
      '23514', 'new row for relation "boa_acc_checkin" violates check constraint "boa_acc_checkin_actor_required"',
      'a ledger row naming neither an operator nor a device is refused, even from the table owner'
    )
    union all select 36, throws_ok(
      'insert into public.boa_acc_vehicle_event (idempotency_key, plate, outcome, reason, gate_label, officer_name, occurred_at)
       values (gen_random_uuid(), ''KA05MJ1500'', ''turned_away'', ''x'', ''Vehicle gate'', ''Nobody'', clock_timestamp())',
      '23514', 'new row for relation "boa_acc_vehicle_event" violates check constraint "boa_acc_vehicle_event_actor_required"',
      'a vehicle event naming neither an operator nor a device is refused'
    )
    union all select 37, ok(
      (select c.convalidated
         from pg_constraint c
        where c.conname = 'boa_acc_checkin_actor_required'),
      'boa_acc_checkin_actor_required is validated: every ledger row, old and new, names who acted'
    )
    union all select 38, throws_ok(
      'select public.boa_acc_gate_pull(''any-device-token'')',
      '42501', 'invalid device',
      'the retired device-token pull authenticates nothing (and no client role may call it: privileges.test.sql)'
    )
  ),
  kept as materialized (
    select n, line from results
  ),
  clean_org as materialized (
    select private.boa_acc_wipe_org('ACC-150 issuer')
     where (select count(*) from kept) >= 0
  ),
  clean_emails as materialized (
    select private.boa_acc_wipe_email(e)
      from unnest(array[
        'acc150-issuer@invalid.test',
        'acc150-issuer-off@invalid.test',
        'acc150-lead@invalid.test',
        'acc150-admin@invalid.test',
        'acc150-approver@invalid.test'
      ]) as e
     where (select count(*) from clean_org) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_emails), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
