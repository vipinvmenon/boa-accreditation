-- ACC-023 · VOLATILE revoke helper.
--
-- An UPDATE CTE in the same statement as mint cannot see the invite row:
-- data-modifying CTEs share a snapshot, and a function INSERT is not in that
-- snapshot. boa_acc_org_view is VOLATILE so it sees the row; a raw UPDATE
-- does not, returns 0 rows, and the revoke tests never fire.
-- A VOLATILE plpgsql UPDATE sees the current transaction state.

begin;

create function private.boa_acc_revoke_invite(p_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.boa_acc_org_invite
     set revoked_at = clock_timestamp()
   where id = p_id
     and revoked_at is null;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  return p_id;
end;
$$;

revoke all on function private.boa_acc_revoke_invite(uuid)
  from public, anon, authenticated, service_role;

commit;
