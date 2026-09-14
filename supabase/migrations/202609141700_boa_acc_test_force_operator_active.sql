-- private.boa_acc_test_force_operator_active — the missing piece in
-- operator-active.test.sql's neutralize/restore pattern.
--
-- THE DEFECT THIS PREVENTS
--
-- operator-active.test.sql neutralizes real active admins (set active =
-- false) to safely exercise the last-admin guard against a database that
-- already has real admins in it, then tries to restore them (set active =
-- true) before the statement ends, via two sibling raw UPDATE CTEs in one
-- WITH clause, both targeting the SAME row (the same real admin's user_id).
--
-- PostgreSQL's documented behaviour for data-modifying WITH queries: all the
-- auxiliary statements share the snapshot taken at the start of the overall
-- query, and if two of them target the same row, the outcome for the second
-- writer is unspecified — in practice here, the restore UPDATE matched ZERO
-- rows, because it planned against the pre-neutralize snapshot of that row,
-- and the row's new tuple version (from neutralize) is not something a
-- sibling CTE's plan can revisit. Confirmed live, 14 Sep 2026: the real
-- admin (vipinmenon16@gmail.com) ended up permanently deactivated by simply
-- running `corepack pnpm test:db` — reproduced in isolation with the raw
-- CTE pattern before this fix, twice, on the real production database.
--
-- Function calls do not have this problem: a VOLATILE function's internal
-- SPI query sees the current state as of its own invocation, independent of
-- the calling statement's outer snapshot — which is exactly why this same
-- test file's pgTAP assertions (calling boa_acc_set_operator_active) already
-- correctly observe the neutralized state. Wrapping both the neutralize and
-- restore writes in this one function, called twice, fixes it the same way
-- private.boa_acc_test_approve_person/boa_acc_test_reject_person already
-- wrap other raw test-harness writes in this codebase.

begin;

create function private.boa_acc_test_force_operator_active(p_user_ids uuid[], p_active boolean)
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  update public.boa_acc_operator
     set active = p_active
   where user_id = any(p_user_ids)
  returning user_id;
$$;

revoke all on function private.boa_acc_test_force_operator_active(uuid[], boolean)
  from public, anon, authenticated, service_role;

commit;
