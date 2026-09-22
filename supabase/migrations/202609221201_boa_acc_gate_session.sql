-- ACC-150 (2 of 2) · Gate RPCs authorise the operator's session; device
-- tokens are retired (ADR-020, superseding the device-token half of ADR-002).
--
-- THE DEFECT THIS PREVENTS
--
-- Wristbands are handed out by up to ten people. Under ACC-056 the gate was
-- authorised by a pasted device token: one shared secret per phone, a ledger
-- row that named a "volunteer" string typed at mint time, and a route that
-- called the gate RPCs with the SERVICE ROLE. A phone passed hand to hand
-- could not say who issued a band, and the service-role route meant the
-- database could not tell one issuer from another. Now:
--
--  * an issuer is a person with a Supabase login and an active
--    boa_acc_operator row whose role is `issuer` (added in 202609221200);
--  * /api/gate/* call these RPCs with the operator's OWN cookie session
--    (lib/supabase-server.ts), never the service role;
--  * each RPC resolves auth.uid() to an ACTIVE operator whose role is
--    issuer, lead or admin, inside the database (non-negotiable #3). An
--    approver is a desk role and is refused at the gate;
--  * every new ledger and vehicle-event row records operator_id, enforced
--    by a CHECK constraint, not by the RPC remembering to.
--
-- THE SECOND DEFECT: "ANY OPERATOR" MUST NOT MEAN "ANY ROLE"
--
-- private.boa_acc_is_operator() with no argument was the predicate for every
-- desk read policy (person, org, invite, checkin, vehicle_event, device,
-- type, aaa_nomination, zone_access) and for decide, approve_org,
-- reject_org, dashboard, passes, approval_queue, list/nominate AAA. It meant
-- "any active operator" because every role was a desk role. Adding `issuer`
-- to the enum would silently have granted issuers all of that. It is
-- redefined here as an ALLOWLIST of desk roles — lead, approver, admin — so
-- a role added later is refused by default rather than admitted by default.
-- An explicit role array keeps its old meaning exactly.
--
-- WHAT WAS REJECTED
--
--  * Rewriting each of the ~20 call sites to pass a desk-role array. Twenty
--    places to get right, and the next RPC written with the bare form would
--    reopen the hole. One predicate, fail-closed, is the control.
--  * Dropping the device-token RPCs and boa_acc_device. History stays: old
--    ledger rows reference boa_acc_device(id), and dropping the functions
--    buys nothing that revoking EXECUTE from every client role does not.
--    They remain callable only by the table owner (tests), and a device
--    write now fails the operator_id CHECK anyway.
--  * A foreign key from operator_id to auth.users. The ledger is append-only
--    under an ENABLE ALWAYS trigger (non-negotiable #2), so the column can
--    never be nulled; a FK would make an issuer's auth account impossible
--    to delete (private.boa_acc_wipe_email nulls every other attribution
--    column for exactly that reason). The id is written only by the
--    SECURITY DEFINER RPCs below, from auth.uid() of an operator row that
--    was active at that moment, and volunteer_name/officer_name keep the
--    display name as it was when the band was handed over.
--  * Casting the literal 'issuer' to the enum anywhere in this file. Roles
--    are compared as text, so this migration also applies in the same
--    transaction as 202609221200 (a rolled-back verification run), where
--    the new label is not yet usable.
--
-- NOT VALID, ON PURPOSE
--
-- The two `*_operator_required` CHECKs are added NOT VALID: PostgreSQL then
-- enforces them on every NEW row but does not scan existing ones. Rows
-- written under device tokens before today have operator_id NULL and must
-- stay exactly as they are (non-negotiable #2). Never VALIDATE these
-- constraints; it would fail on history, which is the point.

begin;

-- ---------------------------------------------------------------------------
-- 1. Attribution: who acted, on every new row
-- ---------------------------------------------------------------------------

alter table public.boa_acc_checkin
  add column operator_id uuid;
alter table public.boa_acc_checkin
  alter column device_id drop not null;
alter table public.boa_acc_checkin
  add constraint boa_acc_checkin_operator_required
  check (operator_id is not null) not valid;
comment on column public.boa_acc_checkin.operator_id is
  'auth.users id of the logged-in operator (issuer/lead/admin) who recorded this row, from auth.uid() inside boa_acc_gate_issue. NULL only on rows written under a device token before ACC-150; boa_acc_checkin_operator_required (NOT VALID) refuses NULL on every new row. No FK: the row is immutable and must outlive the account.';
comment on column public.boa_acc_checkin.device_id is
  'Device-token era only (ACC-056, retired by ACC-150). NULL on every row written since; kept for history.';

alter table public.boa_acc_vehicle_event
  add column operator_id uuid;
alter table public.boa_acc_vehicle_event
  alter column device_id drop not null;
alter table public.boa_acc_vehicle_event
  add constraint boa_acc_vehicle_event_operator_required
  check (operator_id is not null) not valid;
comment on column public.boa_acc_vehicle_event.operator_id is
  'auth.users id of the logged-in operator who recorded this barrier event, from auth.uid() inside boa_acc_gate_vehicle. NULL only on device-token-era rows; boa_acc_vehicle_event_operator_required (NOT VALID) refuses NULL on every new row.';

-- The desk reads these tables through column grants (202609110002). A new
-- column is not covered by an existing column grant, so name it.
grant select (operator_id) on public.boa_acc_checkin to authenticated;
grant select (operator_id) on public.boa_acc_vehicle_event to authenticated;

-- ---------------------------------------------------------------------------
-- 2. "Any operator" means any DESK operator
-- ---------------------------------------------------------------------------

create or replace function private.boa_acc_is_operator(
  p_roles public.boa_acc_operator_role[] default null
)
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
      and case
            when p_roles is null then o.role::text in ('lead', 'approver', 'admin')
            else o.role::text = any (p_roles::text[])
          end
  );
$$;

comment on function private.boa_acc_is_operator(public.boa_acc_operator_role[]) is
  'SECURITY DEFINER so it can read boa_acc_operator past RLS; checks auth.uid() internally. With no argument: an active DESK operator (lead, approver, admin) — an allowlist, so the gate-only `issuer` role and any role added later are refused by every desk policy and desk RPC that uses the bare form. With an array: an active operator holding one of those roles.';

-- create or replace keeps the existing grants (202609110002: none for
-- public/anon, EXECUTE for authenticated, whose RLS policies call it).
-- Restated so this file alone says what is true; nothing else is changed.
revoke all on function private.boa_acc_is_operator(public.boa_acc_operator_role[])
  from public, anon;
grant execute on function private.boa_acc_is_operator(public.boa_acc_operator_role[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The gate predicate
-- ---------------------------------------------------------------------------

create function private.boa_acc_gate_operator()
returns public.boa_acc_operator
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_operator public.boa_acc_operator;
begin
  select o.user_id, o.role, o.display_name, o.active, o.created_at
    into v_operator
  from public.boa_acc_operator o
  where o.user_id = (select auth.uid())
    and o.active
    and o.role::text in ('issuer', 'lead', 'admin');

  if v_operator.user_id is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return v_operator;
end;
$$;

comment on function private.boa_acc_gate_operator() is
  'The gate''s authorisation: the caller''s active boa_acc_operator row if its role is issuer, lead or admin; otherwise 42501. Approvers are desk-only. Called only from inside the gate RPCs.';

revoke all on function private.boa_acc_gate_operator()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Session-authorised gate RPCs
-- ---------------------------------------------------------------------------
--
-- Same names as the ACC-056/ACC-055 functions, new signatures (no device
-- token), so PostgREST resolves `rpc('boa_acc_gate_pull')` with no
-- arguments to the session version only: every retired overload requires
-- p_device_token, which has no default, and PostgREST matches overloads by
-- argument NAME. (Positional SQL made only of untyped literals can be
-- ambiguous between the two; type the first argument, as the tests do.) The bodies are the device-era
-- bodies with the device lookup and scope checks replaced by the operator
-- predicate; the ledger projection, the clamp on occurred_at, blank-serial
-- handling and idempotent replay are unchanged. No `select *` and no
-- `returning *` into a row type (non-negotiable #8): each reads the columns
-- it uses, and the reply is built from the stored row by idempotency key.

create function public.boa_acc_gate_pull()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operator public.boa_acc_operator;
  v_roster jsonb;
  v_ledger jsonb;
  v_roster_as_of timestamptz;
  v_ledger_as_of timestamptz;
begin
  v_operator := private.boa_acc_gate_operator();

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'passToken', p.pass_token,
          'personId', p.id,
          'orgId', p.org_id,
          'status', p.status,
          'vehicleReg', p.vehicle_reg,
          'updatedAt', p.updated_at,
          'fullName', p.full_name,
          'roleText', p.role_text,
          'orgName', o.name,
          'typeCode', p.type_code,
          'dayValidity', p.day_validity
        )
        order by p.updated_at, p.id
      ),
      '[]'::jsonb
    ),
    max(p.updated_at)
    into v_roster, v_roster_as_of
  from public.boa_acc_person p
  join public.boa_acc_org o on o.id = p.org_id
  where p.status = 'approved';

  with active_issues as (
    select distinct on (c.person_id, c.kind)
      c.id, c.person_id, c.kind, c.occurred_at, c.band_serial,
      c.sticker_no, c.gate_label, c.volunteer_name, c.is_reissue
    from public.boa_acc_checkin c
    where c.kind in ('wristband', 'vehicle_sticker')
      and not exists (
        select 1
        from public.boa_acc_checkin v
        where v.kind = 'void'
          and v.voids_checkin_id = c.id
      )
    order by c.person_id, c.kind, c.occurred_at desc, c.posted_at desc, c.id desc
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'personId', a.person_id,
          'kind', a.kind,
          'occurredAt', a.occurred_at,
          'bandSerial', a.band_serial,
          'stickerNo', a.sticker_no,
          'gateLabel', a.gate_label,
          'volunteerName', a.volunteer_name,
          'isReissue', a.is_reissue
        )
        order by a.occurred_at, a.id
      ),
      '[]'::jsonb
    ),
    max(a.occurred_at)
    into v_ledger, v_ledger_as_of
  from active_issues a;

  return jsonb_build_object(
    'operatorId', v_operator.user_id,
    'operatorRole', v_operator.role::text,
    'gateLabel', 'Check-in',
    'volunteerName', v_operator.display_name,
    'roster', v_roster,
    'ledger', v_ledger,
    'rosterAsOf', v_roster_as_of,
    'ledgerAsOf', v_ledger_as_of
  );
end;
$$;

comment on function public.boa_acc_gate_pull() is
  'Approved roster (incl. name, role, org, pass type) and the latest active non-voided ledger projection, for the calling operator''s own session. issuer/lead/admin only, checked in the database (private.boa_acc_gate_operator).';

revoke all on function public.boa_acc_gate_pull()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_pull()
  to authenticated;

create function public.boa_acc_gate_issue(
  p_idempotency_key   uuid,
  p_pass_token        text,
  p_kind              public.boa_acc_checkin_kind,
  p_band_serial       text default null,
  p_sticker_no        text default null,
  p_vehicle_reg       text default null,
  p_occurred_at       timestamptz default null,
  p_is_reissue        boolean default false,
  p_supervisor_note   text default null,
  p_voids_checkin_id  uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operator public.boa_acc_operator;
  v_person_id uuid;
  v_person_vehicle_reg text;
  v_target_id uuid;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
  v_occurred_at timestamptz;
  v_band_serial text := nullif(btrim(coalesce(p_band_serial, '')), '');
  v_sticker_no text := nullif(btrim(coalesce(p_sticker_no, '')), '');
  v_vehicle_reg text := nullif(btrim(coalesce(p_vehicle_reg, '')), '');
begin
  v_operator := private.boa_acc_gate_operator();

  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;

  if p_kind = 'void' and p_voids_checkin_id is null then
    raise exception 'void target required' using errcode = '22023';
  end if;

  select p.id, p.vehicle_reg
    into v_person_id, v_person_vehicle_reg
  from public.boa_acc_person p
  where p.pass_token = p_pass_token
    and p.status = 'approved';

  if v_person_id is null then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  if p_kind = 'vehicle_sticker' then
    if v_person_vehicle_reg is null or v_vehicle_reg is distinct from v_person_vehicle_reg then
      raise exception 'vehicle registration mismatch' using errcode = '22023';
    end if;
  end if;

  if p_kind = 'void' then
    select c.id into v_target_id
    from public.boa_acc_checkin c
    where c.id = p_voids_checkin_id
      and c.person_id = v_person_id
      and c.kind <> 'void';
    if v_target_id is null then
      raise exception 'void target not found' using errcode = 'P0002';
    end if;
  end if;

  v_occurred_at := greatest(
    v_now - interval '15 minutes',
    least(coalesce(p_occurred_at, v_now), v_now + interval '15 minutes')
  );

  insert into public.boa_acc_checkin (
    person_id, kind, idempotency_key, band_serial, sticker_no, vehicle_reg,
    device_id, operator_id, gate_label, volunteer_name, occurred_at,
    is_reissue, supervisor_note, voids_checkin_id
  ) values (
    v_person_id, p_kind, p_idempotency_key,
    case when p_kind = 'wristband' then v_band_serial end,
    case when p_kind = 'vehicle_sticker' then v_sticker_no end,
    case when p_kind = 'vehicle_sticker' then v_vehicle_reg end,
    null, v_operator.user_id, 'Check-in', v_operator.display_name, v_occurred_at,
    coalesce(p_is_reissue, false), nullif(btrim(coalesce(p_supervisor_note, '')), ''),
    p_voids_checkin_id
  )
  on conflict (idempotency_key) do nothing;

  -- The row just written, or the one an earlier replay of this key wrote.
  -- Each PL/pgSQL statement takes a fresh snapshot, so the insert above is
  -- visible here either way.
  select jsonb_build_object(
    'id', c.id,
    'personId', c.person_id,
    'kind', c.kind,
    'idempotencyKey', c.idempotency_key,
    'bandSerial', c.band_serial,
    'stickerNo', c.sticker_no,
    'vehicleReg', c.vehicle_reg,
    'operatorId', c.operator_id,
    'gateLabel', c.gate_label,
    'volunteerName', c.volunteer_name,
    'occurredAt', c.occurred_at,
    'postedAt', c.posted_at,
    'isReissue', c.is_reissue,
    'supervisorNote', c.supervisor_note,
    'voidsCheckinId', c.voids_checkin_id
  )
    into v_result
  from public.boa_acc_checkin c
  where c.idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

comment on function public.boa_acc_gate_issue(uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid) is
  'Appends one gate issue, reissue or void for the calling operator''s session (issuer/lead/admin, checked in the database). The row records operator_id and the operator''s display name. Serials stay caller-typed and may be blank. A replayed idempotency key returns the existing ledger row, whoever wrote it.';

revoke all on function public.boa_acc_gate_issue(uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_issue(uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid)
  to authenticated;

create function public.boa_acc_gate_vehicle(
  p_idempotency_key    uuid,
  p_plate              text,
  p_outcome            public.boa_acc_vehicle_outcome,
  p_person_id          uuid default null,
  p_sticker_checkin_id uuid default null,
  p_checks             jsonb default '{}'::jsonb,
  p_reason             text default null,
  p_occurred_at        timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operator public.boa_acc_operator;
  v_result jsonb;
  v_person_vehicle_reg text;
  v_person_found boolean;
  v_sticker_id uuid;
  v_wristband boolean;
  v_plate text := upper(regexp_replace(btrim(coalesce(p_plate, '')), '\s', '', 'g'));
  v_now timestamptz := clock_timestamp();
  v_occurred_at timestamptz;
begin
  v_operator := private.boa_acc_gate_operator();

  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;
  if v_plate !~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$' then
    raise exception 'invalid plate' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_checks, '{}'::jsonb)) <> 'object' then
    raise exception 'checks must be an object' using errcode = '22023';
  end if;

  if p_outcome = 'turned_away'
     and length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'turn-away reason required' using errcode = '22023';
  end if;

  if p_outcome = 'cleared' then
    if p_person_id is null or p_sticker_checkin_id is null then
      raise exception 'clearance evidence required' using errcode = '22023';
    end if;
    if (p_checks->>'sticker') is distinct from 'true'
       or (p_checks->>'wristband') is distinct from 'true'
       or (p_checks->>'plate_visual') is distinct from 'true' then
      raise exception 'all vehicle checks required' using errcode = '22023';
    end if;

    select true, p.vehicle_reg
      into v_person_found, v_person_vehicle_reg
    from public.boa_acc_person p
    where p.id = p_person_id
      and p.status = 'approved';
    if v_person_found is null or v_person_vehicle_reg is distinct from v_plate then
      raise exception 'vehicle registration mismatch' using errcode = '22023';
    end if;

    select c.id into v_sticker_id
    from public.boa_acc_checkin c
    where c.id = p_sticker_checkin_id
      and c.person_id = p_person_id
      and c.kind = 'vehicle_sticker'
      and c.vehicle_reg = v_plate
      and not exists (
        select 1
        from public.boa_acc_checkin v
        where v.kind = 'void'
          and v.voids_checkin_id = c.id
      );
    if v_sticker_id is null then
      raise exception 'active sticker not found' using errcode = 'P0002';
    end if;

    select exists (
      select 1
      from public.boa_acc_checkin c
      where c.person_id = p_person_id
        and c.kind = 'wristband'
        and not exists (
          select 1
          from public.boa_acc_checkin v
          where v.kind = 'void'
            and v.voids_checkin_id = c.id
        )
    ) into v_wristband;
    if not v_wristband then
      raise exception 'active wristband not found' using errcode = '22023';
    end if;
  end if;

  v_occurred_at := greatest(
    v_now - interval '15 minutes',
    least(coalesce(p_occurred_at, v_now), v_now + interval '15 minutes')
  );

  insert into public.boa_acc_vehicle_event (
    idempotency_key, plate, person_id, sticker_checkin_id, outcome,
    reason, checks, device_id, operator_id, gate_label, officer_name, occurred_at
  ) values (
    p_idempotency_key, v_plate, p_person_id, p_sticker_checkin_id, p_outcome,
    nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_checks, '{}'::jsonb),
    null, v_operator.user_id, 'Vehicle gate', v_operator.display_name, v_occurred_at
  )
  on conflict (idempotency_key) do nothing;

  select jsonb_build_object(
    'id', e.id,
    'idempotencyKey', e.idempotency_key,
    'plate', e.plate,
    'personId', e.person_id,
    'stickerCheckinId', e.sticker_checkin_id,
    'outcome', e.outcome,
    'reason', e.reason,
    'checks', e.checks,
    'operatorId', e.operator_id,
    'gateLabel', e.gate_label,
    'officerName', e.officer_name,
    'occurredAt', e.occurred_at,
    'postedAt', e.posted_at
  )
    into v_result
  from public.boa_acc_vehicle_event e
  where e.idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

comment on function public.boa_acc_gate_vehicle(uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz) is
  'Records one immutable vehicle barrier event for the calling operator''s session (issuer/lead/admin, checked in the database). Plate, clearance evidence and turn-away reason are validated here; the row records operator_id.';

revoke all on function public.boa_acc_gate_vehicle(uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_vehicle(uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Retire the device-token path: no client role may execute any of it
-- ---------------------------------------------------------------------------
--
-- boa_acc_device and every device-era ledger row stay. Only the ability to
-- mint a token, revoke one, or authenticate with one is withdrawn.

revoke all on function public.boa_acc_gate_pull(text)
  from public, anon, authenticated, service_role;
revoke all on function public.boa_acc_gate_issue(text, uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.boa_acc_gate_vehicle(text, uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.boa_acc_mint_device(text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.boa_acc_revoke_device(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.boa_acc_gate_device(text)
  from public, anon, authenticated, service_role;

comment on function public.boa_acc_gate_pull(text) is
  'RETIRED by ACC-150 (ADR-020): device-token pull. No client role holds EXECUTE. Kept, not dropped, so history and the migration record stay intact; see boa_acc_gate_pull().';
comment on function public.boa_acc_gate_issue(text, uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid) is
  'RETIRED by ACC-150 (ADR-020): device-token issue. No client role holds EXECUTE, and a row it tried to write would now fail boa_acc_checkin_operator_required.';
comment on function public.boa_acc_gate_vehicle(text, uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz) is
  'RETIRED by ACC-150 (ADR-020): device-token vehicle event. No client role holds EXECUTE, and a row it tried to write would now fail boa_acc_vehicle_event_operator_required.';
comment on function public.boa_acc_mint_device(text, text, text, timestamptz) is
  'RETIRED by ACC-150 (ADR-020): issuers log in as people. No client role holds EXECUTE.';
comment on function public.boa_acc_revoke_device(uuid) is
  'RETIRED by ACC-150 (ADR-020). No client role holds EXECUTE. To stop an issuer, deactivate their operator row (boa_acc_set_operator_active).';

commit;
