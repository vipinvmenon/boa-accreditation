-- ACC-023 · Sequential wipe helper for tests (and nothing else).
--
-- Data-modifying CTEs in one WITH share a snapshot, so
-- `delete people` then `delete orgs` in sibling CTEs still sees the people
-- for the FK check (`boa_acc_person.org_id ... on delete restrict`). The
-- wipe then fails, the following INSERT hits boa_acc_org_name_key, and
-- leftover ACC-023 rows accumulate. A VOLATILE plpgsql body runs the
-- deletes as successive statements, each of which sees the previous.
--
-- Revoked from every client role. Only the test runner (postgres) calls it.

begin;

create function private.boa_acc_wipe_org(p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.boa_acc_person
   where org_id in (select o.id from public.boa_acc_org o where o.name = p_name);
  delete from public.boa_acc_submit_throttle
   where token_hash in (
     select i.token_hash
       from public.boa_acc_org_invite i
       join public.boa_acc_org o on o.id = i.org_id
      where o.name = p_name
   );
  delete from public.boa_acc_org_invite
   where org_id in (select o.id from public.boa_acc_org o where o.name = p_name);
  delete from public.boa_acc_org where name = p_name;
end;
$$;

revoke all on function private.boa_acc_wipe_org(text)
  from public, anon, authenticated, service_role;

commit;
