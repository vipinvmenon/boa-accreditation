-- ACC-033 · test-only fixtures for approving/rejecting a person.
--
-- THE DEFECT THIS PREVENTS
--
-- boa_acc_decide (ACC-041) does not exist yet, but boa_acc_desk_dashboard's
-- own pgTAP suite needs approved/rejected boa_acc_person rows to prove its
-- arithmetic. A plain UPDATE from the test's own top-level statement cannot
-- do this: boa_acc_person is populated inside the SAME statement by an
-- earlier CTE calling public.boa_acc_submit(), and a bare UPDATE ... WHERE
-- id = (subquery) shares that statement's ONE snapshot — the same class of
-- bug 202609110005 fixed for org_view/live_invite. Wrapping the UPDATE in
-- its own VOLATILE function gives it a fresh snapshot, exactly like that fix.
--
-- WHAT WAS REJECTED
--
--  * Building the real boa_acc_decide now, ahead of ACC-041. Rejected: that
--    RPC also has to update boa_acc_org.status, write the ledger correctly
--    for reissues, and be reviewed against ACC-041's own acceptance
--    criteria — scope this task does not own.
--  * Two statements (submit in one runSql call, approve in a second). Every
--    other pgTAP file in this project is one statement so db-test.mjs (which
--    only reads the LAST statement's result set) can see it; splitting this
--    file alone would break that convention for no reason.
--
-- Revoked from every client role, same as boa_acc_wipe_org/wipe_email: only
-- the test runner (the role scripts/lib/db.mjs connects as) calls these.

begin;

create function private.boa_acc_test_approve_person(
  p_person_id  uuid,
  p_type_code  public.boa_acc_type_code,
  p_in_bms     boolean default false
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.boa_acc_person
     set status         = 'approved',
         type_code      = p_type_code,
         day_validity    = 'build_show',
         pass_token     = 'test-' || replace(gen_random_uuid()::text, '-', ''),
         pass_ref       = 'TEST-' || left(replace(gen_random_uuid()::text, '-', ''), 10),
         approved_at    = clock_timestamp(),
         in_bms         = p_in_bms,
         bms_entered_at = case when p_in_bms then clock_timestamp() else null end
   where id = p_person_id;
end;
$$;

create function private.boa_acc_test_reject_person(p_person_id uuid, p_reason text default 'test reject')
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.boa_acc_person
     set status = 'rejected', decision_reason = p_reason
   where id = p_person_id;
end;
$$;

-- Same fresh-snapshot reason as the two functions above, for cleanup rather
-- than setup: a test file that inserts boa_acc_aaa_nomination rows earlier in
-- its own statement cannot see them again through a plain re-scanning DELETE
-- later in that same statement (nothing to do with RLS or grants — see
-- 202609110005's comment). boa_acc_wipe_org/wipe_email already exist for the
-- tables those files touch; this is the same shape for aaa_nomination.
create function private.boa_acc_test_wipe_aaa_nominations(p_phones text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.boa_acc_aaa_nomination where phone = any(p_phones);
end;
$$;

revoke all on function private.boa_acc_test_approve_person(uuid, public.boa_acc_type_code, boolean)
  from public, anon, authenticated, service_role;
revoke all on function private.boa_acc_test_reject_person(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.boa_acc_test_wipe_aaa_nominations(text[])
  from public, anon, authenticated, service_role;

commit;
