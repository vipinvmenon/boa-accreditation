-- ACC-056 · Device-authenticated gate pull and append-only issue path.
--
-- THE DEFECT THIS PREVENTS
--
-- The gate has no operator account and `anon` has zero table grants. A route
-- must not solve that by handing the service-role key to the browser or by
-- reopening table writes. These SECURITY DEFINER RPCs receive the pasted device
-- token, hash it inside the database, and authorize every pull/write against
-- an active, unexpired device row before touching domain data.
--
-- WHAT WAS REJECTED
--
-- * Direct REST table access from the gate: `anon` is deliberately locked out.
-- * Trusting gate_label, volunteer_name, or device_id from the client: those
--   values come from the authenticated device row.
-- * A mutable "current check-in" table: the ledger is append-only. Voids and
--   reissues append rows, and the pull projects the latest non-voided issue.
-- * Pre-assigned physical serials: blank band/sticker values remain valid and
--   serials are accepted only when the article is handed over.
--
-- Every client write remains an outbox write. The route may be online, but the
-- browser never takes an online fast path around the local queue.

begin;

create function private.boa_acc_gate_device(p_device_token text)
returns public.boa_acc_device
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_device public.boa_acc_device;
begin
  if p_device_token is null or length(btrim(p_device_token)) = 0 then
    raise exception 'invalid device' using errcode = '42501';
  end if;

  select
    d.id, d.token_hash, d.token_hint, d.gate_label, d.volunteer_name,
    d.scope, d.created_at, d.created_by, d.last_seen_at, d.revoked_at,
    d.expires_at
    into v_device
  from public.boa_acc_device d
  where d.token_hash = private.boa_acc_hash_token(btrim(p_device_token))
    and d.revoked_at is null
    and d.expires_at > clock_timestamp()
  for update;

  if v_device.id is null then
    raise exception 'invalid device' using errcode = '42501';
  end if;

  update public.boa_acc_device
     set last_seen_at = clock_timestamp()
   where id = v_device.id;

  return v_device;
end;
$$;

revoke all on function private.boa_acc_gate_device(text)
  from public, anon, authenticated, service_role;

create function public.boa_acc_gate_pull(p_device_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_device public.boa_acc_device;
  v_roster jsonb;
  v_ledger jsonb;
  v_roster_as_of timestamptz;
  v_ledger_as_of timestamptz;
begin
  v_device := private.boa_acc_gate_device(p_device_token);

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'passToken', p.pass_token,
          'personId', p.id,
          'orgId', p.org_id,
          'status', p.status,
          'vehicleReg', p.vehicle_reg,
          'updatedAt', p.updated_at
        )
        order by p.updated_at, p.id
      ),
      '[]'::jsonb
    ),
    max(p.updated_at)
    into v_roster, v_roster_as_of
  from public.boa_acc_person p
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
    'deviceId', v_device.id,
    'gateLabel', v_device.gate_label,
    'volunteerName', v_device.volunteer_name,
    'scope', v_device.scope,
    'roster', v_roster,
    'ledger', v_ledger,
    'rosterAsOf', v_roster_as_of,
    'ledgerAsOf', v_ledger_as_of
  );
end;
$$;

comment on function public.boa_acc_gate_pull(text) is
  'Returns the approved pass roster and latest active non-voided ledger projection for an active gate device. The raw device token is never returned.';

revoke all on function public.boa_acc_gate_pull(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_pull(text)
  to service_role;

create function public.boa_acc_gate_issue(
  p_device_token      text,
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
  v_device public.boa_acc_device;
  v_person public.boa_acc_person;
  v_target public.boa_acc_checkin;
  v_checkin public.boa_acc_checkin;
  v_now timestamptz := clock_timestamp();
  v_occurred_at timestamptz;
  v_band_serial text := nullif(btrim(coalesce(p_band_serial, '')), '');
  v_sticker_no text := nullif(btrim(coalesce(p_sticker_no, '')), '');
  v_vehicle_reg text := nullif(btrim(coalesce(p_vehicle_reg, '')), '');
begin
  v_device := private.boa_acc_gate_device(p_device_token);

  if p_idempotency_key is null then
    raise exception 'idempotency key required' using errcode = '22023';
  end if;

  if p_kind = 'wristband' and v_device.scope not in ('crew', 'both') then
    raise exception 'device scope cannot issue wristbands' using errcode = '42501';
  end if;

  if p_kind = 'vehicle_sticker' and v_device.scope not in ('vehicle', 'both') then
    raise exception 'device scope cannot issue stickers' using errcode = '42501';
  end if;

  if p_kind = 'void' and p_voids_checkin_id is null then
    raise exception 'void target required' using errcode = '22023';
  end if;

  select
    p.id, p.org_id, p.full_name, p.phone, p.role_text, p.vehicle_reg,
    p.status, p.type_code, p.day_validity, p.pass_ref, p.pass_token,
    p.approved_at, p.approved_by, p.decision_reason, p.in_bms,
    p.bms_entered_at, p.bms_entered_by, p.submitted_at, p.created_at,
    p.updated_at
    into v_person
  from public.boa_acc_person p
  where p.pass_token = p_pass_token
    and p.status = 'approved';

  if v_person.id is null then
    raise exception 'person not found' using errcode = 'P0002';
  end if;

  if p_kind = 'vehicle_sticker' then
    if v_person.vehicle_reg is null or v_vehicle_reg is distinct from v_person.vehicle_reg then
      raise exception 'vehicle registration mismatch' using errcode = '22023';
    end if;
  end if;

  if p_kind = 'void' then
    select
      c.id, c.person_id, c.kind, c.idempotency_key, c.band_serial,
      c.sticker_no, c.vehicle_reg, c.device_id, c.gate_label,
      c.volunteer_name, c.occurred_at, c.posted_at, c.is_reissue,
      c.supervisor_note, c.voids_checkin_id
      into v_target
    from public.boa_acc_checkin c
    where c.id = p_voids_checkin_id
      and c.person_id = v_person.id
      and c.kind <> 'void';
    if v_target.id is null then
      raise exception 'void target not found' using errcode = 'P0002';
    end if;
  end if;

  v_occurred_at := greatest(
    v_now - interval '15 minutes',
    least(coalesce(p_occurred_at, v_now), v_now + interval '15 minutes')
  );

  insert into public.boa_acc_checkin (
    person_id, kind, idempotency_key, band_serial, sticker_no, vehicle_reg,
    device_id, gate_label, volunteer_name, occurred_at, is_reissue,
    supervisor_note, voids_checkin_id
  ) values (
    v_person.id, p_kind, p_idempotency_key,
    case when p_kind = 'wristband' then v_band_serial end,
    case when p_kind = 'vehicle_sticker' then v_sticker_no end,
    case when p_kind = 'vehicle_sticker' then v_vehicle_reg end,
    v_device.id, v_device.gate_label, v_device.volunteer_name, v_occurred_at,
    coalesce(p_is_reissue, false), nullif(btrim(coalesce(p_supervisor_note, '')), ''),
    p_voids_checkin_id
  )
  on conflict (idempotency_key) do nothing
  returning
    id, person_id, kind, idempotency_key, band_serial, sticker_no, vehicle_reg,
    device_id, gate_label, volunteer_name, occurred_at, posted_at, is_reissue,
    supervisor_note, voids_checkin_id
    into v_checkin;

  if v_checkin.id is null then
    select
      c.id, c.person_id, c.kind, c.idempotency_key, c.band_serial,
      c.sticker_no, c.vehicle_reg, c.device_id, c.gate_label,
      c.volunteer_name, c.occurred_at, c.posted_at, c.is_reissue,
      c.supervisor_note, c.voids_checkin_id
      into v_checkin
    from public.boa_acc_checkin c
    where c.idempotency_key = p_idempotency_key;
  end if;

  return jsonb_build_object(
    'id', v_checkin.id,
    'personId', v_checkin.person_id,
    'kind', v_checkin.kind,
    'idempotencyKey', v_checkin.idempotency_key,
    'bandSerial', v_checkin.band_serial,
    'stickerNo', v_checkin.sticker_no,
    'vehicleReg', v_checkin.vehicle_reg,
    'deviceId', v_checkin.device_id,
    'gateLabel', v_checkin.gate_label,
    'volunteerName', v_checkin.volunteer_name,
    'occurredAt', v_checkin.occurred_at,
    'postedAt', v_checkin.posted_at,
    'isReissue', v_checkin.is_reissue,
    'supervisorNote', v_checkin.supervisor_note,
    'voidsCheckinId', v_checkin.voids_checkin_id
  );
end;
$$;

comment on function public.boa_acc_gate_issue(text, uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid) is
  'Appends one gate issue, reissue, or void after authenticating an active device token. Device identity is loaded in the database; serials remain caller-typed and may be blank. Replays by idempotency key return the existing ledger row.';

revoke all on function public.boa_acc_gate_issue(text, uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_issue(text, uuid, text, public.boa_acc_checkin_kind, text, text, text, timestamptz, boolean, text, uuid)
  to service_role;

commit;
