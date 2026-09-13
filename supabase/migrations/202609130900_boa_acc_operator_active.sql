-- ACC-049 · boa_acc_set_operator_active.
--
-- THE DEFECT THIS PREVENTS
--
-- `/desk/operators` (ACC-026b) already has the invite half of "manage users":
-- it calls the existing /api/admin/invite-operator, which itself calls
-- auth.admin.inviteUserByEmail + an upsert into boa_acc_operator, checked
-- lead/admin internally. There is no way to deactivate (or reactivate) an
-- existing operator: boa_acc_operator has no insert/update/delete policy
-- anywhere, deliberately (202609110002's own header), so without this
-- migration the only way to flip `active` would be a raw UPDATE against the
-- table — which RLS already refuses for every session role, correctly.
--
-- WHAT WAS REJECTED
--
--  * An RLS update policy on boa_acc_operator gated on
--    private.boa_acc_is_operator(array['lead','admin']). Rejected for the
--    same reason every other mutation here goes through a SECURITY DEFINER
--    RPC instead of a policy: a policy cannot express "you may not deactivate
--    yourself" or "you may not deactivate the last active admin" — those are
--    cross-row invariants a `using`/`with check` expression evaluated per-row
--    cannot see (the last-admin count needs a scan of every OTHER row).
--  * Doing the self- and last-admin guards in the API route instead of the
--    function body. Non-negotiable #3: authorisation is enforced in the
--    database. An RPC guard holds even if a future route (or a script, or a
--    different client) calls this function directly.
--  * A generic boa_acc_update_operator(role, display_name, active) that also
--    lets a lead/admin change someone's role or name. Out of scope for
--    ACC-049 (list, invite, activate/deactivate only) and it would need its
--    own careful "can a lead demote the last admin" analysis — left for a
--    future task if the roadmap ever asks for it.
--
-- CONVENTIONS
--
--  * search_path = '' with fully-qualified names, same as every other RPC.
--  * lead/admin only, same predicate and array literal as boa_acc_mint_device
--    / boa_acc_create_org.
--  * create function grants EXECUTE to PUBLIC; revoke in this same block,
--    then grant back only to authenticated — the desk route calls this via
--    the operator's own session (lib/supabase-server.ts), never the
--    service-role client, same shape as boa_acc_mint_device /
--    boa_acc_revoke_device.
--  * errcode conventions match boa_acc_mint_device/boa_acc_revoke_device:
--    42501 for "not authorized", P0001 for a rejected business rule,
--    P0002 for "not found" (kept distinct from the two guards below, which
--    are P0001 — a existing/known target, just refused for a state reason).

begin;

create function public.boa_acc_set_operator_active(
  p_user_id uuid,
  p_active  boolean
)
returns table(
  user_id      uuid,
  role         public.boa_acc_operator_role,
  display_name text,
  active       boolean
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
    raise exception 'cannot_deactivate_self' using errcode = 'P0001';
  end if;

  select o.role, o.active into v_target_role, v_target_active
    from public.boa_acc_operator o
   where o.user_id = p_user_id;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  -- Deactivating the last active admin would lock every operator out of
  -- the lead/admin-only surface (invites, device mint/revoke, this very
  -- function). Reactivating, or touching a non-admin, never needs this
  -- check. Counted excluding the target row so demoting the second-to-last
  -- admin down to zero is caught, not just "zero admins total right now".
  if p_active = false and v_target_role = 'admin' and v_target_active = true then
    select count(*) into v_active_admins
      from public.boa_acc_operator o
     where o.role = 'admin'
       and o.active
       and o.user_id <> p_user_id;

    if v_active_admins = 0 then
      raise exception 'cannot_deactivate_last_admin' using errcode = 'P0001';
    end if;
  end if;

  return query
  update public.boa_acc_operator o
     set active = p_active
   where o.user_id = p_user_id
  returning o.user_id, o.role, o.display_name, o.active;
end;
$$;

comment on function public.boa_acc_set_operator_active(uuid, boolean) is
  'Activates/deactivates one operator. lead/admin operators only, checked in the database. A caller may not deactivate their own row (cannot_deactivate_self), and the last active admin may not be deactivated (cannot_deactivate_last_admin).';

revoke all on function public.boa_acc_set_operator_active(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_set_operator_active(uuid, boolean)
  to authenticated;

commit;
