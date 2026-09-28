-- ACC-187 · boa_acc_set_operator_role.
--
-- Role changes go through a SECURITY DEFINER function, the same way
-- activation does (202609130900). An RLS policy cannot see "this is the
-- last active admin" or "this is your own row".
--
-- lead and admin only, checked inside the body. A caller cannot change
-- their own role. The last active admin cannot be moved off admin, or the
-- desk would lose the only account that can invite, deactivate, and change
-- roles. An inactive admin may be moved: they are not the live admin.

begin;

create function public.boa_acc_set_operator_role(
  p_user_id uuid,
  p_role    public.boa_acc_operator_role
)
returns table(
  user_id      uuid,
  role         public.boa_acc_operator_role,
  display_name text,
  active       boolean,
  created_at   timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id     uuid;
  v_target_role   public.boa_acc_operator_role;
  v_target_active boolean;
  v_active_admins int;
begin
  if not private.boa_acc_is_operator(
    array['lead','admin']::public.boa_acc_operator_role[]
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_caller_id := (select auth.uid());

  if p_user_id = v_caller_id then
    raise exception 'cannot_change_own_role' using errcode = 'P0001';
  end if;

  select o.role, o.active into v_target_role, v_target_active
    from public.boa_acc_operator o
   where o.user_id = p_user_id;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if v_target_active and v_target_role = 'admin' and p_role <> 'admin' then
    select count(*) into v_active_admins
      from public.boa_acc_operator o
     where o.role = 'admin'
       and o.active
       and o.user_id <> p_user_id;

    if v_active_admins = 0 then
      raise exception 'cannot_demote_last_admin' using errcode = 'P0001';
    end if;
  end if;

  return query
  update public.boa_acc_operator o
     set role = p_role
   where o.user_id = p_user_id
  returning o.user_id, o.role, o.display_name, o.active, o.created_at;
end;
$$;

comment on function public.boa_acc_set_operator_role(uuid, public.boa_acc_operator_role) is
  'Changes one operator role. lead/admin only, checked in the database. A caller may not change their own role (cannot_change_own_role), and the last active admin may not be moved off admin (cannot_demote_last_admin).';

revoke all on function public.boa_acc_set_operator_role(uuid, public.boa_acc_operator_role)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_set_operator_role(uuid, public.boa_acc_operator_role)
  to authenticated;

commit;
