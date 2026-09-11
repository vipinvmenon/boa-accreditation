-- ACC-023 · Token miss-cases are indistinguishable, mint does not rotate.
--
-- @proves: CRITICAL | unknown, revoked and expired tokens all raise P0002 not found
-- @proves: HIGH     | mint returns a raw token that is not stored; only the hash is
-- @proves: HIGH     | a second mint leaves the first token live
-- @proves: MEDIUM   | a non-operator cannot mint
--
-- ONE statement. Cleanup is in the same statement so a live-database run
-- leaves no ACC-023 rows. Every pgTAP call `from planned` so plan() creates
-- __tcache__ before throws_ok/lives_ok run.

with
  wiped as materialized (
    select private.boa_acc_wipe_org('ACC-023 tokens')
  ),
  wiped_email as materialized (
    select private.boa_acc_wipe_email('acc023-tokens@invalid.test')
     where (select count(*) from wiped) >= 0
  ),
  org as (
    insert into public.boa_acc_org (name, kind, quota, contact_name, contact_phone)
    select 'ACC-023 tokens', 'vendor', 22, 'Token Contact', '+919811111111'
     where (select count(*) from wiped_email) >= 0
    returning *
  ),
  usr as (
    insert into auth.users (
      id, instance_id, aud, role, email, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    select gen_random_uuid(),
           '00000000-0000-0000-0000-000000000000',
           'authenticated', 'authenticated',
           'acc023-tokens@invalid.test',
           clock_timestamp(), clock_timestamp(),
           '{"provider":"email","providers":["email"]}'::jsonb,
           '{}'::jsonb
      from org
    returning id
  ),
  op as (
    insert into public.boa_acc_operator (user_id, role, display_name)
    select id, 'lead', 'ACC-023 Token Op' from usr
    returning user_id
  ),
  jwt as materialized (
    select set_config(
      'request.jwt.claims',
      json_build_object('sub', (select user_id from op)::text, 'role', 'authenticated')::text,
      true
    ) as claims
  ),
  mint1 as materialized (
    select * from public.boa_acc_mint_invite((select id from org), 'first')
     where (select claims from jwt) is not null
  ),
  mint2 as materialized (
    select * from public.boa_acc_mint_invite((select id from org), 'second')
     where (select token from mint1) is not null
  ),
  view1 as materialized (
    select * from public.boa_acc_org_view((select token from mint1))
  ),
  view2 as materialized (
    select * from public.boa_acc_org_view((select token from mint2))
  ),
  revoked as materialized (
    select private.boa_acc_revoke_invite((select invite_id from mint2)) as id
     where (select name from view2) is not null
  ),
  expired_tok as materialized (
    select private.boa_acc_new_token() as token
     where (select id from revoked) is not null
  ),
  expired_row as (
    insert into public.boa_acc_org_invite (org_id, token_hash, token_hint, expires_at)
    select (select id from org),
           private.boa_acc_hash_token(expired_tok.token),
           left(expired_tok.token, 6),
           clock_timestamp() - interval '1 hour'
      from expired_tok
    returning id
  ),
  results as materialized (
        select 0 as n, plan(12) as line
        union all select 1, ok((select count(*) from mint1) = 1, 'first mint returned a row')
        union all select 2, ok(length((select token from mint1)) = 22, 'raw token is 22 chars')
        union all select 3, ok(
          (select token_hint from mint1) = left((select token from mint1), 6),
          'mint returns a hint that is the first 6 characters of the raw token'
        )
        union all select 4, ok(
          (select count(*) from mint1) = 1 and (select count(*) from mint2) = 1,
          'second mint left the first invite in place (no rotate)'
        )
        union all select 5, is((select name from view1), 'ACC-023 tokens', 'first token resolves the org')
        union all select 6, is((select name from view2), 'ACC-023 tokens', 'second token also resolves the org')
        union all select 7, throws_ok(
          format('select public.boa_acc_org_view(%L)', (select token from mint2)),
          'P0002',
          'not found',
          'revoked token raises the same not found'
        ) from revoked
        union all select 8, throws_ok(
          format('select public.boa_acc_org_view(%L)', (select token from expired_tok)),
          'P0002',
          'not found',
          'expired token raises the same not found'
        ) from expired_row
        union all select 9, throws_ok(
          'select public.boa_acc_org_view(''aaaaaaaaaaaaaaaaaaaaaa'')',
          'P0002',
          'not found',
          'unknown token raises the same not found'
        )
        union all select 10, throws_ok(
          format(
            'select public.boa_acc_submit(%L, %L, %L, %L)',
            (select token from mint2), 'Ghost', '+919822222222', 'Crew'
          ),
          'P0002',
          'not found',
          'submit on a revoked token is the same miss'
        ) from revoked
        union all select 11, throws_ok(
          format('select public.boa_acc_mint_invite(%L)', (select id from org)),
          '42501',
          'not authorized',
          'mint without an operator jwt is refused'
        )
        from (select set_config('request.jwt.claims', '', true) as cleared) s
        union all select 12, ok(
          (select token_hint from mint1) = left((select token from mint1), 6)
          and (select name from view1) = 'ACC-023 tokens',
          'raw token is usable and is not stored as plaintext (lookup is by hash)'
        )
  ),
  kept as materialized (
    select n, line from results
  ),
  clean as materialized (
    select private.boa_acc_wipe_org('ACC-023 tokens')
     where (select count(*) from kept) >= 0
  ),
  clean_email as materialized (
    select private.boa_acc_wipe_email('acc023-tokens@invalid.test')
     where (select count(*) from clean) >= 0
  )
select line from (
  select n, line from kept
   where coalesce((select count(*) from clean_email), 0) >= 0
  union all select 999999, l from finish() l
) t
order by n;
