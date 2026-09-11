-- ACC-023 · Per-token hourly throttle lives in the database.
--
-- @proves: CRITICAL | the 60th submit in an hour is accepted
-- @proves: CRITICAL | the 61st is refused with rate_limited
-- @proves: HIGH     | a different token is not affected by the first token's window
--
-- Hits are seeded on the throttle table so this does not insert 60 people.
-- ONE statement. Cleanup is in the same statement.

with
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-023 throttle')
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-023 throttle', 'vendor', 500, 'Throttle Contact', '+919888888888'
      from wiped
    returning *
  ),
  tok_a as materialized (
    select private.boa_acc_new_token() as token from org
  ),
  tok_b as materialized (
    select private.boa_acc_new_token() as token from org
  ),
  inv_a as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org),
           private.boa_acc_hash_token(tok_a.token),
           left(tok_a.token, 6)
      from tok_a
    returning token_hash
  ),
  inv_b as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint)
    select (select id from org),
           private.boa_acc_hash_token(tok_b.token),
           left(tok_b.token, 6)
      from tok_b
    returning token_hash
  ),
  seed as materialized (
    insert into public.boa_acc_submit_throttle (token_hash, window_start, hits)
    select token_hash, date_trunc('hour', clock_timestamp()), 59
      from inv_a
    returning hits
  ),
  sixtieth as materialized (
    select public.boa_acc_submit(
      (select token from tok_a), 'Sixty', '+919890000060', 'Crew'
    ) as person_id
     where (select hits from seed) = 59
       and (select token_hash from inv_b) is not null
  ),
  other as materialized (
    select public.boa_acc_submit(
      (select token from tok_b), 'Other token', '+919890000061', 'Crew'
    ) as person_id
     where (select person_id from sixtieth) is not null
  ),
  results as materialized (
    select n, line from (
        select 0 as n, (select plan(3) from (select 1) s) as line
        union all select 1, ok(
          (select person_id from sixtieth) is not null,
          '60th submit in the hour is accepted'
        )
        union all select 2, throws_ok(
          format(
            'select public.boa_acc_submit(%L, %L, %L, %L)',
            (select token from tok_a), 'Sixty one', '+919890000062', 'Crew'
          ),
          'P0001',
          'rate_limited',
          '61st submit in the hour is refused'
        )
        union all select 3, ok(
          (select person_id from other) is not null,
          'a second live token is not throttled by the first'
        )
    ) x
     where (select person_id from sixtieth) is not null
       and (select person_id from other) is not null
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-023 throttle')
     where (select count(*) from kept) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
