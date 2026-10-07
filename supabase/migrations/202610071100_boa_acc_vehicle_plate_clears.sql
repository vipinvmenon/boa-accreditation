-- The vehicle gate clears on a registered plate and a sticker the officer
-- sees (Vipin, 7 Oct 2026).
--
-- KA04AF2029 was on the form and in boa_acc_person, but the vehicle gate said
-- nothing was issued to it: the gate pull carried only APPROVED people, and a
-- clearance needed an approved holder, a vehicle_sticker row in the ledger and
-- an active wristband. Vipin's rule for vehicles, chosen from three put to him:
-- "Plate + sticker by eye" — no approval and no wristband for the vehicle. The
-- driver's own band is checked at the people gate as usual. Recorded as
-- ADR-031 in docs/DECISIONS.md.
--
-- 1. boa_acc_gate_pull() also returns `vehicles`: one row per registered
--    plate whose holder is submitted or approved (never draft, rejected or
--    voided), with the holder's name, company, role and status. Name, phone,
--    role and vehicle are all this project collects (non-negotiable #9); the
--    phone is not sent here. No pass_token: an unapproved person has none
--    (non-negotiable #5) and the vehicle list never needs one.
-- 2. boa_acc_gate_vehicle(): a clearance needs a person whose registration
--    is this plate and whose status is submitted or approved, plus the
--    officer's sticker and plate checks. The wristband check and the
--    ledger sticker are no longer required; a sticker checkin id, if sent,
--    must still be that holder's active sticker for this plate.
--
-- Both bodies are their previous versions (202609301100 and 202609221201)
-- with only these changes. CREATE OR REPLACE keeps the grants, restated below.

begin;

create or replace function public.boa_acc_gate_pull()
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
  v_vehicles jsonb;
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
          -- ACC-147's offline search matches a phone by its trailing digits
          -- and the gate only ever shows the last four (gate/search.ts).
          -- Name, phone, role and vehicle are exactly what this project
          -- collects (non-negotiable #9); nothing further is added here.
          'phone', p.phone,
          'roleText', p.role_text,
          'orgName', o.name,
          'typeCode', p.type_code,
          'dayValidity', p.day_validity,
          -- ACC-197: null unless the desk marked this person for a crew T-shirt.
          'tshirtSize', p.tshirt_size,
          -- ACC-197b: when a volunteer handed the shirt over, else null.
          'tshirtGivenAt', h.occurred_at
        )
        order by p.updated_at, p.id
      ),
      '[]'::jsonb
    ),
    max(p.updated_at)
    into v_roster, v_roster_as_of
  from public.boa_acc_person p
  join public.boa_acc_org o on o.id = p.org_id
  left join public.boa_acc_tshirt_handover h on h.person_id = p.id
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

  -- 7 Oct: every registered plate the vehicle gate may clear. One row per
  -- plate; when two people name the same plate, the approved one, then the
  -- most recently updated, is the holder shown.
  with plates as (
    select distinct on (p.vehicle_reg)
      p.vehicle_reg, p.id, p.full_name, p.role_text, p.status, o.name as org_name
    from public.boa_acc_person p
    join public.boa_acc_org o on o.id = p.org_id
    where p.vehicle_reg is not null
      and p.status in ('submitted', 'approved')
    order by p.vehicle_reg, (p.status = 'approved') desc, p.updated_at desc, p.id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'plate', v.vehicle_reg,
        'personId', v.id,
        'fullName', v.full_name,
        'orgName', v.org_name,
        'roleText', v.role_text,
        'status', v.status
      )
      order by v.vehicle_reg
    ),
    '[]'::jsonb
  )
    into v_vehicles
  from plates v;

  return jsonb_build_object(
    'operatorId', v_operator.user_id,
    'operatorRole', v_operator.role::text,
    'gateLabel', 'Check-in',
    'volunteerName', v_operator.display_name,
    'roster', v_roster,
    'ledger', v_ledger,
    'rosterAsOf', v_roster_as_of,
    'ledgerAsOf', v_ledger_as_of,
    'vehicles', v_vehicles
  );
end;
$$;

comment on function public.boa_acc_gate_pull() is
  'Approved roster (incl. name, phone, role, org, pass type, crew T-shirt and when it was handed over), the latest active non-voided ledger projection, and every registered plate whose holder is submitted or approved (vehicles: plate, holder name, org, role, status — 7 Oct), for the calling operator''s own session. issuer/lead/admin only, checked in the database (private.boa_acc_gate_operator).';

revoke all on function public.boa_acc_gate_pull()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_pull()
  to authenticated;

create or replace function public.boa_acc_gate_vehicle(
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

  -- 7 Oct (ADR-031): a registered plate and the officer's own two checks.
  -- No approval, no ledger sticker and no wristband are required.
  if p_outcome = 'cleared' then
    if p_person_id is null then
      raise exception 'clearance evidence required' using errcode = '22023';
    end if;
    if (p_checks->>'sticker') is distinct from 'true'
       or (p_checks->>'plate_visual') is distinct from 'true' then
      raise exception 'sticker and plate checks required' using errcode = '22023';
    end if;

    select true, p.vehicle_reg
      into v_person_found, v_person_vehicle_reg
    from public.boa_acc_person p
    where p.id = p_person_id
      and p.status in ('submitted', 'approved');
    if v_person_found is null or v_person_vehicle_reg is distinct from v_plate then
      raise exception 'vehicle registration mismatch' using errcode = '22023';
    end if;

    -- Optional now, but a sticker that is named must be the real one.
    if p_sticker_checkin_id is not null then
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
  'Records one immutable vehicle barrier event for the calling operator''s session (issuer/lead/admin, checked in the database). Plate, clearance evidence (a submitted or approved holder of this plate, and the officers sticker and plate checks — ADR-031) and turn-away reason are validated here; the row records operator_id.';

revoke all on function public.boa_acc_gate_vehicle(uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_vehicle(uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  to authenticated;

commit;
