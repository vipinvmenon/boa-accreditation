-- ACC-023 · mint_invite / org_view / submit.
--
-- THE DEFECT THIS PREVENTS
--
-- The public form's "14 / 22 SEATS USED" bar is an affordance. Two contacts
-- pasting the same link on two phones must not both get past the quota. The
-- ceiling is `select … for update` on the org row inside boa_acc_submit, and
-- the acceptance test is a 23rd insert refused — not a click.
--
-- The same function is the only writer of boa_acc_submit_throttle. The
-- in-memory Map in lib/rate-limit.ts (ACC-024) cannot see a second Vercel
-- instance; this table can. 60 submits in an hour from one token, the 61st
-- is refused.
--
-- WHAT WAS REJECTED
--
--  * Granting EXECUTE on these RPCs to `anon`. ADR-004: the anon key ships
--    in the browser bundle and gets nothing. Route handlers (ACC-024) hold
--    the service-role key and call the same token-first functions.
--  * Distinguishing unknown / revoked / expired tokens. A 403 on a real
--    token and a 404 on a fake one lets anyone probe which 22-character
--    strings exist. All three raise the same `not found` / P0002.
--  * Rotating the org's only invite on resend. Multiple live hashed tokens
--    are the point of boa_acc_org_invite; mint does not revoke siblings.
--
-- CONVENTIONS
--
--  * search_path = '' on every function, fully-qualified names.
--  * Hash with private.boa_acc_hash_token → pg_catalog.sha256, never digest().
--  * create function grants EXECUTE to PUBLIC; revoke in this same block.
--  * Collect only name, phone, role, optional plate. No new columns.

begin;

-- ---------------------------------------------------------------------------
-- Resolve a live invite, or don't. The three miss-cases are one path.
-- ---------------------------------------------------------------------------

create function private.boa_acc_live_invite(p_token text)
returns public.boa_acc_org_invite
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.boa_acc_org_invite;
begin
  if p_token is null then
    return r;
  end if;
  select i.* into r
    from public.boa_acc_org_invite i
   where i.token_hash = private.boa_acc_hash_token(btrim(p_token))
     and i.revoked_at is null
     and i.expires_at > clock_timestamp();
  return r;
end;
$$;

comment on function private.boa_acc_live_invite(text) is
  'Returns the invite row only when the token is live. Unknown, revoked and expired all return NULL — the caller raises the same not-found.';

revoke all on function private.boa_acc_live_invite(text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mint_invite — desk operator, raw token shown once
-- ---------------------------------------------------------------------------

create function public.boa_acc_mint_invite(p_org_id uuid, p_label text default null)
returns table(
  invite_id   uuid,
  token       text,
  token_hint  text,
  expires_at  timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not private.boa_acc_is_operator(
    array['lead','admin']::public.boa_acc_operator_role[]
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.boa_acc_org o where o.id = p_org_id) then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  v_token := private.boa_acc_new_token();

  return query
  insert into public.boa_acc_org_invite (
    org_id, token_hash, token_hint, label, created_by
  ) values (
    p_org_id,
    private.boa_acc_hash_token(v_token),
    left(v_token, 6),
    nullif(btrim(coalesce(p_label, '')), ''),
    (select auth.uid())
  )
  returning
    public.boa_acc_org_invite.id,
    v_token,
    public.boa_acc_org_invite.token_hint,
    public.boa_acc_org_invite.expires_at;
end;
$$;

comment on function public.boa_acc_mint_invite(uuid, text) is
  'Mints one more live invite for an org. Does not revoke siblings. Returns the raw token once; only the sha256 and a 6-char hint are stored.';

revoke all on function public.boa_acc_mint_invite(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_mint_invite(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- org_view — token-first, for the submission screen
-- ---------------------------------------------------------------------------

create function public.boa_acc_org_view(p_token text)
returns table(
  org_id        uuid,
  name          text,
  kind          public.boa_acc_org_kind,
  status        public.boa_acc_org_status,
  quota         integer,
  used          integer,
  remaining     integer,
  default_type  public.boa_acc_type_code
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  inv public.boa_acc_org_invite;
  v_used integer;
begin
  inv := private.boa_acc_live_invite(p_token);
  if inv.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  select count(*)::integer into v_used
    from public.boa_acc_person p
   where p.org_id = inv.org_id
     and p.status <> 'voided';

  return query
  select
    o.id,
    o.name,
    o.kind,
    o.status,
    o.quota,
    v_used,
    greatest(o.quota - v_used, 0),
    o.default_type
  from public.boa_acc_org o
  where o.id = inv.org_id;
end;
$$;

comment on function public.boa_acc_org_view(text) is
  'Token-first org projection for /s/[token]. Unknown/revoked/expired tokens raise the same not found. Does not return contact phone or any token.';

revoke all on function public.boa_acc_org_view(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_org_view(text)
  to service_role;

-- ---------------------------------------------------------------------------
-- submit — quota under a row lock, throttle per token per hour
-- ---------------------------------------------------------------------------

create function public.boa_acc_submit(
  p_token       text,
  p_full_name   text,
  p_phone       text,
  p_role_text   text,
  p_vehicle_reg text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv     public.boa_acc_org_invite;
  org     public.boa_acc_org;
  v_hits  integer;
  v_used  integer;
  v_id    uuid;
  v_phone text;
  v_plate text;
begin
  inv := private.boa_acc_live_invite(p_token);
  if inv.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  -- Count this attempt against the token even if quota later refuses it.
  -- Unknown tokens never reach here, so we do not create throttle rows for
  -- probes of random strings.
  insert into public.boa_acc_submit_throttle as t (token_hash, window_start, hits)
  values (inv.token_hash, date_trunc('hour', clock_timestamp()), 1)
  on conflict (token_hash, window_start)
  do update set hits = t.hits + 1
  returning t.hits into v_hits;

  if v_hits > 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  select o.* into org
    from public.boa_acc_org o
   where o.id = inv.org_id
   for update;

  if org.status is distinct from 'open' then
    raise exception 'org_closed' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_used
    from public.boa_acc_person p
   where p.org_id = org.id
     and p.status <> 'voided';

  if v_used >= org.quota then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  v_phone := regexp_replace(btrim(p_phone), '\s', '', 'g');
  v_plate := nullif(
    upper(regexp_replace(btrim(coalesce(p_vehicle_reg, '')), '\s', '', 'g')),
    ''
  );

  begin
    insert into public.boa_acc_person (
      org_id, full_name, phone, role_text, vehicle_reg,
      status, submitted_at
    ) values (
      org.id,
      btrim(p_full_name),
      v_phone,
      btrim(p_role_text),
      v_plate,
      'submitted',
      clock_timestamp()
    )
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'duplicate_phone' using errcode = 'P0001';
  end;

  update public.boa_acc_org_invite
     set last_used_at = clock_timestamp(),
         use_count    = use_count + 1
   where id = inv.id;

  return v_id;
end;
$$;

comment on function public.boa_acc_submit(text, text, text, text, text) is
  'Token-first person insert. Locks the org row, enforces quota, and bumps the per-token hourly throttle. Collects only name, phone, role, optional plate.';

revoke all on function public.boa_acc_submit(text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_submit(text, text, text, text, text)
  to service_role;

commit;
