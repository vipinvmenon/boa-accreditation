-- ACC-148 · boa_acc_double_issues() and the dashboard's doubleIssues count.
--
-- @proves: CRITICAL | two offline wristband issues for one person, synced A-then-B, raise exactly one warning row naming both serials and both issuers
-- @proves: CRITICAL | the same two issues synced B-then-A raise the same single row, listed in issue-time order
-- @proves: CRITICAL | both ledger rows survive — the warning rejects, overwrites and deletes nothing (non-negotiable #2)
-- @proves: CRITICAL | issue + void + new issue is ONE live band: no warning (ADR-012)
-- @proves: HIGH     | three live issues raise one row listing all three
-- @proves: HIGH     | a supervisor-noted reissue on top of a live band is not a double issue
-- @proves: HIGH     | dashboard.doubleIssues moves by exactly the fixture's delta
-- @proves: CRITICAL | no session, and an inactive operator, are refused (42501)
--
-- HOW THIS FILE TESTS A LEDGER IT CAN NEVER CLEAN UP
--
-- boa_acc_checkin is append-only, ENABLE ALWAYS (non-negotiable #2): a row
-- this file committed could never be deleted, and dashboard.test.sql's header
-- records what that cost once. ledger.test.sql and vehicle.test.sql avoid it
-- by only ever asserting on FAILING writes. This file needs successful
-- writes — two bands must really be in the ledger for the function to find
-- them — so every scenario is one DO block run inside pgTAP's throws_ok:
--
--   1. build the whole fixture (org, invite, person, device, operator);
--   2. append the scenario's ledger rows exactly as a sync would leave them
--      (explicit occurred_at = the phone's time, posted_at = the sync time);
--   3. read boa_acc_double_issues() and the dashboard as the operator;
--   4. RAISE the verdict as the exception message.
--
-- throws_ok runs the block in a subtransaction, so the raise rolls back
-- every row the block wrote — fixture and ledger alike — and the assertion
-- compares the message against the expected verdict. Nothing this file does
-- ever commits. The rows are inserted directly rather than through
-- boa_acc_gate_issue so the test pins the READ rule, not the gate RPC's
-- authentication, which ACC-150 is replacing in parallel.
--
-- ONE statement (scripts/db-test.mjs reads only the last statement's rows).

with fx as (
  select
    $head$
do $d$
declare
  v_org    uuid;
  v_tok    text;
  v_p      uuid;
  v_dev    uuid;
  v_op     uuid;
  v_c1     uuid;
  v_c2     uuid;
  v_c3     uuid;
  v_before int;
  v_after  int;
  v_ledger int;
  v_me     jsonb;
  v_t0     timestamptz := timestamptz '2026-10-09 10:00+05:30';
begin
  insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
  values ('ACC-148 double issue', 'vendor', 5, 'Double Contact', '+919877000148')
  returning id into v_org;

  v_tok := private.boa_acc_new_token();
  insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
  values (v_org, private.boa_acc_hash_token(v_tok), left(v_tok, 6));

  v_p := public.boa_acc_submit(v_tok, 'ACC148 Double Person', '+919821000148', 'Crew');
  perform private.boa_acc_test_approve_person(v_p, 'crew', false);

  insert into public.boa_acc_device (token_hash, token_hint, gate_label, volunteer_name)
  values (private.boa_acc_hash_token(private.boa_acc_new_token()), 'ACC148', 'ACC-148 Gate', 'ACC-148 Device')
  returning id into v_dev;

  insert into auth.users (
    id, instance_id, aud, role, email, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'acc148-double@invalid.test',
    clock_timestamp(), clock_timestamp(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
  ) returning id into v_op;
  insert into public.boa_acc_operator (user_id, role, display_name)
  values (v_op, 'approver', 'ACC-148 Approver');

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_op::text, 'role', 'authenticated')::text,
    true
  );
  v_before := (public.boa_acc_desk_dashboard() ->> 'doubleIssues')::int;
$head$ as head,
    $tail$
  v_after := (public.boa_acc_desk_dashboard() ->> 'doubleIssues')::int;
  select e into v_me
    from jsonb_array_elements(public.boa_acc_double_issues()) e
   where e ->> 'personId' = v_p::text;
  select count(*) into v_ledger
    from public.boa_acc_checkin c
   where c.person_id = v_p;

  if v_me is null then
    raise exception 'flagged=0 delta=% ledger=%', v_after - v_before, v_ledger;
  end if;

  raise exception 'flagged=1 bands=% serials=% issuers=% kinds=% delta=% ledger=%',
    v_me ->> 'liveBands',
    (select string_agg(x.i ->> 'bandSerial', ',' order by x.ord)
       from jsonb_array_elements(v_me -> 'issues') with ordinality as x(i, ord)),
    (select string_agg(x.i ->> 'issuerName', ',' order by x.ord)
       from jsonb_array_elements(v_me -> 'issues') with ordinality as x(i, ord)),
    (select string_agg(x.i ->> 'issuerKind', ',' order by x.ord)
       from jsonb_array_elements(v_me -> 'issues') with ordinality as x(i, ord)),
    v_after - v_before,
    v_ledger;
end
$d$
$tail$ as tail
)
select line from (
  select 0 as n, plan(8) as line

  -- Issuer A fastens band 0412 at 10:00 offline; issuer B, also offline,
  -- fastens 0413 at 10:05. A's phone syncs first (10:20), B's second (10:30).
  union all select 1, throws_ok(
    (select head from fx) || $s$
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0412', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0, v_t0 + interval '20 minutes');
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0413', v_dev, 'ACC-148 Gate', 'Issuer B', v_t0 + interval '5 minutes', v_t0 + interval '30 minutes');
$s$ || (select tail from fx),
    'P0001',
    'flagged=1 bands=2 serials=0412,0413 issuers=Issuer A,Issuer B kinds=device,device delta=1 ledger=2',
    'two offline issues synced A-then-B: one warning row, both serials, both issuers, both ledger rows kept'
  )

  -- The same two bands, but B's phone finds signal first.
  union all select 2, throws_ok(
    (select head from fx) || $s$
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0413', v_dev, 'ACC-148 Gate', 'Issuer B', v_t0 + interval '5 minutes', v_t0 + interval '20 minutes');
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0412', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0, v_t0 + interval '30 minutes');
$s$ || (select tail from fx),
    'P0001',
    'flagged=1 bands=2 serials=0412,0413 issuers=Issuer A,Issuer B kinds=device,device delta=1 ledger=2',
    'the same two issues synced B-then-A: the same single row, in issue-time order'
  )

  -- Band 0412 is voided (a void appends), then a fresh band 0415 is issued.
  -- Two wristband rows, one void: ONE live band.
  union all select 3, throws_ok(
    (select head from fx) || $s$
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0412', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0, v_t0)
  returning id into v_c1;
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, device_id, gate_label, volunteer_name, occurred_at, posted_at, voids_checkin_id)
  values (v_p, 'void', gen_random_uuid(), v_dev, 'ACC-148 Gate', 'Issuer A', v_t0 + interval '1 minute', v_t0 + interval '1 minute', v_c1);
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0415', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0 + interval '2 minutes', v_t0 + interval '2 minutes');
$s$ || (select tail from fx),
    'P0001',
    'flagged=0 delta=0 ledger=3',
    'issue + void + new issue is one live band: no warning, all three ledger rows kept'
  )

  -- A supervisor-noted reissue on top of a live band (ADR-012: it adds a
  -- row, it does not replace the first) is a decision, not an accident.
  union all select 4, throws_ok(
    (select head from fx) || $s$
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0412', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0, v_t0);
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at, is_reissue, supervisor_note)
  values (v_p, 'wristband', gen_random_uuid(), '0416', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0 + interval '1 hour', v_t0 + interval '1 hour', true, 'Band snapped at the barrier');
$s$ || (select tail from fx),
    'P0001',
    'flagged=0 delta=0 ledger=2',
    'a supervisor-noted reissue on top of a live band is not a double issue'
  )

  -- Three phones, all offline, one person.
  union all select 5, throws_ok(
    (select head from fx) || $s$
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0414', v_dev, 'ACC-148 Gate', 'Issuer C', v_t0 + interval '9 minutes', v_t0 + interval '40 minutes');
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0412', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0, v_t0 + interval '41 minutes');
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0413', v_dev, 'ACC-148 Gate', 'Issuer B', v_t0 + interval '5 minutes', v_t0 + interval '42 minutes');
$s$ || (select tail from fx),
    'P0001',
    'flagged=1 bands=3 serials=0412,0413,0414 issuers=Issuer A,Issuer B,Issuer C kinds=device,device,device delta=1 ledger=3',
    'three live issues: one warning row listing all three'
  )

  -- A single, ordinary issue is not a warning.
  union all select 6, throws_ok(
    (select head from fx) || $s$
  insert into public.boa_acc_checkin (person_id, kind, idempotency_key, band_serial, device_id, gate_label, volunteer_name, occurred_at, posted_at)
  values (v_p, 'wristband', gen_random_uuid(), '0412', v_dev, 'ACC-148 Gate', 'Issuer A', v_t0, v_t0);
$s$ || (select tail from fx),
    'P0001',
    'flagged=0 delta=0 ledger=1',
    'one band, one person: no warning'
  )

  -- No session at all. Nothing in this statement has set a jwt at this
  -- level: every block above set it LOCAL inside a rolled-back subtransaction.
  union all select 7, throws_ok(
    'select public.boa_acc_double_issues()',
    '42501',
    'not authorized',
    'no session is refused'
  )
  from (select set_config('request.jwt.claims', '', true) as cleared) s

  -- A deactivated operator (ACC-049) is not an operator. The fixture's
  -- operator is deactivated and the function called directly — not through
  -- the tail, whose dashboard read would raise the same error first and
  -- prove nothing about this function.
  union all select 8, throws_ok(
    (select head from fx) || $s$
  update public.boa_acc_operator set active = false where user_id = v_op;
  perform public.boa_acc_double_issues();
  raise exception 'an inactive operator read the double-issue list';
end
$d$
$s$,
    '42501',
    'not authorized',
    'an inactive operator is refused'
  )

  union all select 999999, l from finish() l
) t
order by n;
