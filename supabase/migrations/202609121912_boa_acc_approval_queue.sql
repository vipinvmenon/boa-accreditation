-- ACC-040 · approval queue read model.
--
-- The queue is an authenticated operator surface. It deliberately returns an
-- explicit JSON shape rather than a table row, so pass_token and other
-- credentials can never be included accidentally by a future column grant.

begin;

create function public.boa_acc_approval_queue(p_filter text default 'pending')
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

  if p_filter not in ('pending', 'approved', 'rejected', 'all') then
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
      where p_filter = 'all'
         or (p_filter = 'pending' and p.status = 'submitted')
         or (p_filter = 'approved' and p.status = 'approved')
         or (p_filter = 'rejected' and p.status = 'rejected')
    ) as row_data;

  select jsonb_build_object(
    'pending', count(*) filter (where p.status = 'submitted'),
    'approved', count(*) filter (where p.status = 'approved'),
    'rejected', count(*) filter (where p.status = 'rejected'),
    'all', count(*)
  )
  into v_counts
  from public.boa_acc_person p;

  return jsonb_build_object('rows', v_rows, 'counts', v_counts);
end;
$$;

comment on function public.boa_acc_approval_queue(text) is
  'Returns the explicit, credential-free approval queue projection for active desk operators.';

revoke all on function public.boa_acc_approval_queue(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_approval_queue(text) to authenticated;

commit;
