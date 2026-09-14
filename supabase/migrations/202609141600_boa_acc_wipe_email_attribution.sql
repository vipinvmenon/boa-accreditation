-- private.boa_acc_wipe_email must also clear every OTHER attribution
-- reference to the user being removed, not just boa_acc_device.created_by
-- (ACC-045, 202609121901).
--
-- THE DEFECT THIS PREVENTS
--
-- boa_acc_org_invite.created_by, boa_acc_person.approved_by/bms_entered_by,
-- and boa_acc_aaa_nomination.nominated_by/approved_by all reference
-- auth.users(id) with no ON DELETE action (RESTRICT, the default) — the
-- exact same class of bug 202609121901's header already documents for
-- boa_acc_device. Confirmed live, 14 Sep 2026: deleting an operator who had
-- minted org invites failed with `update or delete on table "users" violates
-- foreign key constraint "boa_acc_org_invite_created_by_fkey"`.
--
-- Unlike boa_acc_device (deleted outright — a device row with no creator is
-- meaningless test debris), these columns are pure attribution on
-- substantive, real data: an org invite is still a live, usable link even if
-- nobody can say who minted it; an approved person is still validly
-- approved; a stamped AAA nomination is still stamped. Deleting the invite,
-- the person, or the nomination just because the operator who acted on it
-- was removed would destroy real data to solve an FK error. NULL is correct
-- here, not DELETE.

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

  update public.boa_acc_org_invite
     set created_by = null
   where created_by in (select u.id from auth.users u where u.email = p_email);

  update public.boa_acc_person
     set approved_by = null
   where approved_by in (select u.id from auth.users u where u.email = p_email);

  update public.boa_acc_person
     set bms_entered_by = null
   where bms_entered_by in (select u.id from auth.users u where u.email = p_email);

  update public.boa_acc_aaa_nomination
     set nominated_by = null
   where nominated_by in (select u.id from auth.users u where u.email = p_email);

  update public.boa_acc_aaa_nomination
     set approved_by = null
   where approved_by in (select u.id from auth.users u where u.email = p_email);

  delete from public.boa_acc_operator
   where user_id in (select u.id from auth.users u where u.email = p_email);

  delete from auth.users where email = p_email;
end;
$$;

revoke all on function private.boa_acc_wipe_email(text)
  from public, anon, authenticated, service_role;

commit;
