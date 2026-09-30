-- ACC-197b · Test-only cleanup for boa_acc_tshirt_handover (WITHDRAWN in 202609301300).
--
-- Written to let a pgTAP suite wipe its throwaway people. It turned out not to
-- work (ALTER TABLE is refused while the statement is using the table) and is
-- dropped by the next migration; the hand-over tests roll back instead.

begin;

create function private.boa_acc_test_wipe_tshirt_handovers(p_org_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  alter table public.boa_acc_tshirt_handover disable trigger boa_acc_tshirt_handover_immutable;
  delete from public.boa_acc_tshirt_handover h
   where h.person_id in (
     select p.id
       from public.boa_acc_person p
       join public.boa_acc_org o on o.id = p.org_id
      where o.name = p_org_name
   );
  alter table public.boa_acc_tshirt_handover enable always trigger boa_acc_tshirt_handover_immutable;
end;
$$;

revoke all on function private.boa_acc_test_wipe_tshirt_handovers(text)
  from public, anon, authenticated, service_role;

commit;
