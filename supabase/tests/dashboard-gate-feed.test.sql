-- ACC-183a · dashboard gate counts and latest ledger issues.
--
-- The successful fixture is wrapped in throws_ok so the append-only ledger
-- rows roll back in a subtransaction. No test cleanup ever updates or deletes
-- boa_acc_checkin.

with
  results as materialized (
    select 0 as n, plan(3) as line

    union all select 1, is(
      has_function_privilege('anon', 'public.boa_acc_desk_gate_feed()', 'EXECUTE'),
      false,
      'anon cannot execute the dashboard gate feed'
    )

    union all select 2, throws_ok(
      'select public.boa_acc_desk_gate_feed()',
      '42501',
      'not authorized',
      'the gate feed refuses a session without an active operator'
    )

    union all select 3, throws_ok(
$do$
do $body$
declare
  v_org uuid;
  v_person uuid;
  v_device uuid;
  v_operator uuid;
  v_checkin uuid;
  v_token text;
  v_feed jsonb;
  v_gate_count integer;
  v_latest jsonb;
begin
  insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
  values ('ACC-183a gate feed', 'vendor', 5, 'Feed Contact', '+919855551183')
  returning id into v_org;

  v_token := private.boa_acc_new_token();
  insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
  values (v_org, private.boa_acc_hash_token(v_token), left(v_token, 6));

  v_person := public.boa_acc_submit(
    v_token, 'ACC183a Feed Person', '+919855551184', 'Gate crew'
  );
  perform private.boa_acc_test_approve_person(v_person, 'crew', false);

  insert into public.boa_acc_device (
    token_hash, token_hint, gate_label, volunteer_name
  )
  values (
    private.boa_acc_hash_token(private.boa_acc_new_token()),
    'ACC183',
    'ACC-183a Gate',
    'ACC-183a Issuer'
  )
  returning id into v_device;

  insert into auth.users (
    id, instance_id, aud, role, email, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  )
  values (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'acc183a-feed@invalid.test',
    clock_timestamp(),
    clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb
  )
  returning id into v_operator;

  insert into public.boa_acc_operator (user_id, role, display_name)
  values (v_operator, 'approver', 'ACC-183a Approver');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_operator::text, 'role', 'authenticated')::text,
    true
  );

  insert into public.boa_acc_checkin (
    person_id, kind, idempotency_key, band_serial, device_id,
    gate_label, volunteer_name, occurred_at
  )
  values (
    v_person, 'wristband', gen_random_uuid(), '183A', v_device,
    'ACC-183a Gate', 'ACC-183a Issuer', clock_timestamp()
  )
  returning id into v_checkin;

  v_feed := public.boa_acc_desk_gate_feed();

  select (entry ->> 'count')::integer
  into v_gate_count
  from jsonb_array_elements(v_feed -> 'gateCounts') as counts(entry)
  where entry ->> 'gateLabel' = 'ACC-183a Gate';

  select entry
  into v_latest
  from jsonb_array_elements(v_feed -> 'latestIssues') as issues(entry)
  where entry ->> 'checkinId' = v_checkin::text;

  if v_gate_count <> 1
     or v_latest ->> 'fullName' <> 'ACC183a Feed Person'
     or v_latest ->> 'kind' <> 'wristband'
  then
    raise exception 'gate=% count=% latest=% kind=%',
      'ACC-183a Gate',
      coalesce(v_gate_count, 0),
      coalesce(v_latest ->> 'fullName', '<missing>'),
      coalesce(v_latest ->> 'kind', '<missing>');
  end if;

  insert into public.boa_acc_checkin (
    person_id, kind, idempotency_key, device_id, gate_label,
    volunteer_name, occurred_at, posted_at, voids_checkin_id
  )
  values (
    v_person, 'void', gen_random_uuid(), v_device, 'ACC-183a Gate',
    'ACC-183a Issuer', clock_timestamp(), clock_timestamp(), v_checkin
  );

  v_feed := public.boa_acc_desk_gate_feed();

  select (entry ->> 'count')::integer
  into v_gate_count
  from jsonb_array_elements(v_feed -> 'gateCounts') as counts(entry)
  where entry ->> 'gateLabel' = 'ACC-183a Gate';

  select entry
  into v_latest
  from jsonb_array_elements(v_feed -> 'latestIssues') as issues(entry)
  where entry ->> 'checkinId' = v_checkin::text;

  if v_gate_count is not null or v_latest is not null then
    raise exception 'voided gate=% latest=%',
      coalesce(v_gate_count::text, '0'),
      coalesce(v_latest ->> 'checkinId', '<missing>');
  end if;

  raise exception 'gate=ACC-183a Gate count=1 latest=ACC183a Feed Person kind=wristband voided=excluded';
end
$body$;
$do$,
'P0001',
  'gate=ACC-183a Gate count=1 latest=ACC183a Feed Person kind=wristband voided=excluded',
'the feed counts today''s gate issue and returns the latest ledger issue'
    )
  )
select line from (
  select n, line from results
  union all select 999999, l from finish() l
) t
order by n;
