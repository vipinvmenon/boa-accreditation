-- ACC-117 · boa_acc_import_roster — the roster form's bulk load.
--
-- @proves: CRITICAL | a 500-row roster imports in ONE call, 500 rows inserted as submitted
-- @proves: CRITICAL | no imported row has a pass_token, pass_ref, type_code or day_validity (non-negotiable #5)
-- @proves: CRITICAL | a caller with no operator session is refused (42501)
-- @proves: CRITICAL | quota is refused per row (quota_exceeded) and the rest of the batch still loads
-- @proves: HIGH     | a duplicate phone is refused per row, inside one batch and across calls (re-run safe)
-- @proves: HIGH     | an approver (not lead/admin) is refused — importing is lead/admin work
-- @proves: HIGH     | requested_type_code / requested_day_validity carry the advisory hints; a non-requestable tier (aaa) is refused per row
-- @proves: MEDIUM   | submitted_at keeps the form's timestamp, and a timestamp with no UTC offset is refused per row
--
-- ONE statement, cleanup in the same statement — same shape as
-- decide.test.sql. Every call whose outcome depends on the JWT is its own
-- gated top-level CTE (see decide.test.sql's header for why), and every read
-- of a row the RPC inserted goes through private.boa_acc_test_read_person,
-- because a bare select shares this statement's one snapshot and cannot see
-- them.

with
  wiped as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-117 import 500'), ('ACC-117 import small')) v(n)
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email(e)
      from (values ('acc117-lead@invalid.test'), ('acc117-approver@invalid.test')) v(e)
     where (select count(*) from wiped) >= 0
  ),

  org_big as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-117 import 500', 'vendor', 500, 'Import Contact', '+919877117001'
     where (select count(*) from wiped_email) >= 0
    returning id
  ),
  org_small as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-117 import small', 'vendor', 3, 'Import Small Contact', '+919877117002'
      from org_big
    returning id
  ),

  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', e,
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from (values ('acc117-lead@invalid.test'), ('acc117-approver@invalid.test')) v(e)
     where (select id from org_small) is not null
    returning id, email
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id,
           (case when email like 'acc117-lead%' then 'lead' else 'approver' end)::public.boa_acc_operator_role,
           'ACC-117 ' || email
      from usr
    returning user_id, role
  ),
  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op where role = 'lead')::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),

  -- 500 rows, one call. Row numbers start at 2, as a sheet's do.
  big as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_roster(
        (select id from org_big),
        (select jsonb_agg(jsonb_build_object(
                  'row_no', i + 1,
                  'full_name', 'ACC117 Person ' || i,
                  'phone', '+919002' || lpad(i::text, 6, '0'),
                  'role_text', 'Bar Crew',
                  'requested_type_code', 'crew',
                  'requested_day_validity', 'show',
                  'submitted_at', '2026-09-21T10:00:00+05:30'
                ) order by i)
           from generate_series(1, 500) i)
      ) r
     where (select claims from jwt) is not null
  ),
  big_reads as materialized (
    select private.boa_acc_test_read_person(b.person_id) as r
      from big b
     where b.person_id is not null
  ),

  -- Quota 3. Outcomes are asserted as one ordered array.
  small as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_roster(
        (select id from org_small),
        jsonb_build_array(
          jsonb_build_object('row_no', 2,  'full_name', 'Small A', 'phone', '+919001100001', 'role_text', 'Security'),
          jsonb_build_object('row_no', 3,  'full_name', 'Small B', 'phone', '+919001100002', 'role_text', 'Stage hand', 'requested_type_code', 'stage', 'vehicle_reg', 'ka01 ab 1234'),
          jsonb_build_object('row_no', 4,  'full_name', 'Small C', 'phone', '+919001100001', 'role_text', 'Security'),
          jsonb_build_object('row_no', 5,  'full_name', 'Small D', 'phone', '+919001100003', 'role_text', 'Security'),
          jsonb_build_object('row_no', 6,  'full_name', 'Small E', 'phone', '+919001100004', 'role_text', 'Security'),
          jsonb_build_object('row_no', 7,  'full_name', 'Small F', 'phone', '12345',         'role_text', 'Security'),
          jsonb_build_object('row_no', 8,  'full_name', 'Small G', 'phone', '+919001100005', 'role_text', 'Security', 'requested_type_code', 'aaa'),
          jsonb_build_object('row_no', 9,  'full_name', 'Small H', 'phone', '+919001100006', 'role_text', 'Security', 'submitted_at', '2026-09-21 10:00:00'),
          jsonb_build_object('row_no', 10, 'full_name', 'Small I', 'phone', '+919001100002', 'role_text', 'Security')
        )
      ) r
     where (select count(*) from big) = 500
  ),
  small_b as materialized (
    select private.boa_acc_test_read_person(s.person_id) as r
      from small s
     where s.row_no = 3
  ),

  -- The same sheet loaded twice: every row already there is a duplicate.
  rerun as materialized (
    select r.row_no, r.outcome
      from public.boa_acc_import_roster(
        (select id from org_big),
        (select jsonb_agg(jsonb_build_object(
                  'row_no', i + 1,
                  'full_name', 'ACC117 Person ' || i,
                  'phone', '+919002' || lpad(i::text, 6, '0'),
                  'role_text', 'Bar Crew'
                ) order by i)
           from generate_series(1, 3) i)
      ) r
     where (select count(*) from small) = 9
  ),

  jwt_approver as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op where role = 'approver')::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select count(*) from rerun) = 3
  ),
  approver_attempt as materialized (
    select throws_ok(
      format('select row_no from public.boa_acc_import_roster(%L, %L::jsonb)', (select id from org_small), '[]'),
      '42501',
      'not authorized',
      'an approver cannot import a roster'
    ) as line
     where (select claims from jwt_approver) is not null
  ),
  jwt_cleared as materialized (
    select set_config('request.jwt.claims', '', true) as claims
     where (select line from approver_attempt) is not null
  ),
  non_operator_attempt as materialized (
    select throws_ok(
      format('select row_no from public.boa_acc_import_roster(%L, %L::jsonb)', (select id from org_small), '[]'),
      '42501',
      'not authorized',
      'no operator session cannot import a roster'
    ) as line
     where (select claims from jwt_cleared) is not null
  ),

  results as materialized (
    select 0 as n, plan(14) as line

    union all select 1, is((select count(*)::integer from big where outcome = 'inserted'), 500,
      '500 rows in one call: all 500 inserted')
    union all select 2, is((select count(distinct person_id)::integer from big), 500,
      'each inserted row returns its own person_id')
    union all select 3, is((select min(row_no) || '-' || max(row_no) from big), '2-501',
      'the caller''s row numbers come back unchanged')
    union all select 4, is(
      (select count(*)::integer from big_reads
        where (r).status = 'submitted'
          and (r).pass_token is null and (r).pass_ref is null
          and (r).type_code is null and (r).day_validity is null),
      500,
      'all 500 are submitted with no pass_token, pass_ref, type_code or day_validity')
    union all select 5, is(
      (select count(*)::integer from big_reads
        where (r).requested_type_code = 'crew' and (r).requested_day_validity = 'show'),
      500,
      'the advisory tier and day hints are stored')
    union all select 6, is(
      (select min((r).submitted_at) from big_reads),
      '2026-09-21T04:30:00Z'::timestamptz,
      'submitted_at is the form''s IST timestamp, as an instant')

    union all select 7, is(
      (select array_agg(outcome order by row_no) from small),
      array['inserted','inserted','duplicate_phone','inserted','quota_exceeded',
            'invalid','invalid','invalid','duplicate_phone'],
      'per-row outcomes: duplicates and the over-quota row are refused, the rest load')
    union all select 8, is(
      (select count(*)::integer from small where outcome = 'inserted'), 3,
      'exactly the quota (3) was inserted')
    union all select 9, ok(
      (select detail ~ 'requestable' from small where row_no = 8),
      'requesting aaa is refused as a non-requestable tier')
    union all select 10, ok(
      (select detail ~ 'UTC offset' from small where row_no = 9),
      'a timestamp with no UTC offset is refused')
    union all select 11, ok(
      (select (r).requested_type_code = 'stage' and (r).vehicle_reg = 'KA01AB1234' and (r).type_code is null from small_b),
      'requested stage stored as a hint only; plate normalised')

    union all select 12, is(
      (select array_agg(outcome order by row_no) from rerun),
      array['duplicate_phone','duplicate_phone','duplicate_phone'],
      're-importing rows already loaded reports duplicate_phone, writes nothing')

    union all select 13, (select line from approver_attempt)
    union all select 14, (select line from non_operator_attempt)
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-117 import 500'), ('ACC-117 import small')) v(n)
     where (select count(*) from kept) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email(e)
      from (values ('acc117-lead@invalid.test'), ('acc117-approver@invalid.test')) v(e)
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
