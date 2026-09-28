-- ACC-187 · boa_acc_set_operator_role.
--
-- @proves: CRITICAL | a lead can change another operator's role
-- @proves: CRITICAL | a caller cannot change their own role
-- @proves: CRITICAL | the last active admin cannot be moved off admin
-- @proves: CRITICAL | an approver cannot call this function
-- @proves: CRITICAL | an issuer cannot call this function
-- @proves: CRITICAL | a signed-out caller cannot call this function
-- @proves: HIGH     | an unknown operator id is refused
--
-- ONE statement. Real active admins are set inactive for this statement
-- only, through private.boa_acc_test_force_operator_active, then restored
-- before the statement ends. A single statement is atomic: a raised error
-- rolls the real rows back.

with
  real_active_admins as materialized (
    select array_agg(user_id) as ids
      from public.boa_acc_operator
     where role = 'admin' and active
  ),
  neutralize_real_admins as materialized (
    select id as user_id
      from private.boa_acc_test_force_operator_active((select ids from real_active_admins), false) as id
  ),
  wiped_lead as materialized (
    select private.boa_acc_wipe_email('acc187-lead@invalid.test')
     where (select count(*) from neutralize_real_admins) >= 0
  ),
  wiped_admin as materialized (
    select private.boa_acc_wipe_email('acc187-admin@invalid.test')
     where (select count(*) from wiped_lead) >= 0
  ),
  wiped_target as materialized (
    select private.boa_acc_wipe_email('acc187-target@invalid.test')
     where (select count(*) from wiped_admin) >= 0
  ),
  wiped_approver as materialized (
    select private.boa_acc_wipe_email('acc187-approver@invalid.test')
     where (select count(*) from wiped_target) >= 0
  ),
  wiped_issuer as materialized (
    select private.boa_acc_wipe_email('acc187-issuer@invalid.test')
     where (select count(*) from wiped_approver) >= 0
  ),
  usr_lead as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc187-lead@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select count(*) from wiped_issuer) >= 0
    returning id
  ),
  op_lead as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-187 Lead' from usr_lead
    returning user_id
  ),
  usr_admin as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc187-admin@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select user_id from op_lead) is not null
    returning id
  ),
  op_admin as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'admin', 'ACC-187 Admin' from usr_admin
    returning user_id
  ),
  usr_target as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc187-target@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select user_id from op_admin) is not null
    returning id
  ),
  op_target as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-187 Target' from usr_target
    returning user_id
  ),
  usr_approver as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc187-approver@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select user_id from op_target) is not null
    returning id
  ),
  op_approver as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-187 Approver' from usr_approver
    returning user_id
  ),
  usr_issuer as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc187-issuer@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select user_id from op_approver) is not null
    returning id
  ),
  op_issuer as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'issuer', 'ACC-187 Issuer' from usr_issuer
    returning user_id
  ),
  jwt_lead as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_lead)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select user_id from op_issuer) is not null
  ),
  change_target as materialized (
    select role
      from public.boa_acc_set_operator_role((select user_id from op_target), 'issuer')
     where (select claims from jwt_lead) is not null
  ),
  jwt_approver as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_approver)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select count(*) from change_target) >= 0
  ),
  jwt_issuer as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_issuer)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select claims from jwt_approver) is not null
  ),
  jwt_none as materialized (
    select set_config('request.jwt.claims', '', true) as cleared
     where (select claims from jwt_issuer) is not null
  ),
  jwt_lead_again as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_lead)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select cleared from jwt_none) is not null
  ),
  results as materialized (
    select 0 as n, plan(7) as line
    union all select 1, ok(
      (select role from change_target) = 'issuer',
      'a lead changes another operator from approver to issuer'
    )
    union all select 2, throws_ok(
      format('select public.boa_acc_set_operator_role(%L, %L::public.boa_acc_operator_role)', (select user_id from op_lead), 'admin'),
      'P0001', 'cannot_change_own_role', 'a caller cannot change their own role'
    )
    union all select 3, throws_ok(
      format('select public.boa_acc_set_operator_role(%L, %L::public.boa_acc_operator_role)', (select user_id from op_admin), 'issuer'),
      'P0001', 'cannot_demote_last_admin', 'the last active admin cannot be moved off admin'
    )
    union all select 4, throws_ok(
      format('select public.boa_acc_set_operator_role(%L, %L::public.boa_acc_operator_role)', (select user_id from op_target), 'lead'),
      '42501', 'not authorized', 'an approver cannot change a role'
    ) from jwt_approver
    union all select 5, throws_ok(
      format('select public.boa_acc_set_operator_role(%L, %L::public.boa_acc_operator_role)', (select user_id from op_target), 'lead'),
      '42501', 'not authorized', 'an issuer cannot change a role'
    ) from jwt_issuer
    union all select 6, throws_ok(
      format('select public.boa_acc_set_operator_role(%L, %L::public.boa_acc_operator_role)', (select user_id from op_target), 'lead'),
      '42501', 'not authorized', 'a signed-out caller cannot change a role'
    ) from jwt_none
    union all select 7, throws_ok(
      'select public.boa_acc_set_operator_role(''00000000-0000-0000-0000-000000000000'', ''issuer''::public.boa_acc_operator_role)',
      'P0002', 'not found', 'an unknown operator id is refused'
    ) from jwt_lead_again
  ),
  kept as materialized (
    select n, line from results
  ),
  restore_real_admins as materialized (
    select id as user_id
      from private.boa_acc_test_force_operator_active((select ids from real_active_admins), true) as id
     where (select count(*) from kept) >= 0
  ),
  clean_lead as materialized (
    select private.boa_acc_wipe_email('acc187-lead@invalid.test')
     where (select count(*) from restore_real_admins) >= 0
  ),
  clean_admin as materialized (
    select private.boa_acc_wipe_email('acc187-admin@invalid.test')
     where (select count(*) from clean_lead) >= 0
  ),
  clean_target as materialized (
    select private.boa_acc_wipe_email('acc187-target@invalid.test')
     where (select count(*) from clean_admin) >= 0
  ),
  clean_approver as materialized (
    select private.boa_acc_wipe_email('acc187-approver@invalid.test')
     where (select count(*) from clean_target) >= 0
  ),
  clean_issuer as materialized (
    select private.boa_acc_wipe_email('acc187-issuer@invalid.test')
     where (select count(*) from clean_approver) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_issuer), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
