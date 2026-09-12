-- ACC-041 · boa_acc_decide / boa_acc_approve_org.
--
-- @proves: CRITICAL | pass_token/pass_ref are NULL on a submitted person, non-NULL after approval (ADR-002's compensating control, row-level)
-- @proves: CRITICAL | a rejection without decision_reason is refused (the CHECK fires; the RPC does not swallow it)
-- @proves: CRITICAL | approving as aaa without a matching approved, unstamped nomination is refused
-- @proves: CRITICAL | approving as aaa WITH a matching nomination succeeds and stamps aaa_nomination.person_id
-- @proves: CRITICAL | a non-operator (no jwt at all) cannot call boa_acc_decide
-- @proves: HIGH     | an approver (not just lead/admin) can decide — deciding is the approver role's job
-- @proves: HIGH     | boa_acc_approve_org approves every submitted row in the org and returns the count
-- @proves: HIGH     | boa_acc_approve_org leaves an already-decided row (here, rejected) untouched
-- @proves: HIGH     | deciding an already-decided row again is refused (already_decided)
-- @proves: MEDIUM   | pass_ref follows the BOA26-nnnn scheme from the shared sequence
--
-- ONE statement, cleanup in the same statement — same shape as quota.test.sql
-- and tokens.test.sql. Never touches boa_acc_checkin — see ledger.test.sql and
-- docs/DECISIONS.md ADR-012 for why "reissue" is out of this file's scope.
--
-- WHY EVERY throws_ok CALL HERE IS ITS OWN TOP-LEVEL CTE, NOT INLINE IN
-- "results"
--
-- An earlier draft called boa_acc_decide directly inside one branch of
-- "results"'s own UNION ALL (e.g. the real "reject with a reason" call), and
-- separately cleared/restored the operator JWT via other branches of that
-- SAME UNION ALL (the "no session" test and its restore). That relies on
-- Postgres evaluating a single Append's branches in listed textual order,
-- which is NOT something the CTE data-dependency model actually guarantees
-- (unlike the WITH-clause-level sequencing this file and every other test
-- file already leans on via `where (select ... ) is not null`). It broke,
-- silently reordering a JWT clear ahead of a still-pending authorized call
-- and aborting the WHOLE statement with an uncaught "not authorized" — not a
-- failed assertion, a failed RUN, caught only by actually executing this
-- against the live database rather than trusting the SQL to be obviously
-- right. Fixed by moving every authorization-sensitive call (both the ones
-- expected to succeed and the ones wrapped in throws_ok) into its own
-- top-level, explicitly-gated CTE, exactly like decide_p2/nom/decide_p5_aaa
-- below. "results" now does nothing but READ already-settled values — no
-- volatile, order-sensitive call is left inside it.

with
  wiped as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-041 decide'), ('ACC-041 approve-org')) v(n)
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc041-decide@invalid.test')
     where (select count(*) from wiped) >= 0
  ),
  wiped_aaa as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(array['+919821000001', '+919821000002'])
     where (select count(*) from wiped_email) >= 0
  ),

  -- Org 1: exercises boa_acc_decide row by row.
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-041 decide', 'vendor', 10, 'Decide Contact', '+919877000001'
     where (select count(*) from wiped_aaa) >= 0
    returning *
  ),
  tok as materialized (
    select private.boa_acc_new_token() as token from org
  ),
  inv as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org), private.boa_acc_hash_token(tok.token), left(tok.token, 6)
      from tok
    returning id
  ),

  -- Org 2: exercises boa_acc_approve_org (bulk).
  org2 as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-041 approve-org', 'vendor', 10, 'Approve Org Contact', '+919877000002'
     where (select id from inv) is not null
    returning *
  ),
  tok2 as materialized (
    select private.boa_acc_new_token() as token from org2
  ),
  inv2 as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org2), private.boa_acc_hash_token(tok2.token), left(tok2.token, 6)
      from tok2
    returning id
  ),

  -- The operator is an APPROVER, not lead/admin — proves deciding is not
  -- lead/admin-only the way boa_acc_create_org/mint_invite are.
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', 'acc041-decide@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from org2
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'approver', 'ACC-041 Approver' from usr
    returning user_id
  ),
  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),

  -- p1: stays submitted throughout — the "pass_token is null before approval" fixture,
  -- and later the "no session" negative fixture.
  p1 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC041 Pending', '+919821000101', 'Crew'
    ) as id from inv
  ),
  -- p2: approved as crew — the "pass_token is non-null after approval" fixture.
  p2 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC041 Approve Crew', '+919821000102', 'Rigger'
    ) as id from p1
  ),
  -- p3: rejected, first without then with a reason.
  p3 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC041 Reject Me', '+919821000103', 'FOH'
    ) as id from p2
  ),
  -- p4: aaa attempted with NO matching nomination ever — stays untouched.
  -- A separate row from p5 on purpose: p5 gets a real nomination and a real
  -- approval later, and reusing one row for both cases would risk exactly
  -- the kind of ordering confusion this file's header just described.
  p4 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC041 AAA No Nomination', '+919821000001', 'Tour Manager'
    ) as id from p3
  ),
  -- p5: aaa attempted WITH a matching, approved, unstamped nomination.
  p5 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC041 AAA With Nomination', '+919821000002', 'Tour Manager'
    ) as id from p4
  ),

  -- Before p2 is decided at all: pass_token/pass_ref/type_code/day_validity
  -- must all be NULL on a merely-submitted row. Read via
  -- private.boa_acc_test_read_person (202609121801), NOT a bare
  -- `select ... from public.boa_acc_person where id = ...` — a plain scan of
  -- the base table shares this statement's ONE snapshot and cannot see a row
  -- p2 (a sibling data-modifying CTE) inserted moments earlier in the SAME
  -- statement. Hit this for real while writing this file; see that
  -- migration's own header for the full explanation.
  pre_check as materialized (
    select
      (r).pass_token   is null as token_null,
      (r).pass_ref     is null as ref_null,
      (r).type_code    is null as type_null,
      (r).day_validity is null as validity_null
    from (select private.boa_acc_test_read_person((select id from p2)) as r) x
  ),

  -- ---------------------------------------------------------------------
  -- Every step below is its own gated CTE, in the exact order it must run.
  -- ---------------------------------------------------------------------

  decide_p2 as materialized (
    select * from public.boa_acc_decide((select id from p2), true, 'crew', 'build_show')
     where (select token_null from pre_check)
       and (select claims from jwt) is not null
  ),

  -- Negative: rejecting p3 with no reason, while p3 is still submitted.
  reject_p3_attempt_no_reason as materialized (
    select throws_ok(
      format('select public.boa_acc_decide(%L, false, null, null, null)', (select id from p3)),
      '23514',
      null,
      'rejecting without a reason is refused by the table''s own CHECK, surfaced through the RPC'
    ) as line
     where (select id from decide_p2) is not null
  ),
  p3_status_after_failed_reject as materialized (
    select (private.boa_acc_test_read_person((select id from p3))).status as status
     where (select line from reject_p3_attempt_no_reason) is not null
  ),

  -- Positive: rejecting p3 for real, with a reason, AFTER the negative case ran.
  reject_p3_final as materialized (
    select * from public.boa_acc_decide((select id from p3), false, null, null, 'a real reason')
     where (select status from p3_status_after_failed_reject) = 'submitted'
  ),

  -- Negative: approving p4 as aaa with no matching nomination.
  aaa_attempt_no_nomination as materialized (
    select throws_ok(
      format('select public.boa_acc_decide(%L, true, %L, %L)', (select id from p4), 'aaa', 'build_show'),
      'P0001',
      'aaa_not_nominated',
      'approving as aaa with no matching nomination is refused'
    ) as line
     where (select id from reject_p3_final) is not null
  ),

  nom as (
    insert into public.boa_acc_aaa_nomination (full_name, phone, approved, approved_at)
    select 'ACC041 AAA Nominee', '+919821000002', true, clock_timestamp()
     where (select line from aaa_attempt_no_nomination) is not null
    returning id
  ),
  -- Positive: approving p5 as aaa WITH a matching, approved, unstamped nomination.
  decide_p5_aaa as materialized (
    select * from public.boa_acc_decide((select id from p5), true, 'aaa', 'build_show')
     where (select id from nom) is not null
  ),
  nom_after as materialized (
    select (private.boa_acc_test_read_aaa_nomination((select id from nom))).person_id as person_id
     where (select id from decide_p5_aaa) is not null
  ),

  -- Negative: deciding p2 again, now that it is already approved.
  already_decided_attempt as materialized (
    select throws_ok(
      format('select public.boa_acc_decide(%L, true, %L, %L)', (select id from decide_p2), 'crew', 'build_show'),
      'P0001',
      'already_decided',
      'deciding an already-approved row again is refused'
    ) as line
     where (select id from decide_p5_aaa) is not null
  ),

  -- Negative: no operator session at all. Clears the JWT in its own gated
  -- step, runs the attempt, then restores it in another gated step — each
  -- one a real CTE dependency, not a hoped-for UNION ALL row order.
  jwt_cleared as materialized (
    select set_config('request.jwt.claims', '', true) as claims
     where (select line from already_decided_attempt) is not null
  ),
  non_operator_attempt as materialized (
    select throws_ok(
      format('select public.boa_acc_decide(%L, true, %L, %L)', (select id from p1), 'crew', 'build_show'),
      '42501',
      'not authorized',
      'no session at all cannot decide'
    ) as line
     where (select claims from jwt_cleared) is not null
  ),
  jwt_restored as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select line from non_operator_attempt) is not null
  ),

  -- Org 2: three submitted, one already rejected — proves approve_org skips
  -- the already-decided row and only counts/approves the pending three.
  q1 as materialized (
    select public.boa_acc_submit(
      (select token from tok2), 'ACC041 Bulk One', '+919821000201', 'Crew'
    ) as id from inv2
  ),
  q2 as materialized (
    select public.boa_acc_submit(
      (select token from tok2), 'ACC041 Bulk Two', '+919821000202', 'Crew'
    ) as id from q1
  ),
  q3 as materialized (
    select public.boa_acc_submit(
      (select token from tok2), 'ACC041 Bulk Three', '+919821000203', 'Crew'
    ) as id from q2
  ),
  q4_already_rejected as materialized (
    select public.boa_acc_submit(
      (select token from tok2), 'ACC041 Bulk Already Rejected', '+919821000204', 'Crew'
    ) as id from q3
  ),
  reject_q4 as materialized (
    select * from public.boa_acc_decide((select id from q4_already_rejected), false, null, null, 'ACC-041 fixture: pre-rejected')
     where (select id from q4_already_rejected) is not null
       and (select claims from jwt_restored) is not null
  ),
  approve_org_result as materialized (
    select public.boa_acc_approve_org((select id from org2), 'crew', 'build_show') as n
     where (select id from reject_q4) is not null
  ),
  -- Fresh reads (private.boa_acc_test_read_person, 202609121801) for every
  -- row a VOLATILE call touched earlier in this same statement — a bare
  -- `select ... from public.boa_acc_person where id = ...` shares this
  -- statement's one snapshot and cannot see them. See pre_check's comment
  -- above and that migration's own header.
  q4_after as materialized (
    select private.boa_acc_test_read_person((select id from q4_already_rejected)) as r
     where (select n from approve_org_result) is not null
  ),
  q1_after as materialized (
    select private.boa_acc_test_read_person((select id from q1)) as r
     where (select n from approve_org_result) is not null
  ),
  q2_after as materialized (
    select private.boa_acc_test_read_person((select id from q2)) as r
     where (select n from approve_org_result) is not null
  ),
  q3_after as materialized (
    select private.boa_acc_test_read_person((select id from q3)) as r
     where (select n from approve_org_result) is not null
  ),

  -- Negative: approve_org refuses aaa as a bulk type, after the real bulk
  -- approve already ran (proves it does not also silently re-decide org 2).
  approve_org_aaa_attempt as materialized (
    select throws_ok(
      format('select public.boa_acc_approve_org(%L, %L, %L)', (select id from org2), 'aaa', 'build_show'),
      'P0001',
      'aaa_requires_individual_decision',
      'approve_org refuses aaa as a bulk type'
    ) as line
     where (select n from approve_org_result) is not null
  ),

  results as materialized (
    select 0 as n, plan(19) as line

    union all select 1, ok((select token_null and ref_null and type_null and validity_null from pre_check),
      'a submitted person has null pass_token/pass_ref/type_code/day_validity')

    union all select 2, ok((select status = 'approved' from decide_p2),
      'boa_acc_decide(approve) sets status = approved')
    union all select 3, ok((select pass_token is not null from decide_p2),
      'pass_token is non-null after approval')
    union all select 4, ok((select pass_ref ~ '^BOA26-[0-9]{4,}$' from decide_p2),
      'pass_ref follows the BOA26-nnnn scheme')
    union all select 5, ok((select approved_at is not null and approved_by is not null from decide_p2),
      'approved_at/approved_by are set')

    union all select 6, (select line from reject_p3_attempt_no_reason)
    union all select 7, ok((select status = 'submitted' from p3_status_after_failed_reject),
      'the failed rejection attempt left p3 untouched (still submitted)')
    union all select 8, ok((select status = 'rejected' and decision_reason = 'a real reason' from reject_p3_final),
      'rejecting with a reason succeeds and records it')

    union all select 9, (select line from aaa_attempt_no_nomination)
    union all select 10, ok((select id from decide_p5_aaa) is not null,
      'approving as aaa WITH a matching approved, unstamped nomination succeeds')
    union all select 11, is((select person_id from nom_after), (select id from decide_p5_aaa),
      'the nomination is stamped with the approved person''s id')
    union all select 12, ok((select pass_token is not null from decide_p5_aaa),
      'the aaa person also received a pass_token')

    union all select 13, (select line from already_decided_attempt)
    union all select 14, (select line from non_operator_attempt)
    union all select 15, ok((select claims from jwt_restored) is not null,
      'operator session restored for the remaining assertions')

    union all select 16, is((select n from approve_org_result), 3,
      'boa_acc_approve_org approves exactly the 3 submitted rows in org 2')
    union all select 17, is((select (r).status from q4_after), 'rejected'::public.boa_acc_person_status,
      'boa_acc_approve_org left the already-rejected row untouched')
    union all select 18, ok(
      (select
         ((a.r).status = 'approved' and (a.r).pass_token is not null and (a.r).type_code = 'crew')
         and ((b.r).status = 'approved' and (b.r).pass_token is not null and (b.r).type_code = 'crew')
         and ((c.r).status = 'approved' and (c.r).pass_token is not null and (c.r).type_code = 'crew')
       from q1_after a, q2_after b, q3_after c),
      'all three bulk-approved rows carry status/type_code/pass_token correctly'
    )
    union all select 19, (select line from approve_org_aaa_attempt)
  ),
  kept as materialized (
    select n, line from results
  ),
  clean_aaa as materialized (
    select private.boa_acc_test_wipe_aaa_nominations(array['+919821000001', '+919821000002'])
     where (select count(*) from kept) >= 0
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-041 decide'), ('ACC-041 approve-org')) v(n)
     where (select count(*) from clean_aaa) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email('acc041-decide@invalid.test')
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
