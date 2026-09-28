-- ACC-183a · read-only gate activity for the Control room.
--
-- The dashboard needs two operational projections of the append-only ledger:
-- counts by gate for the current IST day, and the latest physical issues.
-- This stays in the database so the desk cannot bypass operator
-- authorization by reading the ledger directly.

begin;

create function public.boa_acc_desk_gate_feed()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_today_start := (
    (pg_catalog.now() at time zone 'Asia/Kolkata')::date
    at time zone 'Asia/Kolkata'
  );
  v_tomorrow_start := v_today_start + interval '1 day';

  select jsonb_build_object(
    'gateCounts', coalesce(gc.gate_counts, '[]'::jsonb),
    'latestIssues', coalesce(li.latest_issues, '[]'::jsonb)
  )
  into v_result
  from lateral (
    select jsonb_agg(
      jsonb_build_object('gateLabel', c.gate_label, 'count', c.issue_count)
      order by c.gate_label
    ) as gate_counts
    from (
      select c.gate_label, count(*)::integer as issue_count
      from public.boa_acc_checkin c
      where c.kind in ('wristband', 'vehicle_sticker')
        and c.occurred_at >= v_today_start
        and c.occurred_at < v_tomorrow_start
        and not exists (
          select 1
          from public.boa_acc_checkin v
          where v.kind = 'void'
            and v.voids_checkin_id = c.id
        )
      group by c.gate_label
    ) c
  ) gc
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'checkinId', c.id,
        'personId', c.person_id,
        'fullName', p.full_name,
        'orgName', o.name,
        'typeCode', p.type_code,
        'kind', c.kind,
        'bandSerial', c.band_serial,
        'stickerNo', c.sticker_no,
        'vehicleReg', c.vehicle_reg,
        'gateLabel', c.gate_label,
        'occurredAt', c.occurred_at,
        'postedAt', c.posted_at,
        'isReissue', c.is_reissue
      )
      order by c.occurred_at desc, c.posted_at desc, c.id desc
    ) as latest_issues
    from (
      select
        c.id,
        c.person_id,
        c.kind,
        c.band_serial,
        c.sticker_no,
        c.vehicle_reg,
        c.gate_label,
        c.occurred_at,
        c.posted_at,
        c.is_reissue
      from public.boa_acc_checkin c
      where c.kind in ('wristband', 'vehicle_sticker')
        and not exists (
          select 1
          from public.boa_acc_checkin v
          where v.kind = 'void'
            and v.voids_checkin_id = c.id
        )
      order by c.occurred_at desc, c.posted_at desc, c.id desc
      limit 10
    ) c
    join public.boa_acc_person p on p.id = c.person_id
    join public.boa_acc_org o on o.id = p.org_id
  ) li;

  return v_result;
end;
$$;

comment on function public.boa_acc_desk_gate_feed() is
  'ACC-183a. Current-IST-day counts by gate and the ten latest physical ledger issues. Active operators only; read-only.';

revoke all on function public.boa_acc_desk_gate_feed()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_desk_gate_feed()
  to authenticated;

commit;
