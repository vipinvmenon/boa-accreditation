-- ACC-144 · boa_acc_pass_view(), the token-first read behind /p/[passToken].
--
-- @proves: CRITICAL | an approved person's own pass_token resolves to their pass fields (name, org, role, vehicle, pass_ref, tier, day validity)
-- @proves: CRITICAL | an unknown token raises the same 'not found' (P0002) as boa_acc_org_view — never a distinguishable error
-- @proves: CRITICAL | an empty-string token also raises 'not found', not some other error
-- @proves: HIGH     | boa_acc_person's own CHECK (boa_acc_person_pass_only_when_approved, 202609110001) refuses a row that is not-approved yet still carries a pass_token — the invariant this function's "status = 'approved'" filter leans on as defence in depth actually holds at the table
--
-- Table-grant / EXECUTE coverage (anon zero, authenticated zero, service_role
-- EXECUTE) lives in privileges.test.sql, not here — same split as every other
-- token-first function (boa_acc_org_view, boa_acc_submit). The returned
-- jsonb's keys (no phone, no pass_token) are fixed by the jsonb_build_object
-- call in the migration itself, not filtered downstream — visible by reading
-- that call, not something a runtime assertion can add to.
--
-- ONE statement, cleanup in the same statement — same shape as decide.test.sql
-- and pass-send.test.sql. void-returning fixture calls (test_approve_person)
-- are gated by `count(*)` over their own CTE, never by comparing the void
-- value itself — same trick pass-send.test.sql uses.

with
  wiped as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-144 pass view')) v(n)
  ),

  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-144 pass view', 'vendor', 5, 'Pass View Contact', '+919877001440'
     where (select count(*) from wiped) >= 0
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

  -- The approved fixture: a stage pass with a vehicle plate, so the row
  -- exercises every column boa_acc_pass_view returns.
  p1 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC144 Pass Person', '+919821001440', 'Stage tech', 'KA05MJ8871'
    ) as id from inv
  ),
  approve_p1 as materialized (
    select private.boa_acc_test_approve_person((select id from p1), 'stage', false) as v
     where (select id from p1) is not null
  ),
  p1_after as materialized (
    select private.boa_acc_test_read_person((select id from p1)) as r
     where (select count(*) from approve_p1) >= 1
  ),

  -- A second person, left merely submitted — no pass_token exists for it
  -- (the table's own CHECK guarantees that). Exists only to sequence after
  -- p1_after and to keep the fixture org non-trivial.
  -- Gated on a scalar field, not `r is not null` — for a composite type,
  -- Postgres's IS NOT NULL is true only when EVERY field is non-null
  -- (43.5.6 "Row Constructor Comparison"), and boa_acc_person has plenty
  -- that stay null on an approved row (decision_reason, bms_entered_at/by).
  -- Hit this for real: it silently zeroed out p2 and everything gated on it.
  p2 as materialized (
    select public.boa_acc_submit(
      (select token from tok), 'ACC144 Submitted Only', '+919821001441', 'Crew'
    ) as id
     where (select (r).pass_token from p1_after) is not null
  ),

  -- The real call: resolve the approved person's own token. jsonb, so the
  -- fields below read as `view_ok ->> 'key'` rather than a column.
  view_ok as materialized (
    select public.boa_acc_pass_view((select (r).pass_token from p1_after)) as v
     where (select id from p2) is not null
  ),

  -- Negative: a token nobody minted.
  unknown_attempt as materialized (
    select throws_ok(
      'select public.boa_acc_pass_view(''this-token-was-never-minted-000000000000'')',
      'P0002',
      'not found',
      'an unknown token raises not found, same errcode as boa_acc_org_view'
    ) as line
     where (select count(*) from view_ok) >= 1
  ),

  -- Negative: the empty string is not a special case — still not found.
  empty_attempt as materialized (
    select throws_ok(
      'select public.boa_acc_pass_view('''')',
      'P0002',
      'not found',
      'an empty-string token raises the same not found'
    ) as line
     where (select line from unknown_attempt) is not null
  ),

  -- Defence in depth: the invariant boa_acc_pass_view's comment leans on
  -- (status = 'approved' iff pass_token is not null) is enforced at the
  -- table, not just by this function's own filter. Proven by attempting to
  -- clear pass_token on the still-approved p1 row without also changing
  -- status — the one direction that isolates this exact CHECK from the
  -- sibling boa_acc_person_rejection_needs_reason constraint.
  check_attempt as materialized (
    select throws_ok(
      format('update public.boa_acc_person set pass_token = null where id = %L', (select id from p1)),
      '23514',
      null,
      'clearing pass_token on a still-approved row is refused by boa_acc_person_pass_only_when_approved'
    ) as line
     where (select line from empty_attempt) is not null
  ),

  results as materialized (
    select 0 as n, plan(10) as line

    union all select 1, ok((select v ->> 'fullName' from view_ok) = 'ACC144 Pass Person',
      'fullName matches the approved person')
    union all select 2, ok((select v ->> 'orgName' from view_ok) = 'ACC-144 pass view',
      'orgName is the joined organisation, not an id')
    union all select 3, ok((select v ->> 'role' from view_ok) = 'Stage tech',
      'role matches')
    union all select 4, ok((select v ->> 'vehicleReg' from view_ok) = 'KA05MJ8871',
      'vehicleReg matches')
    union all select 5, ok((select v ->> 'passRef' from view_ok) is not null,
      'passRef is the printed reference, not the credential')
    union all select 6, ok((select v ->> 'typeCode' from view_ok) = 'stage',
      'typeCode is the approved tier')
    union all select 7, ok((select v ->> 'dayValidity' from view_ok) = 'build_show',
      'dayValidity matches')

    union all select 8, (select line from unknown_attempt)
    union all select 9, (select line from empty_attempt)
    union all select 10, (select line from check_attempt)
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n)
      from (values ('ACC-144 pass view')) v(n)
     where (select count(*) from kept) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
