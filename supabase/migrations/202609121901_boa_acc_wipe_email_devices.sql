-- ACC-045 · private.boa_acc_wipe_email must also clear boa_acc_device rows.
--
-- THE DEFECT THIS PREVENTS
--
-- boa_acc_device.created_by references auth.users(id) with no ON DELETE
-- action (RESTRICT, the default). 202609110008's boa_acc_wipe_email deletes
-- the operator row then the auth.users row, but ACC-045 is the first test to
-- mint a device from a throwaway operator — its FK now blocks step 2, exactly
-- the same class of bug 202609110006/008 already fixed once for
-- boa_acc_person/boa_acc_org_invite. Confirmed live: `test:db` failed with
-- `update or delete on table "users" violates foreign key constraint
-- boa_acc_device_created_by_fkey` before this migration existed, and the
-- whole test statement rolled back atomically, leaving no orphaned rows.
--
-- Fixed the same way as before: one more sequential DELETE, ahead of the
-- other two, inside the same VOLATILE plpgsql body — sibling deletes in a
-- WITH cannot be relied on for this ordering (see 202609110006's header);
-- sequential statements in a function body can.

begin;

create or replace function private.boa_acc_wipe_email(p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.boa_acc_device
   where created_by in (select u.id from auth.users u where u.email = p_email);
  delete from public.boa_acc_operator
   where user_id in (select u.id from auth.users u where u.email = p_email);
  delete from auth.users where email = p_email;
end;
$$;

revoke all on function private.boa_acc_wipe_email(text)
  from public, anon, authenticated, service_role;

commit;
