-- ACC-041 · test-only cleanup for the ledger CHECK-constraint test.
--
-- A data-modifying CTE cannot see a sibling CTE's freshly inserted device
-- row under PostgreSQL's one-statement snapshot. This VOLATILE helper gives
-- the cleanup a fresh statement snapshot inside its function body. It is
-- revoked from every client role and exists only for pgTAP cleanup.

begin;

create function private.boa_acc_test_wipe_device(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.boa_acc_device where id = p_id;
end;
$$;

comment on function private.boa_acc_test_wipe_device(uuid) is
  'Test-only cleanup of one throwaway device. Never callable by a client role.';

revoke all on function private.boa_acc_test_wipe_device(uuid)
  from public, anon, authenticated, service_role;

commit;
