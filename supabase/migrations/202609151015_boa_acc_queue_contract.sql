-- Queue contract: return the design's derived summary and organisation metadata
-- as an explicit operator-authorized projection.

begin;

create or replace function public.boa_acc_approval_queue(p_filter text default 'pending')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_counts jsonb;
  v_orgs jsonb;
  v_next_org jsonb;
  v_approved_count integer;
  v_selected_count integer;
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_filter not in ('pending', 'approved', 'rejected', 'aaa') then
    raise exception 'invalid filter' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb),
         count(*) filter (where row_data.status = 'approved'),
         count(*)
    into v_rows, v_approved_count, v_selected_count
    from (
      select
        p.id,
        p.org_id,
        o.name as org_name,
        o.kind::text as org_kind,
        p.full_name,
        p.phone,
        p.role_text,
        p.vehicle_reg,
        p.status::text,
        p.type_code::text,
        p.day_validity::text,
        p.decision_reason,
        p.created_at,
        p.submitted_at
      from public.boa_acc_person p
      join public.boa_acc_org o on o.id = p.org_id
      where (p_filter = 'pending' and p.status = 'submitted')
         or (p_filter = 'approved' and p.status = 'approved')
         or (p_filter = 'rejected' and p.status = 'rejected')
         or (p_filter = 'aaa' and p.type_code = 'aaa')
    ) as row_data;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', o.id,
           'name', o.name,
           'kind', o.kind::text,
           'contactName', o.contact_name,
           'contactPhone', o.contact_phone,
           'used', coalesce(u.used, 0),
           'quota', o.quota,
           'defaultType', o.default_type::text,
           'status', o.status::text
         ) order by o.created_at), '[]'::jsonb)
    into v_orgs
    from public.boa_acc_org o
    left join lateral (
      select count(*)::integer as used
      from public.boa_acc_person p
      where p.org_id = o.id
        and p.status in ('submitted', 'approved', 'rejected')
    ) u on true
   where exists (
     select 1
     from public.boa_acc_person p
     where p.org_id = o.id
       and p.status = 'submitted'
   );

  select jsonb_build_object('id', o.id, 'name', o.name)
    into v_next_org
    from public.boa_acc_org o
   where exists (
     select 1
     from public.boa_acc_person p
     where p.org_id = o.id
       and p.status = 'submitted'
   )
   order by o.created_at
   offset 1
   limit 1;

  select jsonb_build_object(
    'pending', count(*) filter (where p.status = 'submitted'),
    'approved', count(*) filter (where p.status = 'approved'),
    'rejected', count(*) filter (where p.status = 'rejected'),
    'aaa', count(*) filter (where p.type_code = 'aaa')
  )
    into v_counts
  from public.boa_acc_person p;

  return jsonb_build_object(
    'rows', v_rows,
    'selectedLabel', v_selected_count || ' of ' || v_selected_count || ' selected',
    'approvedCount', v_approved_count,
    'orgs', v_orgs,
    'nextOrg', v_next_org,
    'counts', v_counts
  );
end;
$$;

comment on function public.boa_acc_approval_queue(text) is
  'Returns the explicit, credential-free approval queue projection and operator summary metadata.';

revoke all on function public.boa_acc_approval_queue(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_approval_queue(text) to authenticated;

commit;
