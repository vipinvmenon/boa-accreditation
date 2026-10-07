-- ACC-141 · boa_acc_import_approve — column I is the approval.
--
-- @proves: CRITICAL | a filled Accreditation Type approves on import: type_code, day_validity, pass_token and pass_ref set in the database
-- @proves: CRITICAL | a blank Accreditation Type imports as submitted with NO pass_token, pass_ref, type_code or day_validity (non-negotiable #5)
-- @proves: CRITICAL | AAA from the sheet is approved THROUGH the nomination guard: the nomination is recorded (or an unapproved one approved) and stamped, never bypassed
-- @proves: CRITICAL | a changed tier/days (or a cleared cell) on an already-approved person is reported as tier_changed and NOT applied; the pass_token is unchanged
-- @proves: CRITICAL | an approver and a caller with no session are refused (42501): importing is lead/admin work
-- @proves: HIGH     | re-running the same rows is a no-op (unchanged), and a later run approves only the newly decided row
-- @proves: CRITICAL | AAA whose nomination is already stamped to someone else is still refused by decide_one (the guard is live, not bypassed)
-- @proves: HIGH     | Artist from the sheet is approved as artist
-- @proves: HIGH     | a phone repeated in one call, or live on another org, is refused as duplicate_phone; a missing day is invalid
-- @proves: HIGH     | general_admission from the sheet is approved with a pass (named GA guests, 7 Oct)
--
-- ONE statement, cleanup in the same statement — the shape of
-- import-roster.test.sql and decide.test.sql. Every JWT-dependent call is its
-- own gated top-level CTE; every read of a row the RPC wrote goes through a
-- VOLATILE function (private.boa_acc_test_read_person, or
-- boa_acc_list_aaa_nominations as the lead), because a bare select shares
-- this statement's one snapshot and cannot see them.
--
-- Nominations reference people, so they are wiped BEFORE the orgs.

with
  wiped_aaa as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(
      array['+919141000004', '+919141000009', '+919141000011'])
  ),
  wiped as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-141 import'), ('ACC-141 other')) v(n)
     where (select count(*) from wiped_aaa) >= 0
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email(e)
      from (values ('acc141-lead@invalid.test'), ('acc141-approver@invalid.test')) v(e)
     where (select count(*) from wiped) >= 0
  ),

  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-141 import', 'vendor', 1, 'Import Approve Contact', '+919877141001'
     where (select count(*) from wiped_email) >= 0
    returning id
  ),
  -- quota 1 on purpose: ACC-140g, no quota. Five people are approved below.
  org_other as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-141 other', 'vendor', 10, 'Other Org Contact', '+919877141002'
      from org
    returning id
  ),
  other_person as (
    insert into public.boa_acc_person (org_id, full_name, phone, role_text, status, submitted_at)
    select id, 'Elsewhere Person', '+919141000010', 'Security', 'submitted', '2026-09-21T10:00:00+05:30'
      from org_other
    returning id
  ),
  -- An unapproved nomination already on file for row 9's phone.
  nom_pending as (
    insert into public.boa_acc_aaa_nomination (full_name, phone)
    select 'Pending Nominee', '+919141000009'
     where (select id from other_person) is not null
    returning id
  ),
  -- An approved nomination for row 11's phone, already STAMPED to someone
  -- else: the guard in decide_one must still refuse.
  nom_stamped as (
    insert into public.boa_acc_aaa_nomination (full_name, phone, approved, approved_at, person_id)
    select 'Stamped Nominee', '+919141000011', true, clock_timestamp(), (select id from other_person)
     where (select id from nom_pending) is not null
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
      from (values ('acc141-lead@invalid.test'), ('acc141-approver@invalid.test')) v(e)
     where (select id from nom_stamped) is not null
    returning id, email
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id,
           (case when email like 'acc141-lead%' then 'lead' else 'approver' end)::public.boa_acc_operator_role,
           'ACC-141 ' || email
      from usr
    returning user_id, role
  ),
  lead_op as materialized (
    select user_id from op where role = 'lead'
  ),

  -- The sheet, first export. row_no is the sheet's own row number.
  sheet1 as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2,  'full_name', 'Stage Person',  'phone', '+919141000002', 'role_text', 'Rigger',   'type_code', 'stage',  'day_validity', 'build', 'submitted_at', '2026-09-21T10:00:00+05:30'),
      jsonb_build_object('row_no', 3,  'full_name', 'Blank Person',  'phone', '+919141000003', 'role_text', 'Security', 'type_code', null,     'day_validity', 'show'),
      jsonb_build_object('row_no', 4,  'full_name', 'Aaa Person',    'phone', '+919141000004', 'role_text', 'Director', 'type_code', 'aaa',    'day_validity', 'build_show'),
      jsonb_build_object('row_no', 5,  'full_name', 'Artist Person', 'phone', '+919141000005', 'role_text', 'Guitar',   'type_code', 'artist', 'day_validity', 'show'),
      jsonb_build_object('row_no', 6,  'full_name', 'Blank Again',   'phone', '+919141000003', 'role_text', 'Security', 'type_code', 'crew',   'day_validity', 'show'),
      jsonb_build_object('row_no', 7,  'full_name', 'Ticket Person', 'phone', '+919141000007', 'role_text', 'Guest',    'type_code', 'general_admission', 'day_validity', 'show'),
      jsonb_build_object('row_no', 8,  'full_name', 'No Days',       'phone', '+919141000008', 'role_text', 'Crew',     'type_code', 'crew'),
      jsonb_build_object('row_no', 9,  'full_name', 'Pending Aaa',   'phone', '+919141000009', 'role_text', 'Manager',  'type_code', 'aaa',    'day_validity', 'build_show'),
      jsonb_build_object('row_no', 10, 'full_name', 'Two Orgs',      'phone', '+919141000010', 'role_text', 'Security', 'type_code', 'crew',   'day_validity', 'show'),
      jsonb_build_object('row_no', 11, 'full_name', 'Stamped Aaa',   'phone', '+919141000011', 'role_text', 'Producer', 'type_code', 'aaa',    'day_validity', 'show')
    ) as j
  ),
  -- The sheet, a later export: Salman decided row 3, changed rows 2 and 4,
  -- and cleared row 5.
  sheet3 as (
    select jsonb_build_array(
      jsonb_build_object('row_no', 2, 'full_name', 'Stage Person',  'phone', '+919141000002', 'role_text', 'Rigger',   'type_code', 'photo',  'day_validity', 'build'),
      jsonb_build_object('row_no', 3, 'full_name', 'Blank Person',  'phone', '+919141000003', 'role_text', 'Security', 'type_code', 'crew',   'day_validity', 'show'),
      jsonb_build_object('row_no', 4, 'full_name', 'Aaa Person',    'phone', '+919141000004', 'role_text', 'Director', 'type_code', 'aaa',    'day_validity', 'show'),
      jsonb_build_object('row_no', 5, 'full_name', 'Artist Person', 'phone', '+919141000005', 'role_text', 'Guitar',   'type_code', null,     'day_validity', 'show'),
      jsonb_build_object('row_no', 9, 'full_name', 'Pending Aaa',   'phone', '+919141000009', 'role_text', 'Manager',  'type_code', 'aaa',    'day_validity', 'build_show')
    ) as j
  ),

  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from lead_op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),

  call1 as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_approve((select id from org), (select j from sheet1)) r
     where (select claims from jwt) is not null
  ),
  reads1 as materialized (
    select c.row_no, private.boa_acc_test_read_person(c.person_id) as r
      from call1 c
     where c.person_id is not null
  ),

  call2 as materialized (
    select r.row_no, r.outcome, r.person_id
      from public.boa_acc_import_approve((select id from org), (select j from sheet1)) r
     where (select count(*) from reads1) > 0
  ),

  call3 as materialized (
    select r.row_no, r.outcome, r.person_id, r.detail
      from public.boa_acc_import_approve((select id from org), (select j from sheet3)) r
     where (select count(*) from call2) = 10
  ),
  reads3 as materialized (
    select c.row_no, private.boa_acc_test_read_person(c.person_id) as r
      from call3 c
     where c.person_id is not null
  ),
  noms as materialized (
    select n.phone, n.approved, n.approved_by, n.nominated_by, n.person_id
      from public.boa_acc_list_aaa_nominations() n
     where (select count(*) from reads3) = 5
       and n.phone in ('+919141000004', '+919141000009')
  ),
  other_read as materialized (
    select private.boa_acc_test_read_person((select id from other_person)) as r
     where (select count(*) from noms) >= 0
  ),

  jwt_approver as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op where role = 'approver')::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select count(*) from other_read) = 1
  ),
  approver_attempt as materialized (
    select throws_ok(
      format('select row_no from public.boa_acc_import_approve(%L, %L::jsonb)', (select id from org), '[]'),
      '42501',
      'not authorized',
      'an approver cannot import-and-approve'
    ) as line
     where (select claims from jwt_approver) is not null
  ),
  jwt_cleared as materialized (
    select set_config('request.jwt.claims', '', true) as claims
     where (select line from approver_attempt) is not null
  ),
  non_operator_attempt as materialized (
    select throws_ok(
      format('select row_no from public.boa_acc_import_approve(%L, %L::jsonb)', (select id from org), '[]'),
      '42501',
      'not authorized',
      'no operator session cannot import-and-approve'
    ) as line
     where (select claims from jwt_cleared) is not null
  ),

  results as materialized (
    select 0 as n, plan(26) as line

    -- First run
    union all select 1, is(
      (select array_agg(outcome order by row_no) from call1),
      array['approved','inserted','approved','approved','duplicate_phone',
            'approved','invalid','approved','duplicate_phone','refused'],
      'first run: decided rows approved, the blank row inserted, duplicates and bad rows refused per row')
    union all select 2, ok(
      (select (r).status = 'approved' and (r).type_code = 'stage' and (r).day_validity = 'build'
              and (r).pass_token is not null and (r).pass_ref ~ '^BOA26-[0-9]{4,}$'
              and (r).approved_by = (select user_id from lead_op)
         from reads1 where row_no = 2),
      'column I "Stage" + Build days → approved stage/build with a pass minted in the database, approved_by the lead')
    union all select 3, ok(
      (select (r).status = 'submitted' and (r).pass_token is null and (r).pass_ref is null
              and (r).type_code is null and (r).day_validity is null
              and (r).requested_day_validity = 'show'
         from reads1 where row_no = 3),
      'blank column I → submitted, no pass_token, pass_ref, type_code or day_validity; days kept as a hint')
    union all select 4, ok(
      (select (r).status = 'approved' and (r).type_code = 'aaa' and (r).day_validity = 'build_show' and (r).pass_token is not null
         from reads1 where row_no = 4),
      'column I "AAA" → approved as aaa')
    union all select 5, ok(
      (select (r).status = 'approved' and (r).type_code = 'artist' and (r).pass_token is not null
         from reads1 where row_no = 5),
      'column I "Artist" → approved as artist')
    union all select 6, ok(
      (select (r).status = 'approved' and (r).type_code = 'aaa' from reads1 where row_no = 9),
      'AAA for a phone with an unapproved nomination on file → approved')
    union all select 7, ok(
      (select detail ~ 'row 3' from call1 where row_no = 6),
      'a phone repeated in one sheet is refused, naming the first row')
    union all select 8, ok(
      (select detail ~ 'another organisation' and person_id is null from call1 where row_no = 10),
      'a phone live on another org is refused, and nothing is written for it')
    union all select 9, ok(
      (select (r).status = 'approved' and (r).type_code = 'general_admission' and (r).day_validity = 'show'
              and (r).pass_token is not null
         from reads1 where row_no = 7),
      'column I "General Admission" → approved as general_admission with a pass')
    union all select 10, ok(
      (select detail ~ 'day_validity' from call1 where row_no = 8),
      'a row with no days is refused')

    -- The nomination guard, satisfied not bypassed
    union all select 11, ok(
      (select approved and approved_by = (select user_id from lead_op) and nominated_by = (select user_id from lead_op)
              and person_id = (select person_id from call1 where row_no = 4)
         from noms where phone = '+919141000004'),
      'AAA with no nomination: the import recorded one (by the lead, approved) and decide_one stamped it')
    union all select 12, ok(
      (select approved and approved_by = (select user_id from lead_op)
              and person_id = (select person_id from call1 where row_no = 9)
         from noms where phone = '+919141000009'),
      'AAA with an unapproved nomination: the import approved it and decide_one stamped it')
    union all select 13, is(
      (select count(*)::integer from noms), 2,
      'three runs over two AAA rows leave exactly two nominations')

    -- Re-run
    union all select 14, is(
      (select array_agg(outcome order by row_no) from call2),
      array['unchanged','unchanged','unchanged','unchanged','duplicate_phone',
            'unchanged','invalid','unchanged','duplicate_phone','refused'],
      're-running the same sheet changes nothing')
    union all select 15, is(
      (select array_agg(person_id order by row_no) from call2 where outcome = 'unchanged'),
      (select array_agg(person_id order by row_no) from call1 where row_no in (2, 3, 4, 5, 7, 9)),
      'a re-run matches the same people by phone, never a second row')

    -- A later export: one newly decided row, three changes
    union all select 16, is(
      (select array_agg(outcome order by row_no) from call3),
      array['tier_changed','approved','tier_changed','tier_changed','unchanged'],
      'later run: the newly decided row is approved; changed and cleared decisions are reported')
    union all select 17, ok(
      (select (r).status = 'approved' and (r).type_code = 'crew' and (r).day_validity = 'show' and (r).pass_token is not null
         from reads3 where row_no = 3),
      'the row decided since the last run is approved now')
    union all select 18, ok(
      (select (r3.r).type_code = 'stage' and (r3.r).pass_token = (r1.r).pass_token and (r3.r).pass_ref = (r1.r).pass_ref
         from reads3 r3 join reads1 r1 using (row_no) where row_no = 2),
      'stage → photo is NOT applied: still stage, same pass_token and pass_ref')
    union all select 19, ok(
      (select detail ~ 'stage/build' and detail ~ 'photo/build' and detail ~ 'not applied' from call3 where row_no = 2),
      'the change is reported with the old and new decision')
    union all select 20, ok(
      (select (r).day_validity = 'build_show' from reads3 where row_no = 4),
      'a changed days answer on an approved person is not applied')
    union all select 21, ok(
      (select (r).type_code = 'artist' and (r).status = 'approved' from reads3 where row_no = 5)
      and (select detail ~ 'blank' from call3 where row_no = 5),
      'a cleared cell on an approved person is reported, and the person stays approved')
    union all select 22, ok(
      (select (r).status = 'submitted' and (r).pass_token is null from other_read),
      'the other org''s person is untouched')

    union all select 23, (select line from approver_attempt)
    union all select 24, (select line from non_operator_attempt)

    -- The guard is still live: a nomination stamped to someone else
    union all select 25, ok(
      (select detail ~ 'imported as submitted' and detail ~ 'aaa_not_nominated' from call1 where row_no = 11),
      'AAA whose nomination is already stamped to another person: approval refused by decide_one''s guard')
    union all select 26, ok(
      (select (r).status = 'submitted' and (r).pass_token is null and (r).type_code is null from reads1 where row_no = 11),
      'the refused AAA row is imported as submitted with no pass')
  ),
  kept as materialized (
    select n, line from results
  ),
  clean_aaa as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(
      array['+919141000004', '+919141000009', '+919141000011'])
     where (select count(*) from kept) >= 0
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-141 import'), ('ACC-141 other')) v(n)
     where (select count(*) from clean_aaa) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email(e)
      from (values ('acc141-lead@invalid.test'), ('acc141-approver@invalid.test')) v(e)
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
