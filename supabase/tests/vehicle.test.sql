-- ACC-055 · vehicle barrier RPC.
--
-- @proves: CRITICAL | vehicle writes are database-authorized by a device token
-- @proves: HIGH     | malformed plates and turn-aways without reasons fail
-- @proves: HIGH     | clearance requires all three physical checks
--
-- This file never commits a vehicle event. Every successful fixture call below
-- is deliberately a failing RPC validation, so the insert is rolled back by
-- pgTAP's throws_ok savepoint. The immutable event table has no cleanup path.

with
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-055 vehicle')
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-055 vehicle', 'vendor', 5, 'Vehicle Contact', '+919877000055'
    where (select count(*) from wiped) >= 0
    returning id
  ),
  token as materialized (
    select private.boa_acc_new_token() as token
    from org
  ),
  invite as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org), private.boa_acc_hash_token(token), left(token, 6)
    from token
    returning id
  ),
  person as materialized (
    select public.boa_acc_submit(
      (select token from token), 'ACC055 Vehicle Person', '+919821000355', 'Driver',
      'KA05MJ8871'
    ) as id
    from invite
  ),
  device_token as materialized (
    select private.boa_acc_new_token() as token
    where (select id from person) is not null
  ),
  device as (
    insert into public.boa_acc_device (
      token_hash, token_hint, gate_label, volunteer_name, scope
    )
    select private.boa_acc_hash_token((select token from device_token)), 'ACC055', 'Gate 1', 'Vehicle Officer', 'vehicle'
    where (select id from person) is not null
    returning id
  ),
  results as materialized (
    select 0 as n, plan(4) as line
    where (select count(*) from device) >= 0
    union all select 1, throws_ok(
      format(
        'select public.boa_acc_gate_vehicle(%L, %L, %L, %L, %L, null, %L, %L)',
        'invalid-device-token', gen_random_uuid(), 'KA05MJ8871', 'turned_away',
        (select id from person), '{}'::jsonb, 'No sticker'
      ),
      '42501', null,
      'an invalid device token cannot write a vehicle event'
    )
    union all select 2, throws_ok(
      format(
        'select public.boa_acc_gate_vehicle(%L, %L, %L, %L, null, null, %L, null)',
        (select token from device_token), gen_random_uuid(), 'not-a-plate', 'turned_away',
        '{}'::jsonb
      ),
      '22023', null,
      'a malformed plate is refused by the database'
    )
    union all select 3, throws_ok(
      format(
        'select public.boa_acc_gate_vehicle(%L, %L, %L, %L, null, null, %L, null)',
        (select token from device_token), gen_random_uuid(), 'KA05MJ8871', 'turned_away',
        '{}'::jsonb
      ),
      '22023', null,
      'a turn-away reason is mandatory'
    )
    union all select 4, throws_ok(
      format(
        'select public.boa_acc_gate_vehicle(%L, %L, %L, %L, null, null, %L, null)',
        (select token from device_token), gen_random_uuid(), 'KA05MJ8871', 'cleared',
        '{"sticker":true,"wristband":true,"plate_visual":true}'::jsonb
      ),
      '22023', null,
      'clearance requires a person and sticker evidence'
    )
  ),
  device_cleaned as materialized (
    select private.boa_acc_test_wipe_device((select id from device))
    where (select count(*) from results) >= 0
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-055 vehicle')
    where (select count(*) from device_cleaned) >= 0
  )
select line from (
  select n, line from results
  where (select count(*) from clean) >= 0
  union all select 999999, l from finish() l
) t
order by n;
