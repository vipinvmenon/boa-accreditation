-- ACC-197 · The crew T-shirt: set by the import, shown to the gate, never to the holder.
--
-- @proves: CRITICAL | boa_acc_pass_view (the holder's page) never carries the T-shirt, even for a person who has one
-- @proves: HIGH     | boa_acc_import_approve stores tshirt_size, and a row with an unknown size is invalid (nothing written)
-- @proves: HIGH     | a T-shirt set or removed later applies to a person who is ALREADY approved, while their pass_token is unchanged
-- @proves: HIGH     | boa_acc_gate_pull carries tshirtSize for the offline roster: the size, or null
--
-- ONE statement, cleanup in the same statement (the shape of import-approve.test.sql).
-- Table-grant coverage for anon lives in privileges.test.sql.

with
  wiped as materialized (
    select private.boa_acc_wipe_org(n) from (values ('ACC-197 merch')) v(n)
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc197-lead@invalid.test')
     where (select count(*) from wiped) >= 0
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-197 merch', 'vendor', 10, 'Merch Contact', '+919877197001'
     where (select count(*) from wiped_email) >= 0
    returning id
  ),
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc197-lead@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from org
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-197 Lead' from usr
    returning user_id
  ),
  sheet1 as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2, 'full_name', 'Gate Person', 'phone', '+919197000002', 'role_text', 'Security', 'type_code', 'crew', 'day_validity', 'show', 'tshirt_size', 'L'),
      jsonb_build_object('row_no', 3, 'full_name', 'Plain Person', 'phone', '+919197000003', 'role_text', 'Security', 'type_code', 'crew', 'day_validity', 'show'),
      jsonb_build_object('row_no', 4, 'full_name', 'Bad Size',     'phone', '+919197000004', 'role_text', 'Security', 'type_code', 'crew', 'day_validity', 'show', 'tshirt_size', '4XL')
    ) as j
  ),
  -- Later export: row 2's size changes, row 3 gets a shirt. Tiers unchanged.
  sheet2 as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2, 'full_name', 'Gate Person', 'phone', '+919197000002', 'role_text', 'Security', 'type_code', 'crew', 'day_validity', 'show', 'tshirt_size', 'XL'),
      jsonb_build_object('row_no', 3, 'full_name', 'Plain Person', 'phone', '+919197000003', 'role_text', 'Security', 'type_code', 'crew', 'day_validity', 'show', 'tshirt_size', 'M')
    ) as j
  ),
  -- Later still: the shirt is taken off row 2.
  sheet3 as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2, 'full_name', 'Gate Person', 'phone', '+919197000002', 'role_text', 'Security', 'type_code', 'crew', 'day_validity', 'show')
    ) as j
  ),
  jwt as materialized (
    select set_config('request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text, true) as claims
  ),
  call1 as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_approve((select id from org), (select j from sheet1)) r
     where (select claims from jwt) is not null
  ),
  reads1 as materialized (
    select c.row_no, private.boa_acc_test_read_person(c.person_id) as r
      from call1 c where c.person_id is not null
  ),
  pull1 as materialized (
    select public.boa_acc_gate_pull() as p
     where (select count(*) from reads1) = 2
  ),
  view1 as materialized (
    select public.boa_acc_pass_view((r).pass_token) as v
      from reads1 where row_no = 2
       and (select count(*) from pull1) = 1
  ),
  call2 as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_approve((select id from org), (select j from sheet2)) r
     where (select count(*) from view1) = 1
  ),
  reads2 as materialized (
    select c.row_no, private.boa_acc_test_read_person(c.person_id) as r
      from call2 c
  ),
  pull2 as materialized (
    select public.boa_acc_gate_pull() as p
     where (select count(*) from reads2) = 2
  ),
  call3 as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_approve((select id from org), (select j from sheet3)) r
     where (select count(*) from pull2) = 1
  ),
  reads3 as materialized (
    select c.row_no, private.boa_acc_test_read_person(c.person_id) as r
      from call3 c
  ),
  results as materialized (
    select 0 as n, plan(11) as line

    union all select 1, is(
      (select array_agg(outcome order by row_no) from call1),
      array['approved','approved','invalid'],
      'first run: two approved, the unknown size is invalid')
    union all select 2, ok(
      (select detail ~ 'tshirt_size' and person_id is null from call1 where row_no = 4),
      'a 4XL row is refused by the database and nothing is written for it')
    union all select 3, ok(
      (select (r).tshirt_size = 'L' from reads1 where row_no = 2),
      'a sheet shirt is stored on the person')
    union all select 4, ok(
      (select (r).tshirt_size is null from reads1 where row_no = 3),
      'no shirt in the sheet stores null')
    union all select 5, ok(
      (select (p -> 'roster') @> jsonb_build_array(jsonb_build_object(
                'personId', (select (r).id from reads1 where row_no = 2), 'tshirtSize', 'L'))
         from pull1),
      'the gate pull carries tshirtSize for the person who has a shirt')
    union all select 6, ok(
      (select (p -> 'roster') @> jsonb_build_array(jsonb_build_object(
                'personId', (select (r).id from reads1 where row_no = 3), 'tshirtSize', null))
         from pull1),
      'the gate pull carries null for the person who has none')
    union all select 7, ok(
      (select v is not null and not (v ? 'tshirtSize') and not (v ? 'tshirt_size') and v::text !~* 'shirt'
         from view1),
      'the holder''s pass view carries no trace of the T-shirt, though this person has one')
    union all select 8, ok(
      (select (select count(*) from call2 where outcome = 'unchanged') = 2
          and (select (r).tshirt_size from reads2 where row_no = 2) = 'XL'
          and (select (r).tshirt_size from reads2 where row_no = 3) = 'M'),
      'a later size change and a later new shirt both apply to already-approved people')
    union all select 9, ok(
      (select (r2.r).pass_token = (r1.r).pass_token and (r2.r).status = 'approved'
         from reads1 r1 join reads2 r2 using (row_no) where row_no = 2),
      'applying the T-shirt leaves the approval and the pass_token untouched')
    union all select 10, ok(
      (select (p -> 'roster') @> jsonb_build_array(jsonb_build_object(
                'personId', (select (r).id from reads1 where row_no = 3), 'tshirtSize', 'M'))
         from pull2),
      'the next gate pull carries the changed shirt')
    union all select 11, ok(
      (select (r).tshirt_size is null and (r).status = 'approved' from reads3 where row_no = 2),
      'a shirt removed in the sheet is removed from an approved person')
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n) from (values ('ACC-197 merch')) v(n)
     where (select count(*) from kept) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email('acc197-lead@invalid.test')
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
