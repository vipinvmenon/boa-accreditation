-- ACC-022 · Prove non-negotiable #4: anon has zero table grants and zero
-- function EXECUTE. And prove ADR-002's compensating control: authenticated
-- can read a person's name but never their pass_token, at the COLUMN level —
-- table_privs_are cannot see that distinction, only column_privs_are can.
--
-- @proves: CRITICAL | anon holds zero privileges on every boa_acc_ table
-- @proves: CRITICAL | anon holds zero EXECUTE on every boa_acc_ function
-- @proves: CRITICAL | authenticated cannot select pass_token on boa_acc_person
-- @proves: HIGH     | authenticated CAN select the columns the desk actually needs
-- @proves: HIGH     | authenticated gets EXECUTE on boa_acc_is_operator and boa_acc_mint_invite only
-- @proves: HIGH     | boa_acc_submit_throttle is unreadable by anyone but postgres
-- @proves: MEDIUM   | RLS is enabled on every boa_acc_ table
--
-- NOT YET COVERED: "through the views" (ACC-022's own title says so). There
-- are no views yet — boa_acc_person_state and boa_acc_sticker_current land in
-- a later task (docs/DATA-MODEL.md). This file gets extended when they exist;
-- claiming that coverage now would violate non-negotiable #10.
--
-- ONE statement only — UNION ALL of individually-numbered branches, ORDER BY
-- that number — because scripts/db-test.mjs, like scripts/db-push.mjs, can
-- only see the rows of the LAST statement it sends (there is no psql /
-- pg_prove here). finish() is appended unordered after: it returns zero rows
-- on a clean pass and diagnostic rows only on failure, so where it lands
-- among ties does not change what a human reads.
--
-- DELIBERATELY NOT wrapped in begin;/rollback;. Nothing here mutates
-- anything (no GRANT, no INSERT), so there is nothing to roll back — and
-- wrapping it made this the SECOND-to-last statement, not the last. Through
-- node-postgres (the CI transport) that meant runSql returned ROLLBACK's
-- empty result instead of the SELECT's, and the runner read "zero rows,
-- zero failures found" as a pass. Caught by running this file through BOTH
-- transports and noticing one produced no output at all.

select line from (
  select 0 as n, plan(53) as line

  -- ---------------------------------------------------------------------
  -- anon: nothing, anywhere. This is what ACC-021 fixed after the schema
  -- migration first landed with 70 accidental grants.
  -- ---------------------------------------------------------------------
  union all select 1, table_privs_are('public', 'boa_acc_type',            'anon', array[]::text[], 'anon: zero on boa_acc_type')
  union all select 2, table_privs_are('public', 'boa_acc_org',             'anon', array[]::text[], 'anon: zero on boa_acc_org')
  union all select 3, table_privs_are('public', 'boa_acc_org_invite',      'anon', array[]::text[], 'anon: zero on boa_acc_org_invite')
  union all select 4, table_privs_are('public', 'boa_acc_person',          'anon', array[]::text[], 'anon: zero on boa_acc_person')
  union all select 5, table_privs_are('public', 'boa_acc_device',          'anon', array[]::text[], 'anon: zero on boa_acc_device')
  union all select 6, table_privs_are('public', 'boa_acc_checkin',         'anon', array[]::text[], 'anon: zero on boa_acc_checkin')
  union all select 7, table_privs_are('public', 'boa_acc_vehicle_event',   'anon', array[]::text[], 'anon: zero on boa_acc_vehicle_event')
  union all select 8, table_privs_are('public', 'boa_acc_aaa_nomination',  'anon', array[]::text[], 'anon: zero on boa_acc_aaa_nomination')
  union all select 9, table_privs_are('public', 'boa_acc_submit_throttle', 'anon', array[]::text[], 'anon: zero on boa_acc_submit_throttle')
  union all select 10, table_privs_are('public', 'boa_acc_operator',       'anon', array[]::text[], 'anon: zero on boa_acc_operator')

  union all select 11, function_privs_are('private', 'boa_acc_new_token',       array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_new_token')
  union all select 12, function_privs_are('private', 'boa_acc_hash_token',      array['text'],    'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_hash_token')
  union all select 13, function_privs_are('private', 'boa_acc_reject_mutation', array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_reject_mutation')
  union all select 14, function_privs_are('private', 'boa_acc_touch_updated_at',array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_touch_updated_at')
  union all select 15, function_privs_are('private', 'boa_acc_is_operator',     array['public.boa_acc_operator_role[]'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_is_operator')
  union all select 30, function_privs_are('private', 'boa_acc_live_invite',     array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_live_invite')
  union all select 31, function_privs_are('public',  'boa_acc_mint_invite',     array['uuid','text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_mint_invite')
  union all select 32, function_privs_are('public',  'boa_acc_org_view',        array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_org_view')
  union all select 33, function_privs_are('public',  'boa_acc_submit',          array['text','text','text','text','text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_submit')

  -- ---------------------------------------------------------------------
  -- authenticated: desk read grants, EXECUTE on is_operator (policies) and
  -- mint_invite (desk RPC). org_view / submit are service_role only — ADR-004.
  -- The token helpers and the mutation guard stay server-only.
  -- ---------------------------------------------------------------------
  union all select 16, function_privs_are('private', 'boa_acc_new_token',       array[]::text[], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_new_token')
  union all select 17, function_privs_are('private', 'boa_acc_hash_token',      array['text'],    'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_hash_token')
  union all select 18, function_privs_are('private', 'boa_acc_reject_mutation', array[]::text[], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_reject_mutation')
  union all select 19, function_privs_are('private', 'boa_acc_is_operator',     array['public.boa_acc_operator_role[]'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_is_operator')
  union all select 34, function_privs_are('private', 'boa_acc_live_invite',     array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_live_invite')
  union all select 35, function_privs_are('public',  'boa_acc_mint_invite',     array['uuid','text'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_mint_invite')
  union all select 36, function_privs_are('public',  'boa_acc_org_view',        array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_org_view')
  union all select 37, function_privs_are('public',  'boa_acc_submit',          array['text','text','text','text','text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_submit')
  union all select 38, function_privs_are('public',  'boa_acc_org_view',        array['text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_org_view')
  union all select 39, function_privs_are('public',  'boa_acc_submit',          array['text','text','text','text','text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_submit')
  union all select 40, function_privs_are('private', 'boa_acc_wipe_org', array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_wipe_org')
  union all select 41, function_privs_are('private', 'boa_acc_wipe_org', array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_wipe_org')
  union all select 42, function_privs_are('private', 'boa_acc_revoke_invite', array['uuid'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_revoke_invite')
  union all select 43, function_privs_are('private', 'boa_acc_revoke_invite', array['uuid'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_revoke_invite')
  union all select 44, function_privs_are('private', 'boa_acc_wipe_email', array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_wipe_email')
  union all select 45, function_privs_are('private', 'boa_acc_wipe_email', array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_wipe_email')

  -- ACC-033: the dashboard is a desk read, EXECUTE for authenticated only —
  -- same shape as boa_acc_create_org, anon gets nothing.
  union all select 46, function_privs_are('public', 'boa_acc_desk_dashboard', array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_desk_dashboard')
  union all select 47, function_privs_are('public', 'boa_acc_desk_dashboard', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_desk_dashboard')

  -- Test-only fixtures (202609120011): the test runner calls these directly
  -- as table owner, bypassing EXECUTE grants entirely, but every client role
  -- still gets zero, same as boa_acc_wipe_org/wipe_email.
  union all select 48, function_privs_are('private', 'boa_acc_test_approve_person', array['uuid', 'public.boa_acc_type_code', 'boolean'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_test_approve_person')
  union all select 49, function_privs_are('private', 'boa_acc_test_approve_person', array['uuid', 'public.boa_acc_type_code', 'boolean'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_test_approve_person')
  union all select 50, function_privs_are('private', 'boa_acc_test_reject_person', array['uuid', 'text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_test_reject_person')
  union all select 51, function_privs_are('private', 'boa_acc_test_reject_person', array['uuid', 'text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_test_reject_person')
  union all select 52, function_privs_are('private', 'boa_acc_test_wipe_aaa_nominations', array['text[]'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_test_wipe_aaa_nominations')
  union all select 53, function_privs_are('private', 'boa_acc_test_wipe_aaa_nominations', array['text[]'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_test_wipe_aaa_nominations')

  -- The one column that must never be readable by a logged-in session —
  -- ADR-002's compensating control, checked at the column, not the table.
  union all select 20, column_privs_are('public', 'boa_acc_person', 'pass_token', 'authenticated', array[]::text[], 'authenticated: zero privileges on boa_acc_person.pass_token')
  union all select 21, column_privs_are('public', 'boa_acc_person', 'full_name',  'authenticated', array['SELECT'], 'authenticated: SELECT on boa_acc_person.full_name')
  union all select 22, column_privs_are('public', 'boa_acc_org_invite', 'token_hash', 'authenticated', array[]::text[], 'authenticated: zero privileges on boa_acc_org_invite.token_hash')
  union all select 23, column_privs_are('public', 'boa_acc_device', 'token_hash', 'authenticated', array[]::text[], 'authenticated: zero privileges on boa_acc_device.token_hash')

  -- The throttle table: written by boa_acc_submit, read by
  -- nobody. Exposing hit counts would let a caller measure how close it is
  -- to the limit.
  union all select 24, table_privs_are('public', 'boa_acc_submit_throttle', 'authenticated', array[]::text[], 'authenticated: zero on boa_acc_submit_throttle')

  -- ---------------------------------------------------------------------
  -- RLS is actually on, not just assumed from the migration text.
  -- ---------------------------------------------------------------------
  union all select 25, ok((select relrowsecurity from pg_class where oid = 'public.boa_acc_person'::regclass), 'RLS enabled on boa_acc_person')
  union all select 26, ok((select relrowsecurity from pg_class where oid = 'public.boa_acc_checkin'::regclass), 'RLS enabled on boa_acc_checkin')
  union all select 27, ok((select relrowsecurity from pg_class where oid = 'public.boa_acc_vehicle_event'::regclass), 'RLS enabled on boa_acc_vehicle_event')
  union all select 28, ok((select relrowsecurity from pg_class where oid = 'public.boa_acc_submit_throttle'::regclass), 'RLS enabled on boa_acc_submit_throttle')

  -- The ledger's immutability trigger actually exists and is ENABLE ALWAYS —
  -- "always" matters because a table owner otherwise bypasses a plain trigger.
  union all select 29, ok(
    exists(
      select 1 from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      where c.relname = 'boa_acc_checkin'
        and t.tgname = 'boa_acc_checkin_immutable'
        and t.tgenabled = 'A'
    ),
    'boa_acc_checkin_immutable is ENABLE ALWAYS'
  )

  union all select 999999, l from finish() l
) t
order by n;
