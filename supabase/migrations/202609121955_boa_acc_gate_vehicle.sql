-- ACC-055 · vehicle barrier events.
--
-- The vehicle gate is not a second check-in ledger. A truck may cross the
-- barrier repeatedly, so each crossing is an immutable boa_acc_vehicle_event.
-- The device token is the credential; client-side checks are only a usability
-- affordance. The function verifies the device, plate, and (for a clear)
-- the active sticker, wristband, and officer's visual plate check.
--
-- The existing ACC-056 gate RPCs are already live, but this function is the
-- missing vehicle-event write path. It deliberately does not grant table
-- INSERT to a client role and does not expose the table to anon.

begin;

create function public.boa_acc_gate_vehicle(
  p_device_token       text,
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
security definer
set search_path = ''
as $$
declare
  v_device public.boa_acc_device;
  v_event public.boa_acc_vehicle_event;
  v_person public.boa_acc_person;
  v_sticker public.boa_acc_checkin;
  v_wristband boolean;
  v_plate text := upper(regexp_replace(btrim(coalesce(p_plate, '')), '\s', '', 'g'));
  v_now timestamptz := clock_timestamp();
  v_occurred_at timestamptz;
begin
  v_device := private.boa_acc_gate_device(p_device_token);

  if v_device.scope not in ('vehicle', 'both') then
    raise exception 'device scope cannot record vehicle events' using errcode = '42501';
  end if;
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

    select
      p.id, p.org_id, p.full_name, p.phone, p.role_text, p.vehicle_reg,
      p.status, p.type_code, p.day_validity, p.pass_ref, p.pass_token,
      p.approved_at, p.approved_by, p.decision_reason, p.in_bms,
      p.bms_entered_at, p.bms_entered_by, p.submitted_at, p.created_at,
      p.updated_at
      into v_person
    from public.boa_acc_person p
    where p.id = p_person_id
      and p.status = 'approved';
    if v_person.id is null or v_person.vehicle_reg is distinct from v_plate then
      raise exception 'vehicle registration mismatch' using errcode = '22023';
    end if;

    select
      c.id, c.person_id, c.kind, c.idempotency_key, c.band_serial,
      c.sticker_no, c.vehicle_reg, c.device_id, c.gate_label,
      c.volunteer_name, c.occurred_at, c.posted_at, c.is_reissue,
      c.supervisor_note, c.voids_checkin_id
      into v_sticker
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
    if v_sticker.id is null then
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
    reason, checks, device_id, gate_label, officer_name, occurred_at
  ) values (
    p_idempotency_key, v_plate, p_person_id, p_sticker_checkin_id, p_outcome,
    nullif(btrim(coalesce(p_reason, '')), ''), coalesce(p_checks, '{}'::jsonb),
    v_device.id, v_device.gate_label, v_device.volunteer_name, v_occurred_at
  )
  on conflict (idempotency_key) do nothing
  returning
    id, idempotency_key, plate, person_id, sticker_checkin_id, outcome,
    reason, checks, device_id, gate_label, officer_name, occurred_at, posted_at
    into v_event;

  if v_event.id is null then
    select
      e.id, e.idempotency_key, e.plate, e.person_id, e.sticker_checkin_id,
      e.outcome, e.reason, e.checks, e.device_id, e.gate_label,
      e.officer_name, e.occurred_at, e.posted_at
      into v_event
    from public.boa_acc_vehicle_event e
    where e.idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'idempotencyKey', v_event.idempotency_key,
    'plate', v_event.plate,
    'personId', v_event.person_id,
    'stickerCheckinId', v_event.sticker_checkin_id,
    'outcome', v_event.outcome,
    'reason', v_event.reason,
    'checks', v_event.checks,
    'deviceId', v_event.device_id,
    'gateLabel', v_event.gate_label,
    'officerName', v_event.officer_name,
    'occurredAt', v_event.occurred_at,
    'postedAt', v_event.posted_at
  );
end;
$$;

comment on function public.boa_acc_gate_vehicle(text, uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz) is
  'Records one immutable vehicle barrier event. Device, plate, clearance evidence, and turn-away reason are authorized in the database.';

revoke all on function public.boa_acc_gate_vehicle(text, uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.boa_acc_gate_vehicle(text, uuid, text, public.boa_acc_vehicle_outcome, uuid, uuid, jsonb, text, timestamptz)
  to service_role;

commit;
