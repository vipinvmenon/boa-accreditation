-- ACC-054/ACC-057 · Carry person identity and pass type through the gate pull.
--
-- THE DEFECT THIS PREVENTS
--
-- `boa_acc_gate_pull` returned only `passToken, personId, orgId, status,
-- vehicleReg, updatedAt`. The gate screen had nowhere to get a name, an org,
-- a role, or a pass type from, so it rendered the raw `personId` in place of
-- the approved person's name and a generic banner in place of the
-- type-specific one (colour, band name, held zones) the design specifies.
-- That gap was invisible until `test:visual` was pointed at a real Dexie
-- fixture (see CURRENT-STATE.md, 12 Sep) — the harness could only seed what
-- the wire schema carried.
--
-- WHAT WAS REJECTED
--
-- * Sending the type's colour/label/zones/note from the database: those are
--   already a single client-side source of truth in lib/design.ts (`TYPES`,
--   `passType()`), seeded from the same design constant this table's rows
--   come from. Duplicating them server-side would give the client two
--   sources of truth for one design fact.
-- * A join to `boa_acc_org` returning the whole row: only `name` is needed at
--   the gate, so only `name` is selected.
--
-- This does not change the function's signature, its grants, or the ledger
-- projection — only which columns the existing roster query selects.

begin;

create or replace function public.boa_acc_gate_pull(p_device_token text)
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
  'Returns the approved pass roster (incl. name, role, org and pass type) and latest active non-voided ledger projection for an active gate device. The raw device token is never returned.';

revoke all on function public.boa_acc_gate_pull(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_gate_pull(text)
  to service_role;

commit;
