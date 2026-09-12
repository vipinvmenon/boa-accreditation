-- ACC-041 · a test-only, VOLATILE point-read of boa_acc_person.
--
-- THE DEFECT THIS PREVENTS
--
-- decide.test.sql needs to prove "pass_token/pass_ref/type_code/day_validity
-- are all NULL on a merely-submitted row" for a person inserted by
-- public.boa_acc_submit() earlier in the SAME pgTAP statement. A plain
-- `select ... from public.boa_acc_person where id = ...` — even inside its
-- own "materialized" CTE — is NOT a fresh read: a bare SELECT scanning a base
-- table shares the ONE query snapshot taken at the start of the whole
-- statement, same as the STABLE-function trap 202609110005 and 202609120011
-- already document, and cannot see a row a sibling data-modifying CTE
-- inserted moments earlier in that same statement. Confirmed by hitting it
-- directly while writing decide.test.sql: the point-read came back as zero
-- rows even though the insert had already returned a real id.
--
-- A VOLATILE function call gets its own fresh snapshot in READ COMMITTED
-- (the default), exactly why every other function that needs to see
-- same-statement writes in this codebase (boa_acc_live_invite,
-- boa_acc_wipe_org, the 202609120011 test helpers, boa_acc_decide itself) is
-- VOLATILE rather than STABLE. This is the same fix, wrapped around a plain
-- read instead of a write.
--
-- Revoked from every client role, same as 202609120011's helpers: only the
-- test runner (the role scripts/lib/db.mjs connects as) calls this.

begin;

create function private.boa_acc_test_read_person(p_person_id uuid)
returns public.boa_acc_person
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_person public.boa_acc_person;
begin
  select * into v_person from public.boa_acc_person where id = p_person_id;
  return v_person;
end;
$$;

comment on function private.boa_acc_test_read_person(uuid) is
  'Test-only fresh point-read of one boa_acc_person row, VOLATILE so it can see a row inserted earlier in the same pgTAP statement. Never used by the app itself.';

revoke all on function private.boa_acc_test_read_person(uuid)
  from public, anon, authenticated, service_role;

-- Same reason, for boa_acc_aaa_nomination: decide.test.sql needs to see
-- person_id after boa_acc_decide's own aaa-stamping UPDATE, which happens
-- inside private.boa_acc_decide_one, a sibling VOLATILE call earlier in the
-- same statement — a bare re-query of the base table cannot see it either.
create function private.boa_acc_test_read_aaa_nomination(p_nomination_id uuid)
returns public.boa_acc_aaa_nomination
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom public.boa_acc_aaa_nomination;
begin
  select * into v_nom from public.boa_acc_aaa_nomination where id = p_nomination_id;
  return v_nom;
end;
$$;

comment on function private.boa_acc_test_read_aaa_nomination(uuid) is
  'Test-only fresh point-read of one boa_acc_aaa_nomination row, VOLATILE for the same reason as boa_acc_test_read_person. Never used by the app itself.';

revoke all on function private.boa_acc_test_read_aaa_nomination(uuid)
  from public, anon, authenticated, service_role;

commit;
