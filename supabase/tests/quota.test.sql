-- ACC-023 · Quota is enforced inside boa_acc_submit under a row lock.
--
-- @proves: CRITICAL | the 22nd submit against a quota of 22 is accepted
-- @proves: CRITICAL | the 23rd is refused with quota_exceeded
-- @proves: HIGH     | a closed org refuses with org_closed
-- @proves: HIGH     | a duplicate phone in the same org is refused while quota remains
--
-- ONE statement. Cleanup is in the same statement.

with
  wiped as materialized (
    select private.boa_acc_wipe_org(n)
      from (values
        ('ACC-023 quota'),
        ('ACC-023 closed'),
        ('ACC-023 quota-dup')
      ) v(n)
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-023 quota', 'vendor', 22, 'Quota Contact', '+919833333333'
     where (select count(*) from wiped) >= 0
    returning *
  ),
  tok as materialized (
    select private.boa_acc_new_token() as token from org
  ),
  inv as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org),
           private.boa_acc_hash_token(tok.token),
           left(tok.token, 6)
      from tok
    returning id
  ),
  fill as materialized (
    select public.boa_acc_submit(
             (select token from tok),
             'Person ' || i,
             '+91900000' || lpad(i::text, 4, '0'),
             'Crew'
           ) as person_id
      from generate_series(1, 22) i
     where (select id from inv) is not null
  ),
  closed as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone, status)
    select 'ACC-023 closed', 'vendor', 10, 'Closed Contact', '+919844444444', 'closed'
     where (select count(*) from fill) = 22
    returning *
  ),
  closed_tok as materialized (
    select private.boa_acc_new_token() as token from closed
  ),
  closed_inv as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from closed),
           private.boa_acc_hash_token(closed_tok.token),
           left(closed_tok.token, 6)
      from closed_tok
    returning id
  ),
  spare as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-023 quota-dup', 'vendor', 2, 'Dup Contact', '+919866666666'
     where (select id from closed_inv) is not null
    returning *
  ),
  spare_tok as materialized (
    select private.boa_acc_new_token() as token from spare
  ),
  spare_inv as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from spare),
           private.boa_acc_hash_token(spare_tok.token),
           left(spare_tok.token, 6)
      from spare_tok
    returning id
  ),
  spare_one as materialized (
    select public.boa_acc_submit(
      (select token from spare_tok), 'First', '+919877777777', 'Crew'
    ) as person_id
     where (select id from spare_inv) is not null
  ),
  results as materialized (
    select n, line from (
    select 0 as n, plan(6) as line
    union all select 1, is(
      (select count(*)::integer from fill),
      22,
      '22 submits against a quota of 22 all succeed'
    )
    union all select 2, is(
      (select used from public.boa_acc_org_view((select token from tok))),
      22,
      'org_view reports 22 seats used'
    )
    union all select 3, is(
      (select remaining from public.boa_acc_org_view((select token from tok))),
      0,
      'org_view reports 0 remaining'
    )
    union all select 4, throws_ok(
      format(
        'select public.boa_acc_submit(%L, %L, %L, %L)',
        (select token from tok), 'Overflow', '+919000000023', 'Crew'
      ),
      'P0001',
      'quota_exceeded',
      '23rd submit is refused'
    )
    union all select 5, throws_ok(
      format(
        'select public.boa_acc_submit(%L, %L, %L, %L)',
        (select token from spare_tok), 'first ', '+919877777777', 'Stage'
      ),
      'P0001',
      'duplicate_phone',
      'same phone and name in the same org is refused while quota remains'
    )
    union all select 6, throws_ok(
      format(
        'select public.boa_acc_submit(%L, %L, %L, %L)',
        (select token from closed_tok), 'Late', '+919855555555', 'Crew'
      ),
      'P0001',
      'org_closed',
      'a closed org refuses submit'
    )
    ) x
     where (select person_id from spare_one) is not null
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org(n)
      from (values
        ('ACC-023 quota'),
        ('ACC-023 closed'),
        ('ACC-023 quota-dup')
      ) v(n)
     where (select count(*) from kept) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
