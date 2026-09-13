-- ACC-049 · boa_acc_set_operator_active.
--
-- @proves: CRITICAL | a lead/admin operator can deactivate a different operator
-- @proves: CRITICAL | a caller cannot deactivate their own row (cannot_deactivate_self)
-- @proves: CRITICAL | deactivating the last active admin is refused (cannot_deactivate_last_admin)
-- @proves: CRITICAL | an approver-role operator cannot call this function at all
-- @proves: CRITICAL | a signed-out caller cannot call this function at all
-- @proves: HIGH     | deactivating an unknown operator id is refused, not silently ignored
--
-- ONE statement, same shape as privileges.test.sql/devices.test.sql:
-- sequential materialized CTEs, each gated on a prior CTE's output so
-- Postgres executes them in order, calling boa_acc_set_operator_active
-- (VOLATILE) rather than re-reading the table directly. Cleanup is in the
-- same statement so a live-database run leaves no ACC-049 rows.
--
-- THE LAST-ADMIN GUARD, AGAINST A REAL DATABASE: this runs against the real
-- boa_acc_operator table (docs/CURRENT-STATE.md: Bhoopesh=lead, Salman=admin,
-- two approvers, plus the project owner as a second admin) — deactivating
-- two synthetic test admins never reaches zero ACTIVE admins globally, since
-- the guard counts every row in the table, not just this test's fixtures.
-- To exercise the guard at all without touching real accounts destructively,
-- every real active admin is set inactive for the lifetime of this ONE
-- statement, then restored before the statement ends. This is safe because a
-- single SQL statement is atomic in Postgres: either every step here runs to
-- completion, including the restore, or (if anything raises an uncaught
-- error — a genuine bug, not a throws_ok-caught expected failure) NONE of it
-- applies and the real rows are exactly as they were. The neutralising
-- UPDATE bypasses boa_acc_set_operator_active on purpose — going through the
-- RPC here would itself trip the very guard being tested (it would refuse to
-- deactivate the actual last real admin), and this test harness already
-- writes auth.users directly elsewhere, at the same "trusted as postgres"
-- level.

with
  real_active_admins as materialized (
    select array_agg(user_id) as ids
      from public.boa_acc_operator
     where role = 'admin' and active
  ),
  neutralize_real_admins as materialized (
    update public.boa_acc_operator
       set active = false
     where user_id in (select unnest(ids) from real_active_admins)
    returning user_id
  ),
  wiped_lead_email as materialized (
    select private.boa_acc_wipe_email('acc049-lead@invalid.test')
     where (select count(*) from neutralize_real_admins) >= 0
  ),
  wiped_admin_a_email as materialized (
    select private.boa_acc_wipe_email('acc049-admin-a@invalid.test')
     where (select count(*) from wiped_lead_email) >= 0
  ),
  wiped_admin_b_email as materialized (
    select private.boa_acc_wipe_email('acc049-admin-b@invalid.test')
     where (select count(*) from wiped_admin_a_email) >= 0
  ),
  wiped_approver_email as materialized (
    select private.boa_acc_wipe_email('acc049-approver@invalid.test')
     where (select count(*) from wiped_admin_b_email) >= 0
  ),
  wiped_target_email as materialized (
    select private.boa_acc_wipe_email('acc049-target@invalid.test')
     where (select count(*) from wiped_approver_email) >= 0
  ),
  usr_lead as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc049-lead@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select count(*) from wiped_target_email) >= 0
    returning id
  ),
  op_lead as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-049 Lead Op' from usr_lead
    returning user_id
  ),
  usr_admin_a as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc049-admin-a@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select user_id from op_lead) is not null
    returning id
  ),
  op_admin_a as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'admin', 'ACC-049 Admin A' from usr_admin_a
    returning user_id
  ),
  usr_admin_b as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc049-admin-b@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select user_id from op_admin_a) is not null
    returning id
  ),
  op_admin_b as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'admin', 'ACC-049 Admin B' from usr_admin_b
    returning user_id
  ),
  usr_approver as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc049-approver@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select user_id from op_admin_b) is not null
    returning id
  ),
  op_approver as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-049 Approver Op' from usr_approver
    returning user_id
  ),
  usr_target as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc049-target@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select user_id from op_approver) is not null
    returning id
  ),
  op_target as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-049 Target Op' from usr_target
    returning user_id
  ),
  jwt_lead as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_lead)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select user_id from op_target) is not null
  ),
  -- 1: lead deactivates a different (non-admin) operator.
  deactivate_target as materialized (
    select * from public.boa_acc_set_operator_active((select user_id from op_target), false)
     where (select claims from jwt_lead) is not null
  ),
  -- 2 (below, in results): self-deactivation is refused, even for a lead —
  -- checked with throws_ok rather than a CTE, since it must not mutate state.
  -- 3/4: last-admin guard. Deactivating admin A first succeeds (admin B is
  -- still active); deactivating admin B afterwards is refused (admin A is
  -- by then inactive, so admin B is the last active admin).
  deactivate_admin_a as materialized (
    select * from public.boa_acc_set_operator_active((select user_id from op_admin_a), false)
     where (select count(*) from deactivate_target) >= 0
  ),
  jwt_approver as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_approver)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select count(*) from deactivate_admin_a) >= 0
  ),
  jwt_none as materialized (
    select set_config('request.jwt.claims', '', true) as cleared
     where (select claims from jwt_approver) is not null
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
        -- IMPORTANT: a materialized CTE's set_config side effect fires the
        -- FIRST time it is textually referenced in this UNION ALL (Postgres
        -- evaluates an Append's branches in written order), not when it is
        -- declared above. Referencing jwt_lead_again before jwt_approver/
        -- jwt_none forces that whole downstream chain to resolve early,
        -- leaving the session on `lead` for every later branch — so the
        -- branches below stay in the exact order the identity switches must
        -- happen: (no switch yet, still `lead`) -> jwt_approver -> jwt_none
        -- -> jwt_lead_again, same shape as devices.test.sql.
        select 0 as n, plan(9) as line
        union all select 1, ok(
          (select active from deactivate_target) = false,
          'lead deactivates a different operator'
        )
        -- Still `lead` here — nothing has referenced jwt_approver/jwt_none/
        -- jwt_lead_again yet, so the session is exactly as jwt_lead left it.
        union all select 2, throws_ok(
          format('select public.boa_acc_set_operator_active(%L, false)', (select user_id from op_lead)),
          'P0001', 'cannot_deactivate_self', 'a caller cannot deactivate their own row'
        )
        union all select 3, ok(
          (select active from deactivate_admin_a) = false,
          'lead deactivates one of two active admins (one remains active)'
        )
        union all select 4, throws_ok(
          format('select public.boa_acc_set_operator_active(%L, false)', (select user_id from op_admin_b)),
          'P0001', 'cannot_deactivate_last_admin', 'deactivating the last active admin is refused'
        )
        -- First reference to jwt_approver anywhere in this query: the switch
        -- happens exactly here, after every lead-context assertion above.
        union all select 5, throws_ok(
          format('select public.boa_acc_set_operator_active(%L, false)', (select user_id from op_admin_b)),
          '42501', 'not authorized', 'an approver cannot call boa_acc_set_operator_active at all'
        ) from jwt_approver
        union all select 6, throws_ok(
          format('select public.boa_acc_set_operator_active(%L, true)', (select user_id from op_target)),
          '42501', 'not authorized', 'an approver cannot reactivate an operator either'
        ) from jwt_approver
        -- First reference to jwt_none: switches to signed-out here.
        union all select 7, throws_ok(
          format('select public.boa_acc_set_operator_active(%L, false)', (select user_id from op_admin_b)),
          '42501', 'not authorized', 'a signed-out caller cannot call boa_acc_set_operator_active'
        ) from jwt_none
        -- First reference to jwt_lead_again: switches back to lead here, so
        -- this call is authorized and can reach the not-found check.
        union all select 8, throws_ok(
          'select public.boa_acc_set_operator_active(''00000000-0000-0000-0000-000000000000'', false)',
          'P0002', 'not found', 'deactivating an unknown operator id is refused'
        ) from jwt_lead_again
        union all select 9, ok(
          (select role from deactivate_target) = 'approver',
          'the returned row carries the target''s own role, unaffected by the call'
        )
  ),
  kept as materialized (
    select n, line from results
  ),
  restore_real_admins as materialized (
    update public.boa_acc_operator
       set active = true
     where user_id in (select unnest(ids) from real_active_admins)
       and (select count(*) from kept) >= 0
    returning user_id
  ),
  clean_lead_email as materialized (
    select private.boa_acc_wipe_email('acc049-lead@invalid.test')
     where (select count(*) from restore_real_admins) >= 0
  ),
  clean_admin_a_email as materialized (
    select private.boa_acc_wipe_email('acc049-admin-a@invalid.test')
     where (select count(*) from clean_lead_email) >= 0
  ),
  clean_admin_b_email as materialized (
    select private.boa_acc_wipe_email('acc049-admin-b@invalid.test')
     where (select count(*) from clean_admin_a_email) >= 0
  ),
  clean_approver_email as materialized (
    select private.boa_acc_wipe_email('acc049-approver@invalid.test')
     where (select count(*) from clean_admin_b_email) >= 0
  ),
  clean_target_email as materialized (
    select private.boa_acc_wipe_email('acc049-target@invalid.test')
     where (select count(*) from clean_approver_email) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_target_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
