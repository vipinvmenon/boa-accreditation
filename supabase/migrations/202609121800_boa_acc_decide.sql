-- ACC-041 · boa_acc_decide + boa_acc_approve_org.
--
-- THE DEFECT THIS PREVENTS
--
-- There is no write path from boa_acc_person.status = 'submitted' to
-- 'approved' / 'rejected' anywhere yet. Without this, a pass_token could only
-- ever come from the test-only helpers in 202609120011 (revoked from every
-- client role, unreachable from the app) or from a bare UPDATE the desk route
-- would have to run directly against the table -- which the RLS lockdown in
-- 202609110002 already refuses (no write policy exists, deliberately: see
-- that migration's own header) and which would re-derive every invariant the
-- table's own CHECK constraints already enforce (non-negotiable #5's
-- compensating control, ADR-002).
--
-- This migration is also the concrete proof of the Phase 3 acceptance line
-- "AAA unstampable without a nomination": approving a person as `aaa` without
-- a matching, approved, not-yet-stamped `boa_acc_aaa_nomination` row is
-- refused, in the database, not by the approval-queue screen (non-negotiable
-- #3).
--
-- WHAT WAS REJECTED
--
--  * A single function with a `p_org_id` OR `p_person_id` argument.
--    Rejected: two different authorization/validation shapes (one row vs.
--    "every pending row in this org") reading as one function invites the
--    kind of silent scope-creep non-negotiable #10 exists to catch. Two
--    functions sharing one un-checked core (private.boa_acc_decide_one) instead.
--  * boa_acc_approve_org accepting `aaa` as its bulk type. Rejected: aaa
--    always needs a per-row nomination match, so "approve this whole org as
--    aaa" would fail on nearly every row and return a confusing partial
--    count. Refused upfront with a clear error; aaa is always a per-row
--    boa_acc_decide call.
--  * Re-deriving "a rejection needs a reason" as a check inside this
--    function. The CHECK constraint boa_acc_person_rejection_needs_reason
--    already exists and already fires with 23514 on a null/blank reason --
--    letting it fire, rather than adding a second copy of the same rule, is
--    exactly what the task brief asks for and what non-negotiable #5 argues
--    for generally: a rule enforced only by an RPC is a rule that holds until
--    someone writes a second RPC.
--  * Transitioning boa_acc_org.status ('open' -> 'submitted' / 'approved')
--    from either this migration or boa_acc_submit. Explicitly deferred, not
--    forgotten -- see docs/DECISIONS.md ADR-012 and docs/CURRENT-STATE.md.
--    Short version: boa_acc_submit refuses to insert a person at all unless
--    org.status = 'open' (`org_closed`), and Bhoopesh's vendors add people to
--    the same org incrementally with no "final submit" action (ACC-032
--    removed the one button that looked like it might be that). Moving
--    org.status off 'open' the moment the desk starts deciding people --
--    which per Phase 3's own dates (Mon 21 Sep) happens WHILE links are still
--    live and a vendor could still legitimately add a straggler -- would
--    silently start refusing real submissions with `org_closed` nine days
--    before the gate opens. That is a live risk, not a data-model nicety, and
--    it is not this task's call to make silently. If the desk wants an
--    explicit "we are done taking submissions from this org" state, it needs
--    its own deliberate action (a `boa_acc_close_org` RPC a lead/admin
--    presses on purpose), not a side effect of deciding people.
--
-- CONVENTIONS
--
--  * search_path = '' with fully-qualified names, same as every function.
--  * private.boa_acc_decide_one does the actual row-level work and does NOT
--    check the caller's role -- same shape as private.boa_acc_live_invite:
--    the two PUBLIC entry points below check once, before calling it.
--  * Any active operator (lead, admin OR approver) may decide -- unlike
--    boa_acc_create_org/boa_acc_mint_invite (lead/admin only), deciding IS
--    the approver role's job. private.boa_acc_is_operator() with no role
--    array, same predicate boa_acc_desk_dashboard uses.
--  * VOLATILE (both do writes; this also sidesteps the STABLE-snapshot trap
--    202609110005 and 202609120011 already document -- a test file that
--    submits a person and decides it in the SAME statement needs this
--    function to see that row).
--  * `for update` on both the person row and (for aaa) the nomination row,
--    so two concurrent decisions on the same person, or two concurrent aaa
--    approvals racing to claim the same nomination, cannot both win.
--  * pass_ref uses the sequence already created for exactly this purpose in
--    202609110001 (`boa_acc_pass_ref_seq`, unused until now): 'BOA26-' plus
--    the next value, zero-padded to 4 digits, matching the design's own mock
--    (`BOA26-0412`) and docs/DATA-MODEL.md's "Two identifiers per person".
--  * grant EXECUTE to authenticated only -- the desk route calls these via
--    the operator's own session (lib/supabase-server.ts), never the
--    service-role client, same as boa_acc_create_org/boa_acc_desk_dashboard.

begin;

-- ---------------------------------------------------------------------------
-- Core decision logic, shared by boa_acc_decide and boa_acc_approve_org.
-- ---------------------------------------------------------------------------

create function private.boa_acc_decide_one(
  p_person_id       uuid,
  p_approve         boolean,
  p_type_code       public.boa_acc_type_code default null,
  p_day_validity    public.boa_acc_day_validity default null,
  p_decision_reason text default null
)
returns public.boa_acc_person
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_person     public.boa_acc_person;
  v_nomination public.boa_acc_aaa_nomination;
begin
  select * into v_person
    from public.boa_acc_person
   where id = p_person_id
   for update;

  if v_person.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if v_person.status <> 'submitted' then
    raise exception 'already_decided' using errcode = 'P0001';
  end if;

  if p_approve then
    if p_type_code is null or p_day_validity is null then
      raise exception 'type_and_validity_required' using errcode = 'P0001';
    end if;

    -- The AAA guard: "AAA unstampable without a nomination" (Phase 3
    -- acceptance), enforced in the database, not on the queue screen.
    -- Matched by phone (the nomination predates the person row -- see
    -- docs/DATA-MODEL.md, C9). `for update` so two concurrent approvals
    -- cannot both claim the same nomination; person_id is unique on the
    -- nomination table anyway, so a double-claim would fail there too, but
    -- the lock turns that into a clean refusal instead of a race.
    if p_type_code = 'aaa' then
      select * into v_nomination
        from public.boa_acc_aaa_nomination
       where phone = v_person.phone
         and approved
         and person_id is null
       for update;

      if v_nomination.id is null then
        raise exception 'aaa_not_nominated' using errcode = 'P0001';
      end if;
    end if;

    update public.boa_acc_person
       set status          = 'approved',
           type_code       = p_type_code,
           day_validity    = p_day_validity,
           pass_token      = private.boa_acc_new_token(),
           pass_ref        = 'BOA26-' || lpad(nextval('public.boa_acc_pass_ref_seq')::text, 4, '0'),
           approved_at     = clock_timestamp(),
           approved_by     = (select auth.uid()),
           decision_reason = null
     where id = v_person.id
    returning * into v_person;

    if p_type_code = 'aaa' then
      -- Only person_id (the C9 "stamped" signal) is set here. approved/
      -- approved_by belong to the nomination-approval flow itself (ACC-044,
      -- Salman's own action) and are not this RPC's to touch.
      update public.boa_acc_aaa_nomination
         set person_id = v_person.id
       where id = v_nomination.id;
    end if;
  else
    -- Let boa_acc_person_rejection_needs_reason fire on its own (23514)
    -- rather than re-deriving the rule here.
    update public.boa_acc_person
       set status          = 'rejected',
           decision_reason = nullif(btrim(coalesce(p_decision_reason, '')), '')
     where id = v_person.id
    returning * into v_person;
  end if;

  return v_person;
end;
$$;

comment on function private.boa_acc_decide_one(uuid, boolean, public.boa_acc_type_code, public.boa_acc_day_validity, text) is
  'The one place a boa_acc_person row moves out of submitted. Locks the row (and, for aaa, the nomination) under FOR UPDATE. Does not check the caller''s role -- boa_acc_decide and boa_acc_approve_org do that once, before calling this.';

revoke all on function private.boa_acc_decide_one(uuid, boolean, public.boa_acc_type_code, public.boa_acc_day_validity, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- boa_acc_decide -- one row, any active operator (lead, admin OR approver)
-- ---------------------------------------------------------------------------

create function public.boa_acc_decide(
  p_person_id       uuid,
  p_approve         boolean,
  p_type_code       public.boa_acc_type_code default null,
  p_day_validity    public.boa_acc_day_validity default null,
  p_decision_reason text default null
)
returns public.boa_acc_person
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return private.boa_acc_decide_one(p_person_id, p_approve, p_type_code, p_day_validity, p_decision_reason);
end;
$$;

comment on function public.boa_acc_decide(uuid, boolean, public.boa_acc_type_code, public.boa_acc_day_validity, text) is
  'Approve or reject one boa_acc_person row. Any active operator (lead, admin or approver) may call it -- deciding is the approver role''s whole job, unlike boa_acc_create_org/mint_invite which stay lead/admin only. On approval: generates pass_token/pass_ref, sets type_code/day_validity, refuses aaa without a matching approved, unstamped nomination. On rejection: the row''s own CHECK constraint enforces a reason. Refuses an already-decided row with already_decided.';

revoke all on function public.boa_acc_decide(uuid, boolean, public.boa_acc_type_code, public.boa_acc_day_validity, text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_decide(uuid, boolean, public.boa_acc_type_code, public.boa_acc_day_validity, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- boa_acc_approve_org -- bulk-approve every pending person in one org
-- ---------------------------------------------------------------------------

create function public.boa_acc_approve_org(
  p_org_id       uuid,
  p_type_code    public.boa_acc_type_code,
  p_day_validity public.boa_acc_day_validity
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_count     integer := 0;
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_type_code = 'aaa' then
    raise exception 'aaa_requires_individual_decision' using errcode = 'P0001';
  end if;

  for v_person_id in
    select id from public.boa_acc_person
     where org_id = p_org_id and status = 'submitted'
     order by created_at
  loop
    perform private.boa_acc_decide_one(v_person_id, true, p_type_code, p_day_validity, null);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.boa_acc_approve_org(uuid, public.boa_acc_type_code, public.boa_acc_day_validity) is
  'Approves every status=submitted person in one org with the same type/validity, in one call. Already-decided rows (approved, rejected, voided) and draft rows are left untouched. Refuses aaa outright -- see boa_acc_decide for the per-row nomination path. Returns the count approved.';

revoke all on function public.boa_acc_approve_org(uuid, public.boa_acc_type_code, public.boa_acc_day_validity)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_approve_org(uuid, public.boa_acc_type_code, public.boa_acc_day_validity)
  to authenticated;

commit;
