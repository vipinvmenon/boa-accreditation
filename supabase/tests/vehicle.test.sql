-- ACC-055 · vehicle barrier RPC.
--
-- @proves: CRITICAL | vehicle writes are database-authorized by the operator's session (ACC-150; was a device token)
-- @proves: HIGH     | malformed plates and turn-aways without reasons fail
-- @proves: HIGH     | clearance requires a registered holder and the officer's sticker and plate checks
-- @proves: HIGH     | a submitted (not yet approved) holder's plate clears with no sticker row or wristband (ADR-031)
-- @proves: HIGH     | the gate pull lists a submitted holder's plate (ADR-031)
--
-- ACC-150: the device token is retired. The caller is now a logged-in
-- operator, identified by request.jwt.claims set inside each asserted SQL
-- string (see issuer.test.sql). A `lead` is used here so this file does not
-- depend on the `issuer` enum label; issuer.test.sql covers the issuer.
-- The idempotency key is cast `::uuid`: the retired device-token overload
-- still exists, and a call made only of untyped literals is ambiguous
-- between the two (PostgREST passes named arguments, so the app is not).
--
-- This file never commits a vehicle event. Every fixture call below is either
-- a failing RPC validation, or (test 7) a successful one whose answer is then
-- cast to int so the statement fails and pgTAP's throws_ok savepoint rolls the
-- insert back (the issuer.test.sql pattern). The immutable event table has no
-- cleanup path.

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
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc055-lead@invalid.test')
     where (select id from person) is not null
  ),
  usr as materialized (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc055-lead@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
     where (select count(*) from wiped_email) >= 0
    returning id
  ),
  op as materialized (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-055 Vehicle Lead' from usr
    returning user_id
  ),
  q as materialized (
    select
      'select %1$s from (select set_config(''request.jwt.claims'', %2$L, true) as c) s where s.c is not null'::text as as_user,
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text as lead
  ),
  results as materialized (
    select 0 as n, plan(8) as line
    where (select lead from q) is not null
    union all select 1, throws_ok(
      format((select as_user from q),
        format('public.boa_acc_gate_vehicle(%L::uuid, %L, %L, %L, null, %L, %L)',
          gen_random_uuid(), 'KA05MJ8871', 'turned_away', (select id from person), '{}'::jsonb, 'No sticker'),
        ''),
      '42501', 'not authorized',
      'no operator session cannot write a vehicle event'
    )
    union all select 2, throws_ok(
      format((select as_user from q),
        format('public.boa_acc_gate_vehicle(%L::uuid, %L, %L, null, null, %L, null)',
          gen_random_uuid(), 'not-a-plate', 'turned_away', '{}'::jsonb),
        (select lead from q)),
      '22023', null,
      'a malformed plate is refused by the database'
    )
    union all select 3, throws_ok(
      format((select as_user from q),
        format('public.boa_acc_gate_vehicle(%L::uuid, %L, %L, null, null, %L, null)',
          gen_random_uuid(), 'KA05MJ8871', 'turned_away', '{}'::jsonb),
        (select lead from q)),
      '22023', null,
      'a turn-away reason is mandatory'
    )
    union all select 4, throws_ok(
      format((select as_user from q),
        format('public.boa_acc_gate_vehicle(%L::uuid, %L, %L, null, null, %L, null)',
          gen_random_uuid(), 'KA05MJ8871', 'cleared', '{"sticker":true,"wristband":true,"plate_visual":true}'::jsonb),
        (select lead from q)),
      '22023', null,
      'clearance requires a person'
    )
    union all select 5, throws_ok(
      format((select as_user from q),
        format('public.boa_acc_gate_vehicle(%L::uuid, %L, %L, %L, null, %L, null)',
          gen_random_uuid(), 'KA05MJ8871', 'cleared', (select id from person), '{"sticker":false,"wristband":false,"plate_visual":true}'::jsonb),
        (select lead from q)),
      '22023', 'sticker and plate checks required',
      'clearance requires the officer to have seen the sticker'
    )
    union all select 6, throws_ok(
      format((select as_user from q),
        format('public.boa_acc_gate_vehicle(%L::uuid, %L, %L, %L, null, %L, null)',
          gen_random_uuid(), 'KA05MJ9999', 'cleared', (select id from person), '{"sticker":true,"wristband":false,"plate_visual":true}'::jsonb),
        (select lead from q)),
      '22023', 'vehicle registration mismatch',
      'clearance refuses a plate that is not the holder''s registration'
    )
    union all select 7, throws_ok(
      format(
        $f$select (case when r->>'outcome' = 'cleared' and r->>'personId' = %3$L and r->>'stickerCheckinId' is null
                          then 'recorded' else 'refused' end)::int
             from (select public.boa_acc_gate_vehicle(gen_random_uuid(), 'KA05MJ8871', 'cleared', %3$L::uuid, null,
                                                     '{"sticker":true,"wristband":false,"plate_visual":true}'::jsonb, null) as r
                     from (select set_config('request.jwt.claims', %2$L, true) as c) s
                    where s.c is not null) x$f$,
        null, (select lead from q), (select id from person)
      ),
      '22P02', 'invalid input syntax for type integer: "recorded"',
      'a submitted holder''s plate clears with no sticker row and no wristband (rolled back)'
    )
    union all select 8, is(
      (select (v->>'status') || ' ' || (v->>'fullName')
         from (select jsonb_array_elements(public.boa_acc_gate_pull()->'vehicles') as v
                 from (select set_config('request.jwt.claims', (select lead from q), true) as c) s
                where s.c is not null) x
        where v->>'plate' = 'KA05MJ8871'),
      'submitted ACC055 Vehicle Person',
      'the gate pull lists a submitted holder''s plate, name and status'
    )
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-055 vehicle')
    where (select count(*) from results) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email('acc055-lead@invalid.test')
    where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from results
  where (select count(*) from clean_email) >= 0
  union all select 999999, l from finish() l
) t
order by n;
