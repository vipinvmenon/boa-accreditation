-- ACC-044 · AAA nomination workflow.
--
-- The table is intentionally read-only to authenticated callers. These
-- SECURITY DEFINER functions are the only write path, so the database—not the
-- desk screen—decides who may create or approve a named AAA nomination.
-- Approval here is separate from pass approval: boa_acc_decide still requires
-- an approved, unstamped nomination before it can create an AAA pass.

begin;

create function public.boa_acc_list_aaa_nominations()
returns setof public.boa_acc_aaa_nomination
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select n.*
      from public.boa_acc_aaa_nomination n
     order by n.approved, n.nominated_at, n.full_name;
end;
$$;

comment on function public.boa_acc_list_aaa_nominations() is
  'Lists the named AAA nominations for an active desk operator.';

revoke all on function public.boa_acc_list_aaa_nominations()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_list_aaa_nominations() to authenticated;

create function public.boa_acc_nominate_aaa(
  p_full_name text,
  p_phone text,
  p_org_hint text default null
)
returns public.boa_acc_aaa_nomination
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nomination public.boa_acc_aaa_nomination;
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_full_name is null
     or length(btrim(p_full_name)) not between 2 and 80
     or p_phone is null
     or p_phone !~ '^\+91[6-9][0-9]{9}$'
     or (p_org_hint is not null and length(btrim(p_org_hint)) > 120) then
    raise exception 'invalid nomination' using errcode = 'P0001';
  end if;

  insert into public.boa_acc_aaa_nomination
    (full_name, phone, org_hint, nominated_by)
  values
    (btrim(p_full_name), p_phone, nullif(btrim(p_org_hint), ''), (select auth.uid()))
  returning * into v_nomination;
  return v_nomination;
exception
  when unique_violation then
    raise exception 'duplicate_nomination' using errcode = '23505';
end;
$$;

comment on function public.boa_acc_nominate_aaa(text, text, text) is
  'Adds one named AAA nominee. The database permits only active operators.';

revoke all on function public.boa_acc_nominate_aaa(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_nominate_aaa(text, text, text) to authenticated;

create function public.boa_acc_approve_aaa_nomination(p_nomination_id uuid)
returns public.boa_acc_aaa_nomination
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nomination public.boa_acc_aaa_nomination;
begin
  if not private.boa_acc_is_operator(array['lead','admin','approver']::public.boa_acc_operator_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select n.* into v_nomination
    from public.boa_acc_aaa_nomination n
   where n.id = p_nomination_id
   for update;
  if v_nomination.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_nomination.approved then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;

  update public.boa_acc_aaa_nomination
     set approved = true,
         approved_at = clock_timestamp(),
         approved_by = (select auth.uid())
   where id = v_nomination.id
  returning * into v_nomination;
  return v_nomination;
end;
$$;

comment on function public.boa_acc_approve_aaa_nomination(uuid) is
  'Approves one named AAA nomination; pass issuance remains guarded by boa_acc_decide.';

revoke all on function public.boa_acc_approve_aaa_nomination(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_approve_aaa_nomination(uuid) to authenticated;

commit;
