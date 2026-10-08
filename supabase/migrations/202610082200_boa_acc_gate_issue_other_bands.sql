-- boa_acc_gate_issue now also returns `otherBands`: the person's other live
-- (unvoided) wristband rows, so the issuing phone can warn "another phone
-- already issued this" once its queued issue reaches the server. Offline the
-- warning waits for signal; the write itself is never refused. Every existing
-- key is unchanged. Signature, grants and privileges are unchanged.

begin;

create or replace function public.boa_acc_gate_issue(
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
  v_row_id uuid;
  v_other jsonb := '[]'::jsonb;
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
  select c.id into v_row_id
  from public.boa_acc_checkin c
  where c.idempotency_key = p_idempotency_key;

  -- ACC-148 follow-up: tell the issuing phone when this person already holds
  -- a live band from another row (another phone got there first). The write
  -- above is never refused for it: both bands are on wrists, and the ledger
  -- is append-only. A deliberate reissue is not a second band to warn about.
  if p_kind = 'wristband' and not coalesce(p_is_reissue, false) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', o.id,
             'bandSerial', o.band_serial,
             'gateLabel', o.gate_label,
             'volunteerName', o.volunteer_name,
             'occurredAt', o.occurred_at
           ) order by o.occurred_at, o.id), '[]'::jsonb)
      into v_other
    from public.boa_acc_checkin o
    where o.person_id = v_person_id
      and o.kind = 'wristband'
      and o.id <> v_row_id
      and not exists (
        select 1 from public.boa_acc_checkin v
        where v.kind = 'void' and v.voids_checkin_id = o.id
      );
  end if;

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
    'voidsCheckinId', c.voids_checkin_id,
    'otherBands', v_other
  )
    into v_result
  from public.boa_acc_checkin c
  where c.idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

commit;
