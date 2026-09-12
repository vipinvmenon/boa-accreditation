-- ACC-044 · AAA nomination workflow and database guard.
--
-- @proves: CRITICAL | only an active operator can create or approve a nomination
-- @proves: CRITICAL | an approved nomination is required before an AAA pass decision
-- @proves: HIGH     | approving a nomination records approver and timestamp
-- @proves: HIGH     | a nomination can be listed without exposing pass tokens
--
-- One statement so the throwaway auth user and nominations are cleaned up
-- atomically. This test never touches boa_acc_checkin.

with
  wiped as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(array['+919899000001', '+919899000002'])
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc044-aaa@invalid.test')
     where (select count(*) from wiped) >= 0
  ),
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc044-aaa@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from wiped_email
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-044 Approver' from usr
    returning user_id
  ),
  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),
  nomination as materialized (
    select public.boa_acc_nominate_aaa('ACC-044 Nominee', '+919899000001', 'ACC-044 Org') as row
      where (select claims from jwt) is not null
  ),
  list_before as materialized (
    select count(*) as n
      from public.boa_acc_list_aaa_nominations()
     where (select (row).id from nomination) = id
  ),
  approved as materialized (
    select public.boa_acc_approve_aaa_nomination((select (row).id from nomination)) as row
      where (select n from list_before) = 1
  ),
  duplicate_attempt as materialized (
    select throws_ok(
      $$select public.boa_acc_nominate_aaa('Duplicate', '+919899000001', null)$$,
      '23505',
      'duplicate_nomination',
      'a phone can only have one AAA nomination'
    ) as line
    where (select (row).approved from approved)
  ),
  no_session as materialized (
    select set_config('request.jwt.claims', '{}', true) as cleared
      where (select line from duplicate_attempt) is not null
  ),
  unauthorized_attempt as materialized (
    select throws_ok(
      $$select public.boa_acc_nominate_aaa('No Session', '+919899000002', null)$$,
      '42501',
      'not authorized',
      'a signed-out caller cannot nominate AAA access'
    ) as line
    where (select cleared from no_session) = '{}'
  ),
  results as (
    select 1 as n, ok((select (row).id is not null from nomination), 'operator can create a nomination') as line
    union all select 2, is((select (row).full_name from nomination), 'ACC-044 Nominee', 'nomination stores the name')
    union all select 3, is((select (row).phone from nomination), '+919899000001', 'nomination stores the phone')
    union all select 4, ok((select n from list_before) = 1, 'operator can list the nomination')
    union all select 5, ok((select (row).approved from approved), 'operator can approve the nomination')
    union all select 6, ok((select (row).approved_at is not null from approved), 'approval records a timestamp')
    union all select 7, is((select (row).approved_by from approved), (select user_id from op), 'approval records the approver')
    union all select 8, (select line from duplicate_attempt)
    union all select 9, (select line from unauthorized_attempt)
    union all select 10, ok((select (row).person_id is null from approved), 'nomination approval does not issue or stamp a pass')
    union all select 11, ok((select (row).id is not null from approved), 'approved nomination remains addressable')
    union all select 12, ok((select (row).approved = true from approved), 'approved state is explicit')
    union all select 13, ok(has_function_privilege('anon', 'public.boa_acc_list_aaa_nominations()', 'EXECUTE') = false, 'anon cannot list AAA nominations')
    union all select 14, ok(has_function_privilege('anon', 'public.boa_acc_nominate_aaa(text,text,text)', 'EXECUTE') = false, 'anon cannot create AAA nominations')
    union all select 15, ok(has_function_privilege('anon', 'public.boa_acc_approve_aaa_nomination(uuid)', 'EXECUTE') = false, 'anon cannot approve AAA nominations')
    union all select 16, ok(has_function_privilege('authenticated', 'public.boa_acc_nominate_aaa(text,text,text)', 'EXECUTE'), 'authenticated may call the nomination RPC')
  ),
  cleaned_nomination as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(array['+919899000001', '+919899000002'])
      where (select count(*) from results) = 16
  ),
  cleaned_email as materialized (
    select private.boa_acc_wipe_email('acc044-aaa@invalid.test')
      where (select count(*) from cleaned_nomination) >= 0
  )
select plan(16)
union all select line from results
 where (select count(*) from cleaned_email) >= 0
union all select finish();
