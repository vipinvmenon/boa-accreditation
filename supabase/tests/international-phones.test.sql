-- ACC-195 · Phone numbers from any country.
--
-- @proves: HIGH | the database accepts an international E.164 number for a person, an org contact and an AAA nominee
-- @proves: HIGH | a +91 number must still be an Indian mobile: a mistyped one is refused, as before
-- @proves: HIGH | a number that is not E.164 (leading zero, too short) is refused
-- @proves: HIGH | boa_acc_pass_send_unsent lists Indian people only; international people are sent by hand
--
-- One statement, like the other suites. Everything is done through the
-- functions (never a second CTE reading a row an earlier CTE just inserted), and
-- the throwaway org, people, nominee and operator are wiped at the end.

with
  wiped as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(array['+971501959001', '+971501959002'])
  ),
  wiped_org as materialized (
    select private.boa_acc_wipe_org('ACC-195 Org')
     where (select count(*) from wiped) >= 0
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc195-intl@invalid.test')
     where (select count(*) from wiped_org) >= 0
  ),
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc195-intl@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from wiped_email
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'admin', 'ACC-195 Admin' from usr
    returning user_id
  ),
  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),
  org as materialized (
    select public.boa_acc_create_org('ACC-195 Org', 'crew', 10, 'Intl Contact', '+971501959001') as id
     where (select claims from jwt) is not null
  ),
  imp as materialized (
    select r.*
      from public.boa_acc_import_approve(
        (select id from org),
        jsonb_build_array(
          jsonb_build_object('row_no', 2, 'full_name', 'ACC195 Intl Person', 'phone', '+971501959002',
            'role_text', 'Test', 'vehicle_reg', null, 'type_code', 'crew', 'day_validity', 'show',
            'submitted_at', '2026-09-29T10:00:00+05:30'),
          jsonb_build_object('row_no', 3, 'full_name', 'ACC195 Indian Person', 'phone', '+919899195003',
            'role_text', 'Test', 'vehicle_reg', null, 'type_code', 'crew', 'day_validity', 'show',
            'submitted_at', '2026-09-29T10:00:00+05:30'),
          jsonb_build_object('row_no', 4, 'full_name', 'ACC195 Bad India', 'phone', '+915876543210',
            'role_text', 'Test', 'vehicle_reg', null, 'type_code', 'crew', 'day_validity', 'show',
            'submitted_at', '2026-09-29T10:00:00+05:30'),
          jsonb_build_object('row_no', 5, 'full_name', 'ACC195 Leading Zero', 'phone', '+0501959005',
            'role_text', 'Test', 'vehicle_reg', null, 'type_code', 'crew', 'day_validity', 'show',
            'submitted_at', '2026-09-29T10:00:00+05:30')
        )
      ) r
  ),
  unsent as materialized (
    select public.boa_acc_pass_send_unsent() as ids
     where (select count(*) from imp) = 4
  ),
  nominee as materialized (
    select public.boa_acc_nominate_aaa('ACC-195 Nominee', '+971501959001', 'ACC-195 Org') as row
     where (select count(*) from unsent) = 1
  ),
  results as (
    select 1 as n, ok((select id is not null from org), 'an org contact may be an international number') as line
    union all select 2, is((select outcome from imp where row_no = 2), 'approved', 'an international person is imported and approved')
    union all select 3, is((select outcome from imp where row_no = 3), 'approved', 'an Indian person is still imported and approved')
    union all select 4, is((select outcome from imp where row_no = 4), 'invalid', 'a +91 number that is not an Indian mobile is refused')
    union all select 5, is((select outcome from imp where row_no = 5), 'invalid', 'a number with a leading zero after + is refused')
    union all select 6, ok((select (row).phone = '+971501959001' from nominee), 'an AAA nominee may be an international number')
    union all select 7, ok(
      (select ids from unsent) @> array[(select person_id from imp where row_no = 3)],
      'the unsent list includes the Indian person')
    union all select 8, ok(
      not ((select ids from unsent) @> array[(select person_id from imp where row_no = 2)]),
      'the unsent list leaves out the international person (sent by hand)')
    union all select 9, throws_ok(
      $$select public.boa_acc_nominate_aaa('Bad Nominee', '+915876543210', null)$$,
      'P0001', 'invalid nomination', 'a nominee with a +91 non-mobile is refused')
    union all select 10, throws_ok(
      $$select public.boa_acc_nominate_aaa('Short Nominee', '+97150', null)$$,
      'P0001', 'invalid nomination', 'a nominee with too few digits is refused')
    union all select 11, throws_ok(
      $$insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
        values ('ACC-195 Bad Org', 'crew', 1, 'Bad Contact', '+915876543210')$$,
      '23514', null, 'the org contact check still refuses a +91 non-mobile')
  ),
  cleaned_org as materialized (
    select private.boa_acc_wipe_org('ACC-195 Org')
     where (select count(*) from results) = 11
  ),
  cleaned_nomination as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(array['+971501959001', '+971501959002'])
     where (select count(*) from cleaned_org) >= 0
  ),
  cleaned_email as materialized (
    select private.boa_acc_wipe_email('acc195-intl@invalid.test')
     where (select count(*) from cleaned_nomination) >= 0
  )
select plan(11)
union all select line from results
 where (select count(*) from cleaned_email) >= 0
union all select finish();
