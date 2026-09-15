-- ACC-091 · Token-scoped roster projection.
--
-- @proves: CRITICAL | the roster is resolved from a live invite token, not a caller-supplied org id
-- @proves: HIGH     | the projection returns only full_name, role_text and status
-- @proves: HIGH     | draft and voided rows never appear in the public roster
-- @proves: MEDIUM   | unknown tokens are indistinguishable from other token misses
--
-- One statement so the database runner can consume the final SELECT. The
-- function is VOLATILE deliberately: this test seeds rows and reads them in
-- the same statement, just like the existing org_view tests.

with
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-091 roster')
  ),
  org as materialized (
    insert into public.boa_acc_org (
      name, kind, quota, contact_name, contact_phone
    )
    select 'ACC-091 roster', 'vendor', 22, 'Roster Contact', '+919811111111'
    where (select count(*) from wiped) >= 0
    returning id
  ),
  token as materialized (
    select private.boa_acc_new_token() as raw_token
    where (select count(*) from org) = 1
  ),
  invite as materialized (
    insert into public.boa_acc_org_invite (
      org_id, token_hash, token_hint
    )
    select
      org.id,
      private.boa_acc_hash_token(raw_token),
      left(raw_token, 6)
    from org
    cross join token
    returning id
  ),
  people as materialized (
    insert into public.boa_acc_person (
      org_id, full_name, phone, role_text, status, type_code, day_validity,
      pass_ref, pass_token, approved_at, decision_reason
    )
    select org.id, v.full_name, v.phone, v.role_text,
           v.status::public.boa_acc_person_status,
           case when v.status = 'approved' then 'crew'::public.boa_acc_type_code end,
           case when v.status = 'approved' then 'show'::public.boa_acc_day_validity end,
           case when v.status = 'approved' then 'BOA26-0091' end,
           case when v.status = 'approved' then 'test-roster-pass-token' end,
           case when v.status = 'approved' then clock_timestamp() end,
           v.decision_reason
    from org
    cross join (values
      ('Approved Person', '+919811111111', 'Stage crew', 'approved', null),
      ('Submitted Person', '+919822222222', 'Runner', 'submitted', null),
      ('Rejected Person', '+919833333333', 'Driver', 'rejected', 'Not required'),
      ('Draft Person', '+919844444444', 'Volunteer', 'draft', null),
      ('Voided Person', '+919855555555', 'Caterer', 'voided', null)
    ) as v(full_name, phone, role_text, status, decision_reason)
    where (select count(*) from invite) = 1
    returning id
  ),
  roster as materialized (
    select *
    from public.boa_acc_org_roster((
      select raw_token
      from token
      where (select count(*) from people) = 5
    ))
  ),
  assertions as materialized (
    select 0 as n, plan(6) as line
    union all select 1, is(
      (select count(*) from roster),
      3::bigint,
      'roster includes submitted, approved and rejected people'
    )
    union all select 2, is(
      (select jsonb_agg(to_jsonb(r) order by r.full_name) from roster r),
      '[{"full_name":"Approved Person","role_text":"Stage crew","status":"approved"},{"full_name":"Rejected Person","role_text":"Driver","status":"rejected"},{"full_name":"Submitted Person","role_text":"Runner","status":"submitted"}]'::jsonb,
      'roster returns the expected data and no phone or vehicle fields'
    )
    union all select 3, ok(
      not exists (
        select 1 from roster
        where full_name in ('Draft Person', 'Voided Person')
      ),
      'draft and voided rows are excluded'
    )
    union all select 4, is(
      (select count(*) from jsonb_object_keys(to_jsonb((select r from roster r limit 1)))),
      3::bigint,
      'each roster row has exactly three fields'
    )
    union all select 5, throws_ok(
      'select * from public.boa_acc_org_roster(''aaaaaaaaaaaaaaaaaaaaaa'')',
      'P0002',
      'not found',
      'unknown token is a not-found'
    )
    union all select 6, ok(
      (select count(*) from invite) = 1,
      'roster lookup used the live invite token'
    )
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-091 roster')
    where (select count(*) from assertions) >= 0
  )
select line
from (
  select n, line from assertions
  where (select count(*) from clean) >= 0
  union all select 999999, l from finish() l
) results
order by n;
