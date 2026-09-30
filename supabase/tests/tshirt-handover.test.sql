-- ACC-197b · Handing a crew T-shirt over: one per person, append-only, gate-only.
--
-- @proves: HIGH     | boa_acc_gate_tshirt records the person, the size and the operator
-- @proves: HIGH     | a second hand-over (another phone, a replay) returns the first row: one shirt per person
-- @proves: HIGH     | a person with no crew T-shirt cannot be recorded as handed one (22023)
-- @proves: HIGH     | boa_acc_gate_pull carries tshirtGivenAt for the person, and null for one not yet handed
-- @proves: CRITICAL | a hand-over row can be neither updated nor deleted (55000, append-only)
-- @proves: CRITICAL | no session cannot record a hand-over (42501)
--
-- HOW: the table is append-only, so a committed row could never be cleaned up.
-- Same technique as double-issue.test.sql: the whole scenario is one DO block
-- inside throws_ok, which RAISEs its verdict; the raise rolls back every row
-- the block wrote. Nothing here is ever committed.

select 0 as n, plan(1) as line
union all
select 1, throws_ok(
  $sql$
  do $t$
  declare
    v_org uuid; v_uid uuid; v_p1 uuid; v_p2 uuid;
    v_g1 jsonb; v_g2 jsonb; v_pull jsonb;
    v_org_ids uuid[]; v_res boolean[] := array[]::boolean[];
  begin
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    values ('ACC-197b merch', 'vendor', 10, 'Merch Contact', '+919877197201') returning id into v_org;
    v_uid := gen_random_uuid();
    insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'acc197b-lead@invalid.test', clock_timestamp(), clock_timestamp(),
            '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb);
    insert into public.boa_acc_operator (user_id, role, display_name) values (v_uid, 'lead', 'ACC-197b Lead');
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);

    select array_agg(r.person_id order by r.row_no) into strict v_org_ids
      from public.boa_acc_import_approve(v_org, jsonb_build_array(
        jsonb_build_object('row_no', 2, 'full_name', 'Gift Person', 'phone', '+919197200002', 'role_text', 'Security',
                           'type_code', 'crew', 'day_validity', 'show', 'tshirt_size', 'M'),
        jsonb_build_object('row_no', 3, 'full_name', 'Plain Person', 'phone', '+919197200003', 'role_text', 'Security',
                           'type_code', 'crew', 'day_validity', 'show'))) r;
    v_p1 := v_org_ids[1]; v_p2 := v_org_ids[2];

    v_g1 := public.boa_acc_gate_tshirt(gen_random_uuid(), v_p1);
    v_g2 := public.boa_acc_gate_tshirt(gen_random_uuid(), v_p1);
    v_res := v_res || (v_g1 ->> 'size' = 'M' and v_g1 ->> 'personId' = v_p1::text
                       and (v_g1 ->> 'operatorId') = v_uid::text);
    v_res := v_res || (v_g1 ->> 'id' = v_g2 ->> 'id'
                       and (select count(*) from public.boa_acc_tshirt_handover where person_id = v_p1) = 1);

    begin
      perform public.boa_acc_gate_tshirt(gen_random_uuid(), v_p2);
      v_res := v_res || false;
    exception when sqlstate '22023' then v_res := v_res || true;
    end;

    v_pull := public.boa_acc_gate_pull();
    v_res := v_res || (
      exists (select 1 from jsonb_array_elements(v_pull -> 'roster') e
               where e ->> 'personId' = v_p1::text and e ->> 'tshirtGivenAt' is not null)
      and exists (select 1 from jsonb_array_elements(v_pull -> 'roster') e
               where e ->> 'personId' = v_p2::text and e -> 'tshirtGivenAt' = 'null'::jsonb));

    begin
      update public.boa_acc_tshirt_handover set size = 'S';
      v_res := v_res || false;
    exception when sqlstate '55000' then v_res := v_res || true;
    end;
    begin
      delete from public.boa_acc_tshirt_handover;
      v_res := v_res || false;
    exception when sqlstate '55000' then v_res := v_res || true;
    end;

    perform set_config('request.jwt.claims', '', true);
    begin
      perform public.boa_acc_gate_tshirt(gen_random_uuid(), v_p1);
      v_res := v_res || false;
    exception when sqlstate '42501' then v_res := v_res || true;
    end;

    raise exception 'verdict:%', array_to_string(v_res, ',');
  end
  $t$
  $sql$,
  'P0001',
  'verdict:t,t,t,t,t,t,t',
  'gate T-shirt hand-over: recorded, one per person, refused without a shirt, in the pull, append-only, needs a session')
union all select 999999, l from finish() l
order by 1;
