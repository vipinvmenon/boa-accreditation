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
  v_token text;
  v_feed jsonb;
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
  );

  v_feed := public.boa_acc_desk_gate_feed();

  if (v_feed -> 'gateCounts' -> 0 ->> 'gateLabel') <> 'ACC-183a Gate'
     or (v_feed -> 'gateCounts' -> 0 ->> 'count')::integer <> 1
     or (v_feed -> 'latestIssues' -> 0 ->> 'fullName') <> 'ACC183a Feed Person'
     or (v_feed -> 'latestIssues' -> 0 ->> 'kind') <> 'wristband'
  then
    raise exception 'gate=% count=% latest=% kind=%',
      v_feed -> 'gateCounts' -> 0 ->> 'gateLabel',
      v_feed -> 'gateCounts' -> 0 ->> 'count',
      v_feed -> 'latestIssues' -> 0 ->> 'fullName',
      v_feed -> 'latestIssues' -> 0 ->> 'kind';
  end if;

  raise exception 'gate=ACC-183a Gate count=1 latest=ACC183a Feed Person kind=wristband';
end
$body$;
$do$,
'P0001',
'gate=ACC-183a Gate count=1 latest=ACC183a Feed Person kind=wristband',
'the feed counts today''s gate issue and returns the latest ledger issue'
    )
  )
select line from (
  select n, line from results
  union all select 999999, l from finish() l
) t
order by n;
