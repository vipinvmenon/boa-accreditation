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
-- @proves: HIGH     | boa_acc_import_roster: authenticated EXECUTE only (lead/admin checked inside); anon and service_role zero
-- @proves: HIGH     | boa_acc_import_approve: authenticated EXECUTE only (lead/admin checked inside); anon and service_role zero
-- @proves: HIGH     | boa_acc_double_issues: authenticated EXECUTE only (lead/approver/admin checked inside); anon and service_role zero
-- @proves: HIGH     | boa_acc_pass_send: zero table grants for anyone; desk RPCs authenticated-only, the webhook's status write service_role-only
-- @proves: HIGH     | boa_acc_pass_view: service_role EXECUTE only, same shape as boa_acc_org_view — /p/[passToken]'s route holds the credential, not the browser
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
  select 0 as n, plan(116) as line

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
  union all select 81, function_privs_are('public',  'boa_acc_org_roster',      array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_org_roster')

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
  union all select 82, function_privs_are('public',  'boa_acc_org_roster',      array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_org_roster')
  union all select 38, function_privs_are('public',  'boa_acc_org_view',        array['text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_org_view')
  union all select 39, function_privs_are('public',  'boa_acc_submit',          array['text','text','text','text','text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_submit')
  union all select 83, function_privs_are('public',  'boa_acc_org_roster',      array['text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_org_roster')

  -- ACC-113 · The accreditation pack's access matrix (ADR-018). Read-only
  -- reference data: operators may SELECT it, anon gets nothing, and there
  -- is no write grant for anyone.
  union all select 84, table_privs_are('public', 'boa_acc_zone_access', 'anon', array[]::text[], 'anon: zero on boa_acc_zone_access')
  union all select 85, table_privs_are('public', 'boa_acc_zone_access', 'authenticated', array[]::text[], 'authenticated: no TABLE-level privilege on boa_acc_zone_access (column grants only)')
  union all select 86, column_privs_are('public', 'boa_acc_zone_access', 'requires_photo_id', 'authenticated', array['SELECT'], 'authenticated: SELECT on boa_acc_zone_access.requires_photo_id')
  union all select 87, ok((select relrowsecurity from pg_class where oid = 'public.boa_acc_zone_access'::regclass), 'RLS enabled on boa_acc_zone_access')
  union all select 88, column_privs_are('public', 'boa_acc_person', 'requested_type_code', 'anon', array[]::text[], 'anon: zero on boa_acc_person.requested_type_code')
  -- ACC-117 · the roster import. Lead/admin-checked inside the body, same
  -- shape as boa_acc_mint_invite: authenticated gets EXECUTE, anon nothing,
  -- and service_role nothing — the loader acts as a real operator's session,
  -- never as the service role, so the role check cannot be skipped.
  union all select 89, function_privs_are('public', 'boa_acc_import_roster', array['uuid','jsonb'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_import_roster')
  union all select 90, function_privs_are('public', 'boa_acc_import_roster', array['uuid','jsonb'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_import_roster')
  union all select 91, function_privs_are('public', 'boa_acc_import_roster', array['uuid','jsonb'], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_import_roster')
  union all select 92, column_privs_are('public', 'boa_acc_person', 'requested_day_validity', 'anon', array[]::text[], 'anon: zero on boa_acc_person.requested_day_validity')
  -- ACC-141 · import-and-approve. Same shape as boa_acc_import_roster: the
  -- lead/admin check is inside the body; service_role gets nothing, so the
  -- loader must act as a real operator's session.
  union all select 1411, function_privs_are('public', 'boa_acc_import_approve', array['uuid','jsonb'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_import_approve')
  union all select 1412, function_privs_are('public', 'boa_acc_import_approve', array['uuid','jsonb'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_import_approve')
  union all select 1413, function_privs_are('public', 'boa_acc_import_approve', array['uuid','jsonb'], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_import_approve')
  -- ACC-144 · the WhatsApp send record. Zero table grants for everyone,
  -- service_role included: every read and write goes through the RPCs. The
  -- desk RPCs are authenticated-only (lead/admin checked inside); the webhook's
  -- status write is service_role-only, reached after the HMAC check.
  union all select 1441, table_privs_are('public', 'boa_acc_pass_send', 'anon', array[]::text[], 'anon: zero on boa_acc_pass_send')
  union all select 1442, table_privs_are('public', 'boa_acc_pass_send', 'authenticated', array[]::text[], 'authenticated: zero on boa_acc_pass_send')
  union all select 1443, table_privs_are('public', 'boa_acc_pass_send', 'service_role', array[]::text[], 'service_role: zero on boa_acc_pass_send')
  union all select 1444, ok((select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.boa_acc_pass_send'::regclass), 'RLS enabled and forced on boa_acc_pass_send')
  union all select 1445, function_privs_are('public', 'boa_acc_pass_sends', array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_sends')
  union all select 1446, function_privs_are('public', 'boa_acc_pass_sends', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_pass_sends')
  union all select 1447, function_privs_are('public', 'boa_acc_pass_sends', array[]::text[], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_pass_sends')
  union all select 1448, function_privs_are('public', 'boa_acc_pass_send_unsent', array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_send_unsent')
  union all select 1449, function_privs_are('public', 'boa_acc_pass_send_unsent', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_pass_send_unsent')
  union all select 1450, function_privs_are('public', 'boa_acc_pass_send_unsent', array[]::text[], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_pass_send_unsent')
  union all select 1451, function_privs_are('public', 'boa_acc_pass_send_begin', array['uuid','boolean'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_send_begin')
  union all select 1452, function_privs_are('public', 'boa_acc_pass_send_begin', array['uuid','boolean'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_pass_send_begin')
  union all select 1453, function_privs_are('public', 'boa_acc_pass_send_begin', array['uuid','boolean'], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_pass_send_begin')
  union all select 1454, function_privs_are('public', 'boa_acc_pass_send_record', array['uuid','text','text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_send_record')
  union all select 1455, function_privs_are('public', 'boa_acc_pass_send_record', array['uuid','text','text'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_pass_send_record')
  union all select 1456, function_privs_are('public', 'boa_acc_pass_send_record', array['uuid','text','text'], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_pass_send_record')
  union all select 1457, function_privs_are('public', 'boa_acc_pass_send_status', array['text','text','timestamp with time zone','text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_send_status')
  union all select 1458, function_privs_are('public', 'boa_acc_pass_send_status', array['text','text','timestamp with time zone','text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_pass_send_status (webhook only)')
  union all select 1459, function_privs_are('public', 'boa_acc_pass_send_status', array['text','text','timestamp with time zone','text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_pass_send_status')
  union all select 1460, function_privs_are('private', 'boa_acc_pass_send_is_live', array['public.boa_acc_pass_send_status','text','timestamp with time zone'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_send_is_live')
  union all select 1461, function_privs_are('private', 'boa_acc_pass_send_is_live', array['public.boa_acc_pass_send_status','text','timestamp with time zone'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_pass_send_is_live')
  -- ACC-144 · boa_acc_pass_view, the token-first read behind /p/[passToken].
  -- Same shape as boa_acc_org_view: service_role only, called from the route
  -- handler with the raw pass_token, never exposed to a browser session.
  union all select 1462, function_privs_are('public', 'boa_acc_pass_view', array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_pass_view')
  union all select 1463, function_privs_are('public', 'boa_acc_pass_view', array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_pass_view')
  union all select 1464, function_privs_are('public', 'boa_acc_pass_view', array['text'], 'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_pass_view')
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
  union all select 58, function_privs_are('private', 'boa_acc_test_wipe_device', array['uuid'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_test_wipe_device')
  union all select 59, function_privs_are('private', 'boa_acc_test_wipe_device', array['uuid'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_test_wipe_device')

  -- ACC-045: mint/revoke_device are public, lead/admin-checked internally,
  -- same shape as boa_acc_create_org — anon gets nothing, authenticated gets
  -- EXECUTE (the operator-role check happens inside the function body).
  union all select 54, function_privs_are('public', 'boa_acc_mint_device', array['text','text','text','timestamptz'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_mint_device')
  union all select 55, function_privs_are('public', 'boa_acc_mint_device', array['text','text','text','timestamptz'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_mint_device')
  union all select 56, function_privs_are('public', 'boa_acc_revoke_device', array['uuid'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_revoke_device')
  union all select 57, function_privs_are('public', 'boa_acc_revoke_device', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_revoke_device')
  union all select 66, function_privs_are('public', 'boa_acc_approval_queue', array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_approval_queue')
  union all select 67, function_privs_are('public', 'boa_acc_approval_queue', array['text'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_approval_queue')
  union all select 79, function_privs_are('public', 'boa_acc_reject_org', array['uuid','text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_reject_org')
  union all select 80, function_privs_are('public', 'boa_acc_reject_org', array['uuid','text'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_reject_org')
  union all select 68, function_privs_are('public', 'boa_acc_passes', array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_passes')
  union all select 69, function_privs_are('public', 'boa_acc_passes', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_passes')

  -- ACC-049: set_operator_active is public, lead/admin-checked internally,
  -- same shape as boa_acc_mint_device/boa_acc_create_org — anon gets
  -- nothing, authenticated gets EXECUTE (the role/self/last-admin checks
  -- happen inside the function body).
  union all select 77, function_privs_are('public', 'boa_acc_set_operator_active', array['uuid','boolean'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_set_operator_active')
  union all select 78, function_privs_are('public', 'boa_acc_set_operator_active', array['uuid','boolean'], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_set_operator_active')

  -- ACC-056: gate RPCs are service-role-only route boundaries. The browser
  -- never receives EXECUTE, and anon remains completely unable to call them.
  union all select 70, function_privs_are('public', 'boa_acc_gate_pull', array['text'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_gate_pull')
  union all select 71, function_privs_are('public', 'boa_acc_gate_pull', array['text'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_gate_pull')
  union all select 72, function_privs_are('public', 'boa_acc_gate_issue', array['text', 'uuid', 'text', 'public.boa_acc_checkin_kind', 'text', 'text', 'text', 'timestamptz', 'boolean', 'text', 'uuid'], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_gate_issue')
  union all select 73, function_privs_are('public', 'boa_acc_gate_issue', array['text', 'uuid', 'text', 'public.boa_acc_checkin_kind', 'text', 'text', 'text', 'timestamptz', 'boolean', 'text', 'uuid'], 'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_gate_issue')

  -- ACC-055: vehicle events are written only through the service-role route.
  -- The device token is checked inside the SECURITY DEFINER function; neither
  -- browser role receives EXECUTE.
  union all select 74, function_privs_are('public', 'boa_acc_gate_vehicle',
    array['text','uuid','text','public.boa_acc_vehicle_outcome','uuid','uuid','jsonb','text','timestamptz'],
    'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_gate_vehicle')
  union all select 75, function_privs_are('public', 'boa_acc_gate_vehicle',
    array['text','uuid','text','public.boa_acc_vehicle_outcome','uuid','uuid','jsonb','text','timestamptz'],
    'authenticated', array[]::text[], 'authenticated: zero EXECUTE on boa_acc_gate_vehicle')
  union all select 76, function_privs_are('public', 'boa_acc_gate_vehicle',
    array['text','uuid','text','public.boa_acc_vehicle_outcome','uuid','uuid','jsonb','text','timestamptz'],
    'service_role', array['EXECUTE'], 'service_role: EXECUTE on boa_acc_gate_vehicle')

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

  -- ACC-148 · the double-issue list. A desk read, role-checked inside the
  -- body (lead/approver/admin); anon and service_role get nothing.
  union all select 480, function_privs_are('public', 'boa_acc_double_issues', array[]::text[], 'anon', array[]::text[], 'anon: zero EXECUTE on boa_acc_double_issues')
  union all select 481, function_privs_are('public', 'boa_acc_double_issues', array[]::text[], 'authenticated', array['EXECUTE'], 'authenticated: EXECUTE on boa_acc_double_issues')
  union all select 482, function_privs_are('public', 'boa_acc_double_issues', array[]::text[], 'service_role', array[]::text[], 'service_role: zero EXECUTE on boa_acc_double_issues')

  union all select 999999, l from finish() l
) t
order by n;
