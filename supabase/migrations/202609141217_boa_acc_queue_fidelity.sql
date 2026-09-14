-- Queue fidelity follow-up: preserve the design's AAA filter and org reject.

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
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_filter not in ('pending', 'approved', 'rejected', 'aaa') then
    raise exception 'invalid filter' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.created_at), '[]'::jsonb)
    into v_rows
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

  select jsonb_build_object(
    'pending', count(*) filter (where p.status = 'submitted'),
    'approved', count(*) filter (where p.status = 'approved'),
    'rejected', count(*) filter (where p.status = 'rejected'),
    'aaa', count(*) filter (where p.type_code = 'aaa')
  )
    into v_counts
  from public.boa_acc_person p;

  return jsonb_build_object('rows', v_rows, 'counts', v_counts);
end;
$$;

create function public.boa_acc_reject_org(
  p_org_id uuid,
  p_decision_reason text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_count integer := 0;
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(trim(p_decision_reason), '') is null then
    raise exception 'rejection reason required' using errcode = '23514';
  end if;

  for v_person_id in
    select id
    from public.boa_acc_person
    where org_id = p_org_id and status = 'submitted'
    order by created_at
  loop
    perform private.boa_acc_decide_one(v_person_id, false, null, null, p_decision_reason);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.boa_acc_reject_org(uuid, text) is
  'Rejects every submitted person in one organisation with the supplied reason. Already-decided rows are left untouched.';

revoke all on function public.boa_acc_approval_queue(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_approval_queue(text) to authenticated;

revoke all on function public.boa_acc_reject_org(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_reject_org(uuid, text) to authenticated;

commit;
