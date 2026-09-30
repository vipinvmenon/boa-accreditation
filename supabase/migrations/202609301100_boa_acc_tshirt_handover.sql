-- ACC-197b · "T-shirt handed over" (follow-up to 202609301000).
--
-- Without a record, rescanning someone shows the T-shirt cue again and a shirt
-- can go out twice. One person is handed one shirt, once: this is an
-- append-only table with UNIQUE (person_id), so two phones that both hand it
-- over offline collapse into the first row at drain time, never an error and
-- never a second shirt on record. Never updated or deleted (same ENABLE ALWAYS
-- trigger as the check-in ledger). A wrong tap is corrected by the desk in SQL,
-- deliberately not from the gate.
--
-- Not on boa_acc_checkin: that ledger's kinds (wristband, sticker, void) feed
-- the double-issue view, the dashboard and the sticker index, and a shirt is
-- none of those. Not readable by the holder: boa_acc_pass_view is untouched.
--
-- boa_acc_gate_pull gains `tshirtGivenAt` per roster row (body = 202609301000's
-- with the join added). CREATE OR REPLACE keeps its grants.

begin;

create table public.boa_acc_tshirt_handover (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null unique references public.boa_acc_person(id),
  idempotency_key uuid not null unique,
  size            text not null check (size in ('S','M','L','XL','XXL','3XL')),
  operator_id     uuid not null references auth.users(id),
  gate_label      text not null,
  volunteer_name  text not null,
  occurred_at     timestamptz not null,
  posted_at       timestamptz not null default now()
);
comment on table public.boa_acc_tshirt_handover is
  'ACC-197b. One row when a volunteer hands a person their crew T-shirt. Append-only; UNIQUE(person_id) makes a double hand-over collapse to the first.';

create trigger boa_acc_tshirt_handover_immutable
  before update or delete on public.boa_acc_tshirt_handover
  for each row execute function private.boa_acc_reject_mutation();
alter table public.boa_acc_tshirt_handover enable always trigger boa_acc_tshirt_handover_immutable;

alter table public.boa_acc_tshirt_handover enable row level security;
alter table public.boa_acc_tshirt_handover force row level security;
revoke all on public.boa_acc_tshirt_handover from public, anon, authenticated, service_role;

create function public.boa_acc_gate_tshirt(
  p_idempotency_key uuid,
  p_person_id       uuid,
  p_occurred_at     timestamptz default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_operator public.boa_acc_operator;
  v_size     text;
  v_now      timestamptz := clock_timestamp();
  v_at       timestamptz;
  v_result   jsonb;
begin
  v_operator := private.boa_acc_gate_operator();

  if p_idempotency_key is null or p_person_id is null then
    raise exception 'idempotency key and person required' using errcode = '22023';
  end if;

  select p.tshirt_size into v_size
    from public.boa_acc_person p
   where p.id = p_person_id and p.status = 'approved';
  if not found then
    raise exception 'person not found' using errcode = 'P0002';
  end if;
  if v_size is null then
    raise exception 'this person has no crew T-shirt' using errcode = '22023';
  end if;

  v_at := greatest(v_now - interval '15 minutes',
                   least(coalesce(p_occurred_at, v_now), v_now + interval '15 minutes'));

  insert into public.boa_acc_tshirt_handover (
    person_id, idempotency_key, size, operator_id, gate_label, volunteer_name, occurred_at
  ) values (
    p_person_id, p_idempotency_key, v_size, v_operator.user_id, 'Check-in', v_operator.display_name, v_at
  )
  on conflict do nothing;

  -- The row just written, or the earlier one this person / key already has.
  select jsonb_build_object(
           'id', h.id,
           'personId', h.person_id,
           'idempotencyKey', h.idempotency_key,
           'size', h.size,
           'operatorId', h.operator_id,
           'gateLabel', h.gate_label,
           'volunteerName', h.volunteer_name,
           'occurredAt', h.occurred_at,
           'postedAt', h.posted_at
         )
    into v_result
    from public.boa_acc_tshirt_handover h
   where h.person_id = p_person_id;

  return v_result;
end;
$$;

comment on function public.boa_acc_gate_tshirt(uuid, uuid, timestamptz) is
  'ACC-197b. Records that the calling gate operator handed this approved person their crew T-shirt. Idempotent per person: a second call (another phone, a replay) returns the first row. Refuses a person with no shirt. issuer/lead/admin only.';

revoke all on function public.boa_acc_gate_tshirt(uuid, uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_tshirt(uuid, uuid, timestamptz)
  to authenticated;

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
  'Approved roster (incl. name, phone, role, org, pass type, crew T-shirt and when it was handed over) and the latest active non-voided ledger projection, for the calling operator''s own session. issuer/lead/admin only, checked in the database (private.boa_acc_gate_operator).';

commit;
