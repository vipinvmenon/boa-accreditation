-- ACC-021 · The privilege lockdown.
--
-- THE DEFECT THIS PREVENTS
--
-- Supabase grants broad privileges on every new table in `public` to the `anon`
-- and `authenticated` roles by default, and the anon key SHIPS IN THE BROWSER
-- BUNDLE. Measured on this project immediately after 202609110001 applied:
-- `anon` held 70 table grants, and an unauthenticated GET to
-- /rest/v1/boa_acc_person returned HTTP 200 (with [] — RLS was holding).
--
-- RLS holding is not the same as the door being shut:
--   * the tables are discoverable — anon learns exactly what exists;
--   * boa_acc_type returned [] despite holding 3 rows, so even our own
--     reference data was reachable-but-broken rather than simply absent;
--   * one permissive policy, added by anyone in a hurry in the last fortnight,
--     turns a 200-with-no-rows into a 200 with 641 phone numbers.
--
-- Non-negotiable #4 is "anon has zero table grants and zero function EXECUTE",
-- and this migration is what makes that true. It is separate from the schema
-- migration so it can be reviewed as one unit rather than scattered across ten
-- create-table statements — boa-bar-control needed THREE follow-up migrations
-- to close holes it had left open exactly that way.
--
-- THE RULE FOR THE NEXT PERSON ADDING A TABLE OR A FUNCTION:
-- revoke in the same block that creates it. `create function` grants EXECUTE to
-- PUBLIC by default; a new table inherits the default grants above.

begin;

-- ---------------------------------------------------------------------------
-- 1. Take everything away
-- ---------------------------------------------------------------------------

revoke all on public.boa_acc_type            from anon, authenticated;
revoke all on public.boa_acc_org             from anon, authenticated;
revoke all on public.boa_acc_org_invite      from anon, authenticated;
revoke all on public.boa_acc_person          from anon, authenticated;
revoke all on public.boa_acc_device          from anon, authenticated;
revoke all on public.boa_acc_checkin         from anon, authenticated;
revoke all on public.boa_acc_vehicle_event   from anon, authenticated;
revoke all on public.boa_acc_aaa_nomination  from anon, authenticated;
revoke all on public.boa_acc_submit_throttle from anon, authenticated;
revoke all on public.boa_acc_operator        from anon, authenticated;

revoke all on sequence public.boa_acc_pass_ref_seq from anon, authenticated;

-- The private schema is server-internal. anon and authenticated have no
-- business even knowing it resolves.
revoke all on schema private from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Stop the hole reopening on the NEXT table anyone adds
-- ---------------------------------------------------------------------------
--
-- Without these, every future create-table silently re-grants to anon and this
-- migration becomes a snapshot rather than a rule.

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema private
  revoke all on tables from anon, authenticated;
alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Give back the minimum, to `authenticated` only
-- ---------------------------------------------------------------------------
--
-- EXPLICIT COLUMN LISTS, NOT `grant select on <table>`.
--
-- boa_acc_person.pass_token is the credential a QR encodes. It is omitted from
-- the grant below, so a logged-in operator's session cannot read it even by
-- accident, even through a mistaken policy. It is reachable only through
-- SECURITY DEFINER functions that decide who may see which token. ADR-002
-- records why the column is plaintext at rest and what that costs.
--
-- The same reasoning omits token_hash on the invite and device tables: a hash
-- is not a secret, but there is no screen that needs one and an unused grant is
-- an unnecessary one.

grant usage on schema public to anon, authenticated;

grant select (
  code, label, num_label, band_name, colour_dark, colour_light,
  note, zones, requestable, sort_order, created_at
) on public.boa_acc_type to authenticated;

grant select (
  id, name, kind, quota, default_type, contact_name, contact_phone,
  status, notes, created_at, updated_at
) on public.boa_acc_org to authenticated;

grant select (
  id, org_id, token_hint, label, created_at, created_by,
  last_used_at, use_count, revoked_at, expires_at
) on public.boa_acc_org_invite to authenticated;

-- NOTE THE ABSENCE OF pass_token. That absence is the control.
grant select (
  id, org_id, full_name, phone, role_text, vehicle_reg,
  status, type_code, day_validity, pass_ref,
  approved_at, approved_by, decision_reason,
  in_bms, bms_entered_at, bms_entered_by,
  submitted_at, created_at, updated_at
) on public.boa_acc_person to authenticated;

grant select (
  id, token_hint, gate_label, volunteer_name, scope,
  created_at, created_by, last_seen_at, revoked_at, expires_at
) on public.boa_acc_device to authenticated;

grant select (
  id, person_id, kind, idempotency_key, band_serial, sticker_no, vehicle_reg,
  device_id, gate_label, volunteer_name, occurred_at, posted_at,
  is_reissue, supervisor_note, voids_checkin_id
) on public.boa_acc_checkin to authenticated;

grant select (
  id, idempotency_key, plate, person_id, sticker_checkin_id, outcome, reason,
  checks, device_id, gate_label, officer_name, occurred_at, posted_at
) on public.boa_acc_vehicle_event to authenticated;

grant select (
  id, full_name, phone, org_hint, nominated_by, nominated_at,
  approved, approved_at, approved_by, person_id
) on public.boa_acc_aaa_nomination to authenticated;

grant select (user_id, role, display_name, active, created_at)
  on public.boa_acc_operator to authenticated;

-- boa_acc_submit_throttle gets NOTHING. It is written only by
-- boa_acc_submit and read by nobody; exposing hit counts would let a caller
-- measure how close they are to the limit.

-- ---------------------------------------------------------------------------
-- 4. The operator predicate
-- ---------------------------------------------------------------------------
--
-- A Supabase session is authentication, not authorisation. Every desk RPC and
-- every desk policy additionally requires an ACTIVE row in boa_acc_operator.
--
-- auth.uid() is wrapped in a scalar subquery: inside an RLS policy an
-- unwrapped call is evaluated once PER ROW, which the Supabase Postgres guide
-- measures at 100x slower on a large table. The master list is 641 rows today
-- and this costs nothing to get right now.

create function private.boa_acc_is_operator(p_roles public.boa_acc_operator_role[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.boa_acc_operator o
    where o.user_id = (select auth.uid())
      and o.active
      and (p_roles is null or o.role = any(p_roles))
  );
$$;
comment on function private.boa_acc_is_operator(public.boa_acc_operator_role[]) is
  'SECURITY DEFINER so it can read boa_acc_operator past RLS. Checks auth.uid() internally, which is what makes that safe.';

-- SECURITY DEFINER functions grant EXECUTE to PUBLIC on creation. Revoke, then
-- grant back only to `authenticated` — RLS policies need to call it, and a
-- policy is evaluated as the querying role.
revoke all on function private.boa_acc_is_operator(public.boa_acc_operator_role[])
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.boa_acc_is_operator(public.boa_acc_operator_role[])
  to authenticated;

-- The token helpers stay server-only. Nothing outside a SECURITY DEFINER RPC
-- has any reason to mint or hash a token.
revoke all on function private.boa_acc_new_token() from public, anon, authenticated;
revoke all on function private.boa_acc_hash_token(text) from public, anon, authenticated;
revoke all on function private.boa_acc_reject_mutation() from public, anon, authenticated;
revoke all on function private.boa_acc_touch_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Read policies for the desk
-- ---------------------------------------------------------------------------
--
-- `to authenticated`, never `auth.role() = 'authenticated'`. auth.role() is
-- deprecated and, worse, it breaks silently if anonymous sign-ins are ever
-- enabled: an anonymous user carries the `authenticated` Postgres role and
-- would pass the check without being signed in.
--
-- There are NO insert, update or delete policies anywhere, deliberately. Every
-- write goes through a SECURITY DEFINER RPC that validates first. Granting a
-- write policy would bypass the validation those RPCs exist to enforce.

create policy boa_acc_type_read on public.boa_acc_type
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_org_read on public.boa_acc_org
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_org_invite_read on public.boa_acc_org_invite
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_person_read on public.boa_acc_person
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_device_read on public.boa_acc_device
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_checkin_read on public.boa_acc_checkin
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_vehicle_event_read on public.boa_acc_vehicle_event
  for select to authenticated using (private.boa_acc_is_operator());

create policy boa_acc_aaa_nomination_read on public.boa_acc_aaa_nomination
  for select to authenticated using (private.boa_acc_is_operator());

-- An operator may always see their own row, so the app can render "signed in
-- as" before it knows anything else. Otherwise: leads and admins only.
create policy boa_acc_operator_read on public.boa_acc_operator
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.boa_acc_is_operator(array['lead','admin']::public.boa_acc_operator_role[])
  );

commit;
