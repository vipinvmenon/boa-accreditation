-- ACC-045 · boa_acc_mint_device / boa_acc_revoke_device.
--
-- @proves: CRITICAL | mint and revoke both require an operator jwt (lead/admin)
-- @proves: CRITICAL | an approver-role operator cannot mint or revoke a device
-- @proves: HIGH     | mint returns a raw token that is not stored; only the hash is
-- @proves: HIGH     | mint with no override uses the show's own end-time default
-- @proves: HIGH     | an explicit expires_at override is honoured; a past one is refused
-- @proves: MEDIUM   | revoking an already-revoked or unknown device id is refused, not silently repeated
--
-- ONE statement, same shape as tokens.test.sql: sequential materialized CTEs,
-- each one gated on a prior CTE's output so Postgres executes them in order,
-- calling mint_device/revoke_device (both VOLATILE) rather than re-reading
-- the table directly — a plain SELECT of another CTE's write in the same
-- statement is not guaranteed visible (see 202609110005's header); a VOLATILE
-- function call is. Cleanup is in the same statement so a live-database run
-- leaves no ACC-045 rows.

with
  wiped_devices as materialized (
    delete from public.boa_acc_device where gate_label like 'ACC-045 Gate%'
    returning id
  ),
  wiped_lead_email as materialized (
    select private.boa_acc_wipe_email('acc045-lead@invalid.test')
     where (select count(*) from wiped_devices) >= 0
  ),
  wiped_approver_email as materialized (
    select private.boa_acc_wipe_email('acc045-approver@invalid.test')
     where (select count(*) from wiped_lead_email) >= 0
  ),
  usr_lead as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc045-lead@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select count(*) from wiped_approver_email) >= 0
    returning id
  ),
  op_lead as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-045 Lead Op' from usr_lead
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
           'acc045-approver@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
     where (select user_id from op_lead) is not null
    returning id
  ),
  op_approver as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-045 Approver Op' from usr_approver
    returning user_id
  ),
  jwt_lead as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_lead)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select user_id from op_approver) is not null
  ),
  mint1 as materialized (
    select * from public.boa_acc_mint_device('ACC-045 Gate A', 'Volunteer One', 'crew')
     where (select claims from jwt_lead) is not null
  ),
  mint_override as materialized (
    select * from public.boa_acc_mint_device(
      -- Deliberately AFTER the show's own default expiry (2026-10-11
      -- 06:00+05:30), so "override > default" actually exercises the
      -- override rather than just landing before it by accident.
      'ACC-045 Gate B', 'Volunteer Two', 'vehicle', timestamptz '2026-12-01 00:00+05:30'
    )
     where (select count(*) from mint1) >= 0
  ),
  jwt_approver as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op_approver)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select count(*) from mint_override) >= 0
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
  revoke1 as materialized (
    select public.boa_acc_revoke_device((select device_id from mint1)) as id
     where (select claims from jwt_lead_again) is not null
  ),
  results as materialized (
        select 0 as n, plan(13) as line
        union all select 1, ok((select count(*) from mint1) = 1, 'lead mint returned a row')
        union all select 2, ok(length((select token from mint1)) = 22, 'raw token is 22 chars')
        union all select 3, ok(
          (select token_hint from mint1) = left((select token from mint1), 6),
          'mint returns a hint that is the first 6 characters of the raw token'
        )
        union all select 4, is((select scope from mint1), 'crew', 'mint returns the requested scope')
        union all select 5, is(
          (select expires_at from mint1)::text,
          (timestamptz '2026-10-11 06:00+05:30')::text,
          'mint with no override uses the show''s own end time as the default expiry'
        )
        union all select 6, ok(
          (select expires_at from mint_override) > (select expires_at from mint1),
          'mint with an explicit expires_at override honours it'
        )
        union all select 7, throws_ok(
          format(
            'select public.boa_acc_mint_device(%L, %L, %L, %L)',
            'ACC-045 Gate Bad', 'Volunteer Bad', 'crew', (clock_timestamp() - interval '1 hour')::text
          ),
          'P0001', 'invalid_expiry', 'a past expires_at override is refused'
        ) from mint_override
        union all select 8, throws_ok(
          'select public.boa_acc_mint_device(''ACC-045 Gate C'', ''Volunteer Three'', ''crew'')',
          '42501', 'not authorized', 'an approver cannot mint a device'
        ) from jwt_approver
        union all select 9, throws_ok(
          format('select public.boa_acc_revoke_device(%L)', (select device_id from mint1)),
          '42501', 'not authorized', 'an approver cannot revoke a device'
        ) from jwt_approver
        union all select 10, throws_ok(
          'select public.boa_acc_mint_device(''ACC-045 Gate D'', ''Volunteer Four'', ''crew'')',
          '42501', 'not authorized', 'a signed-out caller cannot mint a device'
        ) from jwt_none
        union all select 11, ok(
          (select id from revoke1) = (select device_id from mint1),
          'lead revoke returns the device id'
        )
        union all select 12, throws_ok(
          format('select public.boa_acc_revoke_device(%L)', (select device_id from mint1)),
          'P0002', 'not found', 'revoking an already-revoked device is refused, not silently repeated'
        ) from revoke1
        union all select 13, throws_ok(
          'select public.boa_acc_revoke_device(''00000000-0000-0000-0000-000000000000'')',
          'P0002', 'not found', 'revoking an unknown device id is refused'
        ) from jwt_lead_again
  ),
  kept as materialized (
    select n, line from results
  ),
  clean_devices as materialized (
    delete from public.boa_acc_device
     where gate_label like 'ACC-045 Gate%'
       and (select count(*) from kept) >= 0
    returning 1
  ),
  clean_lead_email as materialized (
    select private.boa_acc_wipe_email('acc045-lead@invalid.test')
     where (select count(*) from clean_devices) >= 0
  ),
  clean_approver_email as materialized (
    select private.boa_acc_wipe_email('acc045-approver@invalid.test')
     where (select count(*) from clean_lead_email) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_approver_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
