-- ACC-033 · boa_acc_desk_dashboard() arithmetic and authorization.
--
-- @proves: CRITICAL | a non-operator (no jwt, or a jwt with no operator row) is refused
-- @proves: HIGH     | an approver (not just lead/admin) can read the dashboard
-- @proves: HIGH     | submitted/approved/pending counts change by exactly the known
--                       fixture's delta over whatever the dashboard already read (the
--                       dashboard is a global, not per-org, read — see 14 Sep note below)
-- @proves: HIGH     | bandsNotCollected/stickersPending fall back to the full approved/
--                       vehicle count when nothing has been issued yet (today's real state)
-- @proves: HIGH     | C9 — aaaStamped comes from aaa_nomination.person_id, never
--                       from boa_acc_person.type_code, per DATA-MODEL.md's own resolution
-- @proves: MEDIUM   | the org row's `used` count matches the same fixture
--
-- WHY THIS FILE NEVER TOUCHES boa_acc_checkin
--
-- An earlier draft inserted wristband/sticker checkins to test bandsIssued/
-- stickersActive directly, then tried to delete them during cleanup. That is
-- impossible by design: boa_acc_checkin_immutable is ENABLE ALWAYS (non-
-- negotiable #2), so even the table owner cannot delete a checkin row, ever.
-- The draft's two test rows had to be removed from production by hand —
-- disabling the trigger, deleting those two specific rows, re-enabling it —
-- which is not something a repeatable test should ever require. The
-- bandsIssued/stickersActive query branches (the NOT EXISTS ... void lookup)
-- were verified once by hand against a scratch fixture instead and are not
-- re-tested automatically; ACC-042 or ACC-054, whichever first has a real
-- reason to write checkins in a test, should reconsider this rather than
-- add a delete path to a ledger that must never have one.
--
-- ONE statement, cleanup in the same statement — same shape as tokens.test.sql.

with
  pre_wipe_aaa as materialized (
    delete from public.boa_acc_aaa_nomination
     where phone in ('+919820000001', '+919820000002', '+919820000003')
    returning 1
  ),
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-033 dashboard')
     where (select count(*) from pre_wipe_aaa) >= 0
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc033-dash@invalid.test')
     where (select count(*) from wiped) >= 0
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-033 dashboard', 'vendor', 10, 'Dash Contact', '+919855555555'
     where (select count(*) from wiped_email) >= 0
    returning *
  ),

  -- The operator is an APPROVER, not lead/admin — proves the dashboard is a
  -- shared desk read, unlike boa_acc_create_org's lead/admin-only gate.
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc033-dash@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from org
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-033 Dash Approver' from usr
    returning user_id
  ),

  -- Baseline snapshot taken BEFORE this fixture exists, so the assertions
  -- below can check exact fixture-caused deltas rather than global absolute
  -- counts. boa_acc_desk_dashboard() is deliberately a global read (every
  -- real org/person, not just this fixture's), so asserting an absolute
  -- value only ever worked while the database had no other data in it —
  -- which stops being true the moment a single real submission lands
  -- (ACC-030/031, due before 20 Sep). Found and fixed 14 Sep 2026 after this
  -- file failed for the first time, against real placeholder QA data.
  jwt_before as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),
  dash_before as materialized (
    select public.boa_acc_desk_dashboard() as j
     where (select claims from jwt_before) is not null
  ),

  tok as materialized (
    select private.boa_acc_new_token() as token from org
     where (select j from dash_before) is not null
  ),
  inv as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org), private.boa_acc_hash_token(tok.token), left(tok.token, 6)
      from tok
    returning id
  ),

  -- Five submitted people. p1 stays pending, p2 is rejected, p3/p4/p5 are
  -- approved (directly, via the test-only helpers in 202609120011 —
  -- boa_acc_decide does not exist yet; ACC-041). submittedTotal must count
  -- all five; only p3/p4/p5 are approved. p4 and p5 carry a vehicle
  -- registration so vehiclesApproved (and so stickersPending) is nonzero.
  p1 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC033 Pending', '+919820000101', 'Crew'
    ) as id from inv
  ),
  p2 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC033 Rejected', '+919820000102', 'Crew'
    ) as id from p1
  ),
  p3 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC033 Approved Crew', '+919820000103', 'Rigger'
    ) as id from p2
  ),
  p4 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC033 Approved Stage Vehicle', '+919820000104', 'FOH', 'KA05MJ0004'
    ) as id from p3
  ),
  p5 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC033 Approved Crew Vehicle', '+919820000105', 'Loader', 'KA05MJ0005'
    ) as id from p4
  ),

  reject_p2 as materialized (
    select private.boa_acc_test_reject_person((select id from p2), 'ACC-033 test fixture') as done
  ),
  approve_p3 as materialized (
    select private.boa_acc_test_approve_person((select id from p3), 'crew') as done
  ),
  approve_p4 as materialized (
    select private.boa_acc_test_approve_person((select id from p4), 'stage') as done
  ),
  -- p5 is also the bmsAdded fixture: in_bms = true.
  approve_p5 as materialized (
    select private.boa_acc_test_approve_person((select id from p5), 'crew', true) as done
  ),

  -- C9 fixture: A is approved but never stamped (no person_id) — proves a
  -- nomination alone does not move aaaStamped. B is approved AND stamped
  -- onto p3's already-approved pass (a person's actual type_code need not be
  -- 'aaa' for this — the point is that aaaStamped reads person_id, never
  -- type_code). C is nominated but not approved at all.
  nom_a as materialized (
    insert into public.boa_acc_aaa_nomination (full_name, phone, approved, approved_at)
    select 'ACC033 AAA Approved Only', '+919820000001', true, clock_timestamp()
     where (select done from approve_p3) is not null
       and (select done from approve_p4) is not null
       and (select done from approve_p5) is not null
       and (select done from reject_p2) is not null
    returning id
  ),
  nom_b as materialized (
    insert into public.boa_acc_aaa_nomination (full_name, phone, approved, approved_at, person_id)
    select 'ACC033 AAA Stamped', '+919820000002', true, clock_timestamp(), (select id from p3)
     where (select id from nom_a) is not null
    returning id
  ),
  nom_c as materialized (
    insert into public.boa_acc_aaa_nomination (full_name, phone, approved)
    select 'ACC033 AAA Not Approved', '+919820000003', false
     where (select id from nom_b) is not null
    returning id
  ),

  jwt_after as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select id from nom_c) is not null
  ),
  dash as materialized (
    select public.boa_acc_desk_dashboard() as j
     where (select claims from jwt_after) is not null
  ),
  org_row as materialized (
    select v as row
      from dash, jsonb_array_elements(dash.j -> 'orgs') v
     where v ->> 'id' = (select id::text from org)
  ),
  type_row as materialized (
    select v as row
      from dash, jsonb_array_elements(dash.j -> 'types') v
     where v ->> 'code' = 'aaa'
  ),
  type_row_before as materialized (
    select v as row
      from dash_before, jsonb_array_elements(dash_before.j -> 'types') v
     where v ->> 'code' = 'aaa'
  ),

  results as materialized (
    select 0 as n, plan(15) as line

    union all select 1, is((select (j->>'submittedTotal')::int from dash) - (select (j->>'submittedTotal')::int from dash_before), 5, 'submittedTotal counts all five, including rejected')
    union all select 2, is((select (j->>'submittedOrgs')::int from dash) - (select (j->>'submittedOrgs')::int from dash_before), 1, 'submittedOrgs is 1')
    union all select 3, is((select (j->>'approvedTotal')::int from dash) - (select (j->>'approvedTotal')::int from dash_before), 3, 'approvedTotal is 3 (p3, p4, p5)')
    union all select 4, is((select (j->>'pendingTotal')::int from dash) - (select (j->>'pendingTotal')::int from dash_before), 1, 'pendingTotal is 1 (p1 only — p2 is rejected, not pending)')

    union all select 5, is((select (j->>'bandsIssued')::int from dash), 0, 'bandsIssued is 0 — nobody has checked in')
    union all select 6, is((select (j->>'bandsNotCollected')::int from dash) - (select (j->>'bandsNotCollected')::int from dash_before), 3, 'bandsNotCollected falls back to approvedTotal(+3) when bandsIssued is 0')

    union all select 7, is((select (j->>'stickersActive')::int from dash), 0, 'stickersActive is 0 — nobody has checked in')
    union all select 8, is((select (j->>'stickersPending')::int from dash) - (select (j->>'stickersPending')::int from dash_before), 2, 'stickersPending falls back to vehiclesApproved(+2: p4, p5) when stickersActive is 0')

    union all select 9, is((select (j->>'bmsAdded')::int from dash) - (select (j->>'bmsAdded')::int from dash_before), 1, 'bmsAdded counts p5 only')
    union all select 10, is((select (j->>'bmsPending')::int from dash) - (select (j->>'bmsPending')::int from dash_before), 2, 'bmsPending is approved-and-not-in-bms: p3, p4')

    union all select 11, is((select (j->>'aaaNominatedApproved')::int from dash) - (select (j->>'aaaNominatedApproved')::int from dash_before), 2, 'aaaNominatedApproved counts nom_a and nom_b (both approved), not nom_c')
    union all select 12, is((select (j->>'aaaStamped')::int from dash) - (select (j->>'aaaStamped')::int from dash_before), 1, 'aaaStamped counts only nom_b (person_id set) — C9, never boa_acc_person.type_code')
    union all select 13, is(coalesce((select (row->>'count')::int from type_row), 0) - coalesce((select (row->>'count')::int from type_row_before), 0), 1, 'the types array''s own aaa row matches aaaStamped, not a type_code count')

    union all select 14, is((select (row->>'used')::int from org_row), 5, 'the org row''s used count matches submittedTotal for that org')

    union all select 15, throws_ok(
      'select public.boa_acc_desk_dashboard()',
      '42501',
      'not authorized',
      'no session at all is refused'
    )
    from (select set_config('request.jwt.claims', '', true) as cleared) s
  ),
  kept as materialized (
    select n, line from results
  ),
  -- A plain re-scanning DELETE here would not see nom_a/b/c — they were
  -- inserted earlier in this SAME statement. See 202609120011's header.
  clean_aaa as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(
      array['+919820000001', '+919820000002', '+919820000003']
    ) as done
     where (select count(*) from kept) >= 0
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-033 dashboard')
     where (select count(*) from clean_aaa) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email('acc033-dash@invalid.test')
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
