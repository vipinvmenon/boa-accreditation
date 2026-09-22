-- ACC-144 · The WhatsApp pass send record.
--
-- @proves: CRITICAL | a person who is not approved (no pass_token) is refused: not_approved, and nothing is recorded
-- @proves: CRITICAL | a second send while one is live is refused (already_sent) unless resend is explicit
-- @proves: CRITICAL | an approver (not lead/admin) cannot send; no operator session cannot read or send (42501)
-- @proves: HIGH     | begin hands the route the number, first name and pass token; record stores Meta's message id
-- @proves: HIGH     | webhook statuses move forward only: delivered is not undone by a late 'sent' or 'failed'
-- @proves: HIGH     | a failed resend keeps the person live (the earlier pass reached them) and shows Meta's reason
-- @proves: HIGH     | "unsent" lists approved people with no live send, including one whose queued send went stale (10 min, no message id)
-- @proves: MEDIUM   | boa_acc_pass_sends reports canSend false to an approver and true to a lead
--
-- ONE statement, cleanup in the same statement — the shape of
-- import-roster.test.sql. Every call whose outcome depends on the JWT or on
-- an earlier call is its own gated, materialized CTE; reads go through the
-- VOLATILE RPCs, which see earlier writes in this statement.

with
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-144 pass send')
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email(e)
      from (values ('acc144-lead@invalid.test'), ('acc144-approver@invalid.test')) v(e)
     where (select count(*) from wiped) >= 0
  ),

  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-144 pass send', 'vendor', 10, 'Send Contact', '+919877144000'
     where (select count(*) from wiped_email) >= 0
    returning id
  ),
  people as (
    insert into public.boa_acc_person (org_id, full_name, phone, role_text, status, submitted_at)
    select (select id from org), v.n, v.ph, 'Crew', 'submitted', clock_timestamp()
      from (values ('Asha  Rao', '+919877144001'),
                   ('Bilal Khan', '+919877144002'),
                   ('Chitra Das', '+919877144003')) v(n, ph)
    returning id, full_name
  ),
  approved as materialized (
    select private.boa_acc_test_approve_person(p.id, 'crew')
      from people p
     where p.full_name in ('Asha  Rao', 'Chitra Das')
  ),
  -- Chitra's send died between begin and Meta: queued, no message id, 11 min old.
  stale as (
    insert into public.boa_acc_pass_send (person_id, requested_at, status, status_at)
    select p.id, now() - interval '11 minutes', 'queued', now() - interval '11 minutes'
      from people p
     where p.full_name = 'Chitra Das'
       and (select count(*) from approved) = 2
    returning id
  ),

  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated', e,
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
      from (values ('acc144-lead@invalid.test'), ('acc144-approver@invalid.test')) v(e)
     where (select count(*) from stale) = 1
    returning id, email
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id,
           (case when email like 'acc144-lead%' then 'lead' else 'approver' end)::public.boa_acc_operator_role,
           'ACC-144 ' || split_part(email, '@', 1)
      from usr
    returning user_id, role
  ),

  -- ── As the approver ──────────────────────────────────────────────────
  jwt_approver as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op where role = 'approver')::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),
  approver_view as materialized (
    select public.boa_acc_pass_sends() as v
     where (select claims from jwt_approver) is not null
  ),
  approver_send as materialized (
    select throws_ok(
      format('select public.boa_acc_pass_send_begin(%L::uuid, false)', (select id from people where full_name = 'Asha  Rao')),
      '42501', 'not authorized', 'an approver cannot send a pass'
    ) as line
     where (select v from approver_view) is not null
  ),

  -- ── As the lead ──────────────────────────────────────────────────────
  jwt_lead as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op where role = 'lead')::text, 'role', 'authenticated')::text,
      true
    ) as claims
     where (select line from approver_send) is not null
  ),
  unsent_before as materialized (
    select public.boa_acc_pass_send_unsent() as ids
     where (select claims from jwt_lead) is not null
  ),
  first_send as materialized (
    select public.boa_acc_pass_send_begin((select id from people where full_name = 'Asha  Rao'), false) as b
     where (select ids from unsent_before) is not null
  ),
  second_send as materialized (
    select throws_ok(
      format('select public.boa_acc_pass_send_begin(%L::uuid, false)', (select id from people where full_name = 'Asha  Rao')),
      'P0001', 'already_sent', 'a second send while the first is queued is refused'
    ) as line
     where (select b from first_send) is not null
  ),
  unapproved_send as materialized (
    select throws_ok(
      format('select public.boa_acc_pass_send_begin(%L::uuid, true)', (select id from people where full_name = 'Bilal Khan')),
      'P0001', 'not_approved', 'a person who is not approved is refused, even with resend'
    ) as line
     where (select line from second_send) is not null
  ),
  recorded as materialized (
    select public.boa_acc_pass_send_record(((select b from first_send)->>'sendId')::uuid, 'wamid.ACC144.first', null) as r
     where (select line from unapproved_send) is not null
  ),
  unsent_after as materialized (
    select public.boa_acc_pass_send_unsent() as ids
     where (select count(*) from recorded) = 1
  ),

  -- ── As the webhook (service_role in production; this runner is postgres) ─
  hook_delivered as materialized (
    select public.boa_acc_pass_send_status('wamid.ACC144.first', 'delivered', clock_timestamp()) as moved
     where (select ids from unsent_after) is not null
  ),
  hook_late_sent as materialized (
    select public.boa_acc_pass_send_status('wamid.ACC144.first', 'sent', clock_timestamp()) as moved
     where (select moved from hook_delivered) is not null
  ),
  hook_late_failed as materialized (
    select public.boa_acc_pass_send_status('wamid.ACC144.first', 'failed', clock_timestamp(), 'late failure') as moved
     where (select moved from hook_late_sent) is not null
  ),
  hook_unknown as materialized (
    select public.boa_acc_pass_send_status('wamid.not-ours', 'read', clock_timestamp()) as moved
     where (select moved from hook_late_failed) is not null
  ),

  -- ── Resend, which Meta refuses ───────────────────────────────────────
  resent as materialized (
    select public.boa_acc_pass_send_begin((select id from people where full_name = 'Asha  Rao'), true) as b
     where (select moved from hook_unknown) is not null
  ),
  resent_failed as materialized (
    select public.boa_acc_pass_send_record(((select b from resent)->>'sendId')::uuid, null,
             'Meta 131026: Recipient is not on WhatsApp') as r
     where (select b from resent) is not null
  ),
  lead_view as materialized (
    select public.boa_acc_pass_sends() as v
     where (select count(*) from resent_failed) = 1
  ),
  asha_view as materialized (
    select x as p
      from lead_view, jsonb_array_elements(lead_view.v->'people') x
     where x->>'personId' = (select id::text from people where full_name = 'Asha  Rao')
  ),

  -- ── No session ───────────────────────────────────────────────────────
  jwt_cleared as materialized (
    select set_config('request.jwt.claims', '', true) as claims
     where (select v from lead_view) is not null
  ),
  anon_view as materialized (
    select throws_ok('select public.boa_acc_pass_sends()', '42501', 'not authorized',
      'no operator session cannot read the send record') as line
     where (select claims from jwt_cleared) is not null
  ),
  anon_send as materialized (
    select throws_ok(
      format('select public.boa_acc_pass_send_begin(%L::uuid, false)', (select id from people where full_name = 'Asha  Rao')),
      '42501', 'not authorized', 'no operator session cannot send'
    ) as line
     where (select line from anon_view) is not null
  ),

  results as materialized (
    select 0 as n, plan(21) as line

    union all select 1, (select line from approver_send)
    union all select 2, is((select (v->>'canSend')::boolean from approver_view), false,
      'an approver sees canSend = false')

    union all select 3, ok(
      (select (select id from people where full_name = 'Asha  Rao') = any(ids) from unsent_before),
      'before any send, the approved person is unsent')
    union all select 4, ok(
      (select (select id from people where full_name = 'Chitra Das') = any(ids) from unsent_before),
      'a queued send with no message id, 11 minutes old, no longer counts as live')
    union all select 5, ok(
      (select not ((select id from people where full_name = 'Bilal Khan') = any(ids)) from unsent_before),
      'a person who is not approved is never listed as unsent')

    union all select 6, is(
      (select b->>'passToken' is not null and b->>'phone' = '+919877144001' and b->>'firstName' = 'Asha' from first_send),
      true,
      'begin returns the pass token, the number and the first name (whitespace collapsed)')
    union all select 7, (select line from second_send)
    union all select 8, (select line from unapproved_send)
    union all select 9, ok(
      (select not ((select id from people where full_name = 'Asha  Rao') = any(ids)) from unsent_after),
      'once sent, the person is no longer unsent')

    union all select 10, is((select moved from hook_delivered), true, 'webhook: delivered moves the send forward')
    union all select 11, is((select moved from hook_late_sent), false, 'webhook: a late "sent" does not undo delivered')
    union all select 12, is((select moved from hook_late_failed), false, 'webhook: a late "failed" does not undo delivered')
    union all select 13, is((select moved from hook_unknown), false, 'webhook: an unknown message id changes nothing')

    union all select 14, ok((select b->>'sendId' is not null from resent), 'resend = true is allowed while a send is live')
    union all select 15, is((select (p->>'attempts')::integer from asha_view), 2, 'both attempts are recorded')
    union all select 16, is((select p->'last'->>'status' from asha_view), 'failed', 'the latest attempt shows failed')
    union all select 17, is((select p->'last'->>'failureReason' from asha_view), 'Meta 131026: Recipient is not on WhatsApp',
      'with Meta''s reason')
    union all select 18, is((select (p->>'live')::boolean from asha_view), true,
      'the earlier delivered pass keeps the person live')
    union all select 19, is((select (v->>'canSend')::boolean from lead_view), true, 'a lead sees canSend = true')

    union all select 20, (select line from anon_view)
    union all select 21, (select line from anon_send)
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-144 pass send')
     where (select count(*) from kept) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email(e)
      from (values ('acc144-lead@invalid.test'), ('acc144-approver@invalid.test')) v(e)
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
