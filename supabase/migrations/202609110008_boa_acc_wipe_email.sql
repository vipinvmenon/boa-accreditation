-- ACC-023 · Wipe the throwaway auth.users row the token tests insert.
-- Same sequential-delete reason as boa_acc_wipe_org: sibling DELETE CTEs
-- against operator + auth.users were leaving the row behind.

begin;

create function private.boa_acc_wipe_email(p_email text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.boa_acc_operator
   where user_id in (select u.id from auth.users u where u.email = p_email);
  delete from auth.users where email = p_email;
end;
$$;

revoke all on function private.boa_acc_wipe_email(text)
  from public, anon, authenticated, service_role;

commit;
