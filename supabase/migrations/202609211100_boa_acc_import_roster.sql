-- ACC-117 · boa_acc_import_roster — load the Google Form roster for one org.
--
-- THE DEFECT THIS PREVENTS
--
-- The roster form (docs/ROSTER-FORM.md) cannot enforce a quota or catch a
-- person submitted twice. Those two controls live in boa_acc_submit, but that
-- function is the PUBLIC surface: token-first, and throttled to 60 calls per
-- token per hour, which would take nine hours to load a 500-person roster.
-- This is the desk's bulk path. It keeps the controls that matter (the quota
-- under the same `for update` on the org row, the live-phone uniqueness) and
-- drops the one that is only about the public surface (the throttle).
--
-- SHAPE
--
--   boa_acc_import_roster(p_org_id uuid, p_rows jsonb)
--     returns table(row_no integer, outcome text, person_id uuid, detail text)
--
--   p_rows is a JSON array of objects, one per response-sheet row, already
--   validated and normalised by scripts/import-roster.mjs:
--     { row_no, full_name, phone, role_text, vehicle_reg?,
--       requested_type_code?, requested_day_validity?, submitted_at? }
--   outcome is one of: inserted · duplicate_phone · quota_exceeded · invalid.
--
-- PER-ROW, NOT ALL-OR-NOTHING — on purpose. A roster of 200 with three people
-- over quota and one typed twice should load the 196 and say which four were
-- refused, the same answer the web form gives each person one at a time. It
-- also makes the import safe to re-run: every row already loaded comes back
-- duplicate_phone and nothing is written twice. What IS whole-call: an unknown
-- org (not found), a closed org (org_closed, as boa_acc_submit), a caller who
-- is not a lead/admin, and a payload that is not an array of at most 1000.
--
-- ORDER OF CHECKS, per row: invalid → duplicate_phone → quota_exceeded. A
-- duplicate is reported as a duplicate even when the org is full, because
-- that is the true reason and it does not consume a seat.
--
-- WHAT WAS REJECTED
--
--  * Calling boa_acc_submit in a loop. It needs a live invite token (the desk
--    would have to mint one per import) and it would count every row against
--    the per-token throttle.
--  * Setting type_code from the crew-type mapping. type_code is set only by
--    boa_acc_decide (non-negotiable #3), and the pass_only_when_approved CHECK
--    refuses it on a submitted row anyway. The mapping fills
--    requested_type_code, which is ADVISORY (ADR-018), and only with a tier the
--    pack lets a vendor request (boa_acc_type.requestable).
--  * Storing the form's "Days on site" in day_validity. The same CHECK ties
--    day_validity to approval, so it would refuse the row. See the new column
--    below.
--  * Approver role. Importing creates people on an org's behalf, which is
--    lead/admin work like boa_acc_create_org and boa_acc_mint_invite. Deciding
--    them afterwards stays open to approvers.
--
-- NEW COLUMN: boa_acc_person.requested_day_validity (ADVISORY). The form asks
-- days on site precisely so an org with build riggers and show-day bar staff
-- is not approved wrongly (docs/ROSTER-FORM.md, "Why days are required"). With
-- nowhere to put the answer, the import would throw it away and the desk would
-- be back to guessing. It is a hint beside requested_type_code: nullable, not
-- tied to status, never read as authority. day_validity is still set only at
-- approval. It is not personal data (non-negotiable #9 is about the person).
--
-- submitted_at is the form's own timestamp when given, and MUST carry an
-- explicit UTC offset: a bare "2026-09-21 14:03" would be read in the
-- session's TimeZone (UTC on Supabase) and land 5h30 wrong without an error.

begin;

-- ---------------------------------------------------------------------------
-- 1. The advisory day validity
-- ---------------------------------------------------------------------------

alter table public.boa_acc_person
  add column requested_day_validity public.boa_acc_day_validity;
comment on column public.boa_acc_person.requested_day_validity is
  'ADVISORY. The roster form''s "Days on site" answer, carried by boa_acc_import_roster. Never authority: day_validity is set only by boa_acc_decide / boa_acc_approve_org.';

grant select (requested_day_validity) on public.boa_acc_person to authenticated;

-- ---------------------------------------------------------------------------
-- 2. boa_acc_import_roster
-- ---------------------------------------------------------------------------

create function public.boa_acc_import_roster(p_org_id uuid, p_rows jsonb)
returns table(
  row_no    integer,
  outcome   text,
  person_id uuid,
  detail    text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status    public.boa_acc_org_status;
  v_quota     integer;
  v_used      integer;
  v_row       jsonb;
  v_ord       bigint;
  v_name      text;
  v_phone     text;
  v_role      text;
  v_plate     text;
  v_type      public.boa_acc_type_code;
  v_days      public.boa_acc_day_validity;
  v_at_text   text;
  v_submitted timestamptz;
  v_id        uuid;
begin
  if not private.boa_acc_is_operator(
    array['lead','admin']::public.boa_acc_operator_role[]
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows_must_be_array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) > 1000 then
    raise exception 'too_many_rows' using errcode = '22023';
  end if;

  -- The same row lock boa_acc_submit takes. A web submission for this org
  -- waits for the import to commit, then counts the imported rows.
  select o.status, o.quota
    into v_status, v_quota
    from public.boa_acc_org o
   where o.id = p_org_id
   for update;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_status is distinct from 'open' then
    raise exception 'org_closed' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_used
    from public.boa_acc_person p
   where p.org_id = p_org_id
     and p.status <> 'voided';

  for v_row, v_ord in
    select e.value, e.ordinality
      from jsonb_array_elements(p_rows) with ordinality as e(value, ordinality)
  loop
    row_no    := v_ord::integer;
    person_id := null;

    -- Parse and validate. Every failure here is this row's problem only.
    begin
      if jsonb_typeof(v_row) <> 'object' then
        raise exception 'row is not an object' using errcode = '22023';
      end if;

      row_no := coalesce((v_row ->> 'row_no')::integer, v_ord::integer);

      v_name  := btrim(coalesce(v_row ->> 'full_name', ''));
      v_phone := regexp_replace(btrim(coalesce(v_row ->> 'phone', '')), '\s', '', 'g');
      v_role  := btrim(coalesce(v_row ->> 'role_text', ''));
      v_plate := nullif(
        upper(regexp_replace(btrim(coalesce(v_row ->> 'vehicle_reg', '')), '\s', '', 'g')),
        ''
      );
      v_type := nullif(btrim(coalesce(v_row ->> 'requested_type_code', '')), '')::public.boa_acc_type_code;
      v_days := nullif(btrim(coalesce(v_row ->> 'requested_day_validity', '')), '')::public.boa_acc_day_validity;

      v_at_text := nullif(btrim(coalesce(v_row ->> 'submitted_at', '')), '');
      if v_at_text is not null and v_at_text !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
        raise exception 'submitted_at needs an explicit UTC offset' using errcode = '22023';
      end if;
      v_submitted := coalesce(v_at_text::timestamptz, clock_timestamp());

      -- The table's CHECKs, stated here so the row is refused with a reason
      -- rather than by constraint name. The CHECKs still hold regardless.
      if length(v_name) not between 2 and 80 then
        raise exception 'full_name must be 2-80 characters' using errcode = '22023';
      end if;
      if v_phone !~ '^\+91[6-9][0-9]{9}$' then
        raise exception 'phone must be +91 then 10 digits starting 6-9' using errcode = '22023';
      end if;
      if length(v_role) not between 2 and 60 then
        raise exception 'role_text must be 2-60 characters' using errcode = '22023';
      end if;
      if v_plate is not null and v_plate !~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$' then
        raise exception 'vehicle_reg is not an Indian registration' using errcode = '22023';
      end if;
      if v_type is not null and not exists (
        select 1 from public.boa_acc_type t where t.code = v_type and t.requestable
      ) then
        raise exception 'requested_type_code % is not a requestable tier', v_type using errcode = '22023';
      end if;
    exception
      when data_exception then
        outcome := 'invalid';
        detail  := sqlerrm;
        return next;
        continue;
    end;

    if exists (
      select 1 from public.boa_acc_person p
       where p.org_id = p_org_id
         and p.phone  = v_phone
         and p.status <> 'voided'
    ) then
      outcome := 'duplicate_phone';
      detail  := 'this phone is already on this organisation''s roster';
      return next;
      continue;
    end if;

    if v_used >= v_quota then
      outcome := 'quota_exceeded';
      detail  := format('quota %s is full', v_quota);
      return next;
      continue;
    end if;

    begin
      insert into public.boa_acc_person (
        org_id, full_name, phone, role_text, vehicle_reg,
        status, submitted_at, requested_type_code, requested_day_validity
      ) values (
        p_org_id, v_name, v_phone, v_role, v_plate,
        'submitted', v_submitted, v_type, v_days
      )
      returning id into v_id;
    exception
      when unique_violation then
        outcome := 'duplicate_phone';
        detail  := 'this phone is already on this organisation''s roster';
        return next;
        continue;
      when check_violation or not_null_violation or foreign_key_violation then
        outcome := 'invalid';
        detail  := sqlerrm;
        return next;
        continue;
    end;

    v_used    := v_used + 1;
    outcome   := 'inserted';
    person_id := v_id;
    detail    := null;
    return next;
  end loop;

  return;
end;
$$;

comment on function public.boa_acc_import_roster(uuid, jsonb) is
  'ACC-117. Lead/admin bulk load of one org''s roster-form rows as status=submitted. Quota under the org row lock (as boa_acc_submit), live-phone duplicates refused, per-row result (inserted / duplicate_phone / quota_exceeded / invalid). No per-token throttle. Sets only the advisory requested_type_code / requested_day_validity; never type_code, day_validity or a pass.';

revoke all on function public.boa_acc_import_roster(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_import_roster(uuid, jsonb)
  to authenticated;

commit;
