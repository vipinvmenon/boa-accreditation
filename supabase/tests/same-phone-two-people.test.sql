-- ADR-032 · two people may share one phone inside one organisation.
--
-- @proves: HIGH     | the same phone under two different names imports as two people, each approved with their own pass
-- @proves: HIGH     | the same phone AND the same name (case and spacing aside) is still one person: a repeat is duplicate_phone, and a re-run is unchanged
-- @proves: CRITICAL | the database refuses a second live row with the same org, phone and name (the unique index holds)
-- @proves: HIGH     | boa_acc_import_roster loads two names on one phone and still refuses the repeat
--
-- ONE statement, cleanup in the same statement: the shape of
-- import-approve.test.sql.

with
  wiped as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ADR-032 import'), ('ADR-032 roster')) v(n)
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('adr032-lead@invalid.test')
     where (select count(*) from wiped) >= 0
  ),

  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ADR-032 import', 'vendor', 10, 'Shared Phone Contact', '+919877032001'
     where (select count(*) from wiped_email) >= 0
    returning id
  ),
  org_roster as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ADR-032 roster', 'vendor', 10, 'Shared Phone Roster', '+919877032002'
      from org
    returning id
  ),
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'adr032-lead@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select id from org_roster) is not null
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead'::public.boa_acc_operator_role, 'ADR-032 lead' from usr
    returning user_id
  ),

  sheet as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2, 'full_name', 'Patrick Shared',     'phone', '+919141032001', 'role_text', 'Operation', 'type_code', 'crew', 'day_validity', 'build_show'),
      jsonb_build_object('row_no', 3, 'full_name', 'Abhishek Shared',    'phone', '+919141032001', 'role_text', 'Truss',     'type_code', 'crew', 'day_validity', 'build_show'),
      jsonb_build_object('row_no', 4, 'full_name', ' patrick   SHARED ', 'phone', '+919141032001', 'role_text', 'Operation', 'type_code', 'crew', 'day_validity', 'build_show')
    ) as j
  ),
  roster as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2, 'full_name', 'Roster One', 'phone', '+919141032002', 'role_text', 'Crew', 'requested_day_validity', 'show'),
      jsonb_build_object('row_no', 3, 'full_name', 'Roster Two', 'phone', '+919141032002', 'role_text', 'Crew', 'requested_day_validity', 'show'),
      jsonb_build_object('row_no', 4, 'full_name', 'roster one', 'phone', '+919141032002', 'role_text', 'Crew', 'requested_day_validity', 'show')
    ) as j
  ),

  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),
  call1 as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_approve((select id from org), (select j from sheet)) r
     where (select claims from jwt) is not null
  ),
  reads1 as materialized (
    select c.row_no, private.boa_acc_test_read_person(c.person_id) as r
      from call1 c
     where c.person_id is not null
  ),
  call2 as materialized (
    select r.row_no, r.outcome, r.person_id
      from public.boa_acc_import_approve((select id from org), (select j from sheet)) r
     where (select count(*) from reads1) > 0
  ),
  roster1 as materialized (
    select r.row_no, r.outcome, r.person_id
      from public.boa_acc_import_roster((select id from org_roster), (select j from roster)) r
     where (select count(*) from call2) = 3
  ),
  dup_insert as materialized (
    select throws_ok(
      format($q$insert into public.boa_acc_person (org_id, full_name, phone, role_text, status, submitted_at)
                values (%L, 'ABHISHEK  shared', '+919141032001', 'Truss', 'submitted', now())$q$, (select id from org)),
      '23505',
      null,
      'a second live row with the same org, phone and name is refused by the index'
    ) as line
     where (select count(*) from roster1) = 3
  ),

  results as materialized (
    select 0 as n, plan(8) as line
    union all select 1, is(
      (select array_agg(outcome order by row_no) from call1),
      array['approved','approved','duplicate_phone'],
      'two names on one phone are both approved; the repeat of the first is duplicate_phone')
    union all select 2, ok(
      (select count(distinct (r).id) = 2 and count(distinct (r).phone) = 1
              and count(distinct (r).pass_token) = 2 and bool_and((r).pass_token is not null)
         from reads1),
      'two people, one phone, two different pass tokens')
    union all select 3, ok(
      (select detail ~ 'row 2' from call1 where row_no = 4),
      'the repeat names the first row')
    union all select 4, is(
      (select array_agg(outcome order by row_no) from call2),
      array['unchanged','unchanged','duplicate_phone'],
      're-running the same sheet changes nothing')
    union all select 5, is(
      (select array_agg(person_id order by row_no) from call2 where outcome = 'unchanged'),
      (select array_agg(person_id order by row_no) from call1 where outcome = 'approved'),
      're-running finds the same two people, not new ones')
    union all select 6, is(
      (select array_agg(outcome order by row_no) from roster1),
      array['inserted','inserted','duplicate_phone'],
      'import_roster loads two names on one phone and refuses the repeat')
    union all select 7, ok(
      (select count(*) = 2 from reads1 where (r).phone = '+919141032001'),
      'exactly two live people hold the phone')
    union all select 8, (select line from dup_insert)
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ADR-032 import'), ('ADR-032 roster')) v(n)
     where (select count(*) from results) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email('adr032-lead@invalid.test')
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from results
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
