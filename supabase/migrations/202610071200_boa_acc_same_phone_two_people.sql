-- Two people on one phone (Vipin, 7 Oct 2026, ADR-032).
--
-- Reynolds' truss technician ABHISHEK THIMMAIAH and PATRICK .A share
-- 8553085354, and Vipin chose to send both passes to that one number rather
-- than skip him. A person was identified by org + phone; it is now org +
-- phone + name (trimmed, whitespace-collapsed, case-folded), so the same
-- phone with a different name is a second person, and the same phone with the
-- same name is still the same person (a repeat is still refused).
--
-- Changes, all inside one organisation:
--   * boa_acc_person_org_phone_idx: unique on (org_id, phone, name key).
--     Strictly looser than the old index, so every existing row stays valid.
--   * boa_acc_import_approve / boa_acc_import_roster: the duplicate check and
--     the "find this person" lookup use phone + name.
-- Unchanged on purpose: a phone live on ANOTHER organisation's roster is
-- still refused (one human, one pass), and boa_acc_aaa_nomination stays keyed
-- on phone alone (two AAA nominations on one phone are not supported).
-- boa_acc_submit needs no edit: it maps the index's unique_violation, which now
-- fires on the same phone and name.
-- CREATE OR REPLACE keeps grants.

begin;

drop index public.boa_acc_person_org_phone_idx;
create unique index boa_acc_person_org_phone_idx
  on public.boa_acc_person (
    org_id, phone, (lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')))
  )
  where status <> 'voided';

create or replace function public.boa_acc_import_roster(p_org_id uuid, p_rows jsonb)
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
      if not (v_phone ~ '^\+[1-9][0-9]{7,14}$' and (v_phone !~ '^\+91' or v_phone ~ '^\+91[6-9][0-9]{9}$')) then
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
         and lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g'))
           = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
         and p.status <> 'voided'
    ) then
      outcome := 'duplicate_phone';
      detail  := 'this person is already on this organisation''s roster';
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
        detail  := 'this person is already on this organisation''s roster';
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


create or replace function public.boa_acc_import_approve(p_org_id uuid, p_rows jsonb)
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
  v_tshirt    text;
  v_note      text;
  v_at_text   text;
  v_submitted timestamptz;
  v_seen      jsonb := '{}'::jsonb;   -- phone|name -> first row_no in this call
  v_existing  public.boa_acc_person;
  v_new       boolean;
  v_nom       public.boa_acc_aaa_nomination;
  v_uid       uuid := (select auth.uid());
  v_key       text;
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
      v_tshirt := nullif(btrim(coalesce(v_row ->> 'tshirt_size', '')), '');
      v_note := null;

      v_at_text := nullif(btrim(coalesce(v_row ->> 'submitted_at', '')), '');
      if v_at_text is not null and v_at_text !~ '(Z|[+-][0-9]{2}(:?[0-9]{2})?)$' then
        raise exception 'submitted_at needs an explicit UTC offset' using errcode = '22023';
      end if;
      v_submitted := coalesce(v_at_text::timestamptz, clock_timestamp());

      if length(v_name) not between 2 and 80 then
        raise exception 'full_name must be 2-80 characters' using errcode = '22023';
      end if;
      if not (v_phone ~ '^\+[1-9][0-9]{7,14}$' and (v_phone !~ '^\+91' or v_phone ~ '^\+91[6-9][0-9]{9}$')) then
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
      if v_tshirt is not null and v_tshirt not in ('S','M','L','XL','XXL','3XL') then
        raise exception 'tshirt_size must be S, M, L, XL, XXL or 3XL' using errcode = '22023';
      end if;
    exception
      when data_exception then
        outcome := 'invalid';
        detail  := sqlerrm;
        return next;
        continue;
    end;

    -- 2. The same phone AND the same name twice in one sheet: the first row
    --    wins, the rest are reported. Never merged. Two different names on one
    --    phone are two people (ADR-032).
    v_key := v_phone || '|' || lower(regexp_replace(v_name, '\s+', ' ', 'g'));
    if v_seen ? v_key then
      outcome := 'duplicate_phone';
      detail  := format('same phone and name as row %s in this import', v_seen ->> v_key);
      return next;
      continue;
    end if;
    v_seen := v_seen || jsonb_build_object(v_key, row_no);

    -- 3. One human, one pass: live on another organisation's roster. A phone
    --    is shared only inside one organisation (ADR-032), so this stays on
    --    the phone alone.
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

    -- 4. Idempotent on phone and name: find this org's live row for the
    --    person. Same phone, different name is a different person.
    select p.* into v_existing
      from public.boa_acc_person p
     where p.org_id = p_org_id
       and p.phone  = v_phone
       and lower(regexp_replace(btrim(p.full_name), '\s+', ' ', 'g'))
         = lower(regexp_replace(v_name, '\s+', ' ', 'g'))
       and p.status <> 'voided'
     for update;
    v_new := v_existing.id is null;

    -- ACC-197: the T-shirt is a gate cue, not an identity or a band, so a
    -- change applies to a person who is already approved (unlike the tier).
    if not v_new and v_existing.tshirt_size is distinct from v_tshirt then
      update public.boa_acc_person
         set tshirt_size = v_tshirt
       where id = v_existing.id;
      v_note := case when v_tshirt is null then 'T-shirt removed'
                     else 'T-shirt set to ' || v_tshirt end;
    end if;

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
          detail  := v_note;
        end if;
        return next;
        continue;
      end if;

      if v_existing.status <> 'submitted' then
        if v_type is null then
          outcome := 'unchanged';
          detail  := v_note;
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
        detail  := v_note;
        return next;
        continue;
      end if;
    else
      -- 5. A new person. Always inserted as submitted first: the approval
      --    below is the same move out of 'submitted' the desk makes.
      begin
        insert into public.boa_acc_person (
          org_id, full_name, phone, role_text, vehicle_reg,
          status, submitted_at, requested_day_validity, tshirt_size
        ) values (
          p_org_id, v_name, v_phone, v_role, v_plate,
          'submitted', v_submitted, v_days, v_tshirt
        )
        returning id into person_id;
      exception
        when unique_violation then
          outcome := 'duplicate_phone';
          detail  := 'this person is already on this organisation''s roster';
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


commit;
