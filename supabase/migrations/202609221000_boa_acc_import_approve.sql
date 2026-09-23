-- ACC-141 · boa_acc_import_approve — import the response sheet AND approve
-- what Salman decided in it, in one transaction, in the database.
--
-- WHY (ADR-019, ACC-140a/b/g)
--
-- Column I of the response sheet, "Accreditation Type", is set by Salman and
-- IS the approval. The importer used to load everyone as `submitted`
-- (boa_acc_import_roster, ACC-117) and leave approval to the desk queue; now a
-- filled cell must become an approved person with a pass. Approval and the
-- pass still happen only here, in the database, inside a lead/admin-only
-- SECURITY DEFINER function (non-negotiable #3), and the pass_token is still
-- minted by private.boa_acc_decide_one in the same statement that sets
-- status = 'approved' (non-negotiable #5; the pass_only_when_approved CHECK
-- holds whatever this function does).
--
-- A NEW FUNCTION, NOT `create or replace boa_acc_import_roster`
--
-- The semantics changed (it approves; it has no quota; it is idempotent on
-- phone rather than refusing re-runs as duplicates) and so does the payload
-- (`type_code` / `day_validity` instead of the advisory
-- requested_type_code / requested_day_validity). Replacing a function in
-- place under the same name would leave the ACC-117 test and anyone reading
-- that migration describing something that no longer exists.
-- boa_acc_import_roster is left exactly as it is — applied, tested, and no
-- longer called by scripts/import-roster.mjs. Retiring it (it still enforces
-- the old quota) is a separate decision, not taken here.
--
-- SHAPE
--
--   boa_acc_import_approve(p_org_id uuid, p_rows jsonb)
--     returns table(row_no integer, outcome text, person_id uuid, detail text)
--
--   p_rows: a JSON array (at most 1000) of
--     { row_no, full_name, phone, role_text, vehicle_reg?,
--       type_code?, day_validity, submitted_at? }
--   type_code is column I as a tier code, or null/absent when the cell is
--   blank. day_validity is the form's "Days on site" answer (required: the
--   form requires it and an approval cannot be made without it).
--
-- OUTCOMES, per row
--
--   inserted        new person, column I blank → status 'submitted', no pass
--   approved        column I filled, and the person is new or still
--                   'submitted' → approved via private.boa_acc_decide_one,
--                   pass minted there
--   unchanged       the person is already here and the sheet says the same
--                   thing (same tier and days, or still blank). Nothing is
--                   written. This is what a re-run returns.
--   tier_changed    the person is ALREADY APPROVED and the sheet now says a
--                   different tier or days (or column I was cleared). REPORTED,
--                   NEVER APPLIED: a pass has been issued against the old
--                   decision and may already be in someone's hand.
--   skipped         the person exists but is rejected (or a web-form draft);
--                   column I is not applied over the desk's decision.
--   refused         the approval itself was refused by a guard (e.g.
--                   aaa_not_nominated). A new person stays imported as
--                   'submitted'; the detail says why.
--   duplicate_phone the phone appears earlier in this same call, or is live
--                   on ANOTHER organisation's roster
--   invalid         the row fails a field rule (or is general_admission)
--
-- IDEMPOTENT ON PHONE. A person is matched by (org_id, phone) among
-- non-voided rows — the same key as boa_acc_person_org_phone_idx. Re-running
-- the same CSV approves rows newly decided since the last run and writes
-- nothing else: name, role and plate changes in the sheet are not applied to
-- an existing person either (the sheet is not the master record once a
-- person exists; the desk is).
--
-- AAA AND ARTIST (ACC-140b). Salman choosing AAA or Artist in column I is the
-- approval. The AAA guard in private.boa_acc_decide_one — an approved,
-- unstamped boa_acc_aaa_nomination for this phone — is SATISFIED, not
-- bypassed: before approving as aaa this function records the nomination
-- that column I represents (nominated_by / approved_by = the importing
-- lead/admin, org_hint = the org's name), or approves an existing unapproved
-- nomination for that phone, and then calls decide_one, which checks it and
-- stamps person_id exactly as it does for the desk. A nomination already
-- stamped to someone else is left alone and decide_one refuses
-- (outcome 'refused'). The nomination write and the approval share one
-- sub-transaction, so a refused approval leaves no nomination behind.
-- Artist has no nomination table and decide_one has no artist guard; it is
-- approved like any other tier.
--
-- NO QUOTA (ACC-140g). boa_acc_org.quota is not read. What stays: the
-- `for update` on the org row (so two imports, or an import and a web
-- submission, for one org serialise), the closed-org refusal, and the
-- duplicate-phone refusal.
--
-- WHOLE-CALL REFUSALS: caller not an active lead/admin (42501), payload not
-- an array of at most 1000 (22023), org not found (P0002), org not open
-- (org_closed, P0001).
--
-- WHAT WAS REJECTED
--
--  * Writing type_code / pass_token directly in this function. Rejected:
--    private.boa_acc_decide_one is "the one place a row moves out of
--    submitted" and carries the AAA guard and the pass minting. A second copy
--    is how a guard gets skipped.
--  * Applying a changed tier to an approved person. Rejected (ACC-141): the
--    old pass may be printed or sent. It is reported; the desk decides.
--  * Checking duplicate phones only within the org (as boa_acc_import_roster
--    does). Rejected: an approval now mints a pass, and one human should hold
--    one. A phone live on another org's roster is reported as
--    duplicate_phone with that reason, never merged or moved.
--  * A crew-type → tier mapping. ADR-019: column I is the only source.

begin;

create function public.boa_acc_import_approve(p_org_id uuid, p_rows jsonb)
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
  v_org_name  text;
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
  v_seen      jsonb := '{}'::jsonb;   -- phone -> first row_no in this call
  v_existing  public.boa_acc_person;
  v_new       boolean;
  v_nom       public.boa_acc_aaa_nomination;
  v_uid       uuid := (select auth.uid());
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

  -- The same row lock boa_acc_submit and boa_acc_import_roster take.
  select o.status, o.name
    into v_status, v_org_name
    from public.boa_acc_org o
   where o.id = p_org_id
   for update;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_status is distinct from 'open' then
    raise exception 'org_closed' using errcode = 'P0001';
  end if;

  for v_row, v_ord in
    select e.value, e.ordinality
      from jsonb_array_elements(p_rows) with ordinality as e(value, ordinality)
  loop
    row_no    := v_ord::integer;
    person_id := null;
    detail    := null;

    -- 1. Parse and validate. Every failure here is this row's problem only.
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
      v_type := nullif(btrim(coalesce(v_row ->> 'type_code', '')), '')::public.boa_acc_type_code;
      v_days := nullif(btrim(coalesce(v_row ->> 'day_validity', '')), '')::public.boa_acc_day_validity;

      v_at_text := nullif(btrim(coalesce(v_row ->> 'submitted_at', '')), '');
      if v_at_text is not null and v_at_text !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
        raise exception 'submitted_at needs an explicit UTC offset' using errcode = '22023';
      end if;
      v_submitted := coalesce(v_at_text::timestamptz, clock_timestamp());

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
      if v_days is null then
        raise exception 'day_validity is required' using errcode = '22023';
      end if;
      -- General Admission is the public ticket band, never an accreditation.
      if v_type = 'general_admission' then
        raise exception 'general_admission is not an accreditation' using errcode = '22023';
      end if;
    exception
      when data_exception then
        outcome := 'invalid';
        detail  := sqlerrm;
        return next;
        continue;
    end;

    -- 2. The same phone twice in one sheet: the first row wins, the rest
    --    are reported. Never merged.
    if v_seen ? v_phone then
      outcome := 'duplicate_phone';
      detail  := format('same phone as row %s in this import', v_seen ->> v_phone);
      return next;
      continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_phone, row_no);

    -- 3. One human, one pass: live on another organisation's roster.
    if exists (
      select 1 from public.boa_acc_person p
       where p.phone  = v_phone
         and p.org_id <> p_org_id
         and p.status <> 'voided'
    ) then
      outcome := 'duplicate_phone';
      detail  := 'this phone is already on another organisation''s roster';
      return next;
      continue;
    end if;

    -- 4. Idempotent on phone: find this org's live row for the phone.
    select p.* into v_existing
      from public.boa_acc_person p
     where p.org_id = p_org_id
       and p.phone  = v_phone
       and p.status <> 'voided'
     for update;
    v_new := v_existing.id is null;

    if not v_new then
      person_id := v_existing.id;

      if v_existing.status = 'approved' then
        if v_type is null then
          outcome := 'tier_changed';
          detail  := format('approved as %s/%s; the sheet''s Accreditation Type is now blank; not applied',
                            v_existing.type_code, v_existing.day_validity);
        elsif v_type is distinct from v_existing.type_code
           or v_days is distinct from v_existing.day_validity then
          outcome := 'tier_changed';
          detail  := format('approved as %s/%s; the sheet now says %s/%s; not applied',
                            v_existing.type_code, v_existing.day_validity, v_type, v_days);
        else
          outcome := 'unchanged';
        end if;
        return next;
        continue;
      end if;

      if v_existing.status <> 'submitted' then
        if v_type is null then
          outcome := 'unchanged';
        else
          outcome := 'skipped';
          detail  := format('person is %s; the sheet''s decision was not applied', v_existing.status);
        end if;
        return next;
        continue;
      end if;

      -- Still submitted, and still undecided in the sheet.
      if v_type is null then
        outcome := 'unchanged';
        return next;
        continue;
      end if;
    else
      -- 5. A new person. Always inserted as submitted first: the approval
      --    below is the same move out of 'submitted' the desk makes.
      begin
        insert into public.boa_acc_person (
          org_id, full_name, phone, role_text, vehicle_reg,
          status, submitted_at, requested_day_validity
        ) values (
          p_org_id, v_name, v_phone, v_role, v_plate,
          'submitted', v_submitted, v_days
        )
        returning id into person_id;
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

      if v_type is null then
        outcome := 'inserted';
        return next;
        continue;
      end if;
    end if;

    -- 6. Column I is filled and the person is submitted: approve. One
    --    sub-transaction for the AAA nomination record and the approval, so
    --    a refusal leaves neither behind.
    begin
      if v_type = 'aaa' then
        select n.* into v_nom
          from public.boa_acc_aaa_nomination n
         where n.phone = v_phone
         for update;

        if v_nom.id is null then
          insert into public.boa_acc_aaa_nomination (
            full_name, phone, org_hint, nominated_by,
            approved, approved_at, approved_by
          ) values (
            v_name, v_phone, left(v_org_name, 120), v_uid,
            true, clock_timestamp(), v_uid
          );
        elsif not v_nom.approved then
          update public.boa_acc_aaa_nomination
             set approved    = true,
                 approved_at = clock_timestamp(),
                 approved_by = v_uid
           where id = v_nom.id;
        end if;
        -- An approved nomination already stamped to another person is left
        -- as it is; decide_one refuses with aaa_not_nominated.
      end if;

      perform private.boa_acc_decide_one(person_id, true, v_type, v_days, null);

      outcome := 'approved';
      detail  := case when v_new then null else 'was submitted' end;
    exception
      when raise_exception or check_violation or unique_violation or no_data_found then
        outcome := 'refused';
        detail  := case when v_new then 'imported as submitted; ' else '' end
                   || 'approval refused: ' || sqlerrm;
    end;
    return next;
  end loop;

  return;
end;
$$;

comment on function public.boa_acc_import_approve(uuid, jsonb) is
  'ACC-141. Lead/admin import of one org''s response-sheet rows. Column I (type_code) filled → approved through private.boa_acc_decide_one (pass minted there; AAA nomination recorded first so its guard is satisfied); blank → submitted. Idempotent on (org, phone): a re-run approves newly decided rows and changes nothing else; a changed decision on an approved person is reported (tier_changed), never applied. No quota. Per-row outcome: inserted / approved / unchanged / tier_changed / skipped / refused / duplicate_phone / invalid.';

revoke all on function public.boa_acc_import_approve(uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_import_approve(uuid, jsonb)
  to authenticated;

commit;
