-- ACC-045 · boa_acc_mint_device / boa_acc_revoke_device.
--
-- THE DEFECT THIS PREVENTS
--
-- public.boa_acc_device (202609110001) already exists and already has a read
-- policy (`boa_acc_device_read`, 202609110002) plus an explicit column grant
-- to `authenticated` that omits token_hash. What is missing is the only way
-- to WRITE one: without this migration, /desk/devices would have to reach
-- for `supabase.from('boa_acc_device').insert(...)`, which the RLS lockdown
-- already refuses (no insert/update policy exists anywhere, deliberately —
-- see 202609110002's own header), or someone would be tempted to add one
-- "just for devices" and reopen the exact hole ACC-021 closed.
--
-- WHAT WAS REJECTED
--
--  * Reinventing token generation/hashing. private.boa_acc_new_token() and
--    private.boa_acc_hash_token(text) already exist (202609110001) and are
--    already used by boa_acc_mint_invite for the identical shape of problem
--    ("mint a secret, return it raw exactly once, store only the hash").
--    Reused verbatim.
--  * A `private.boa_acc_revoke_device`, mirroring `private.boa_acc_revoke_invite`.
--    Checked how invite revocation is actually wired end-to-end
--    (app/api/desk/orgs/[id]/invites/route.ts) and found it is NOT wired at
--    all yet — no route calls private.boa_acc_revoke_invite, so there is no
--    existing "public route -> private function via service-role" precedent
--    to match. The precedent that IS live end-to-end is boa_acc_create_org /
--    boa_acc_mint_invite: a `public` SECURITY DEFINER function, checked
--    internally, called by the operator's own session. Revoke follows that
--    shape instead.
--  * Validating `scope` in the function body. `boa_acc_device.scope` already
--    has `check (scope in ('crew','vehicle','both'))`; the column's own CHECK
--    is the judge of the shape, same convention as boa_acc_create_org.
--  * Letting an operator pass NULL to mean "use the column default". The
--    parameter's own default IS the column default (kept in sync by hand,
--    same literal), so a caller who does not override gets exactly what the
--    column would have given a bare INSERT — and an explicit NULL is refused
--    (invalid_expiry) rather than silently doing something surprising.
--
-- CONVENTIONS
--
--  * search_path = '' with fully-qualified names.
--  * lead/admin only, same predicate and array literal as boa_acc_mint_invite
--    and boa_acc_create_org — minting or revoking a gate credential is the
--    same class of decision as minting an org invite.
--  * create function grants EXECUTE to PUBLIC; revoke in this same block,
--    then grant back only to authenticated — the desk route calls these via
--    the operator's own session (lib/supabase-server.ts), never the
--    service-role client. There is no reason for /desk/devices to hold the
--    service role at all.

begin;

-- ---------------------------------------------------------------------------
-- mint_device — desk operator, raw token shown once
-- ---------------------------------------------------------------------------

create function public.boa_acc_mint_device(
  p_gate_label     text,
  p_volunteer_name text,
  p_scope          text default 'crew',
  p_expires_at     timestamptz default timestamptz '2026-10-11 06:00+05:30'
)
returns table(
  device_id      uuid,
  token          text,
  token_hint     text,
  gate_label     text,
  volunteer_name text,
  scope          text,
  expires_at     timestamptz
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

  if p_expires_at is null or p_expires_at <= clock_timestamp() then
    raise exception 'invalid_expiry' using errcode = 'P0001';
  end if;

  v_token := private.boa_acc_new_token();

  return query
  insert into public.boa_acc_device (
    token_hash, token_hint, gate_label, volunteer_name, scope,
    created_by, expires_at
  ) values (
    private.boa_acc_hash_token(v_token),
    left(v_token, 6),
    btrim(p_gate_label),
    btrim(p_volunteer_name),
    coalesce(p_scope, 'crew'),
    (select auth.uid()),
    p_expires_at
  )
  returning
    public.boa_acc_device.id,
    v_token,
    public.boa_acc_device.token_hint,
    public.boa_acc_device.gate_label,
    public.boa_acc_device.volunteer_name,
    public.boa_acc_device.scope,
    public.boa_acc_device.expires_at;
end;
$$;

comment on function public.boa_acc_mint_device(text, text, text, timestamptz) is
  'Mints one gate device credential. lead/admin operators only, checked in the database. Returns the raw token once; only the sha256 and a 6-char hint are ever stored. p_expires_at defaults to the show''s own end time and may be overridden to anything in the future.';

revoke all on function public.boa_acc_mint_device(text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_mint_device(text, text, text, timestamptz)
  to authenticated;

-- ---------------------------------------------------------------------------
-- revoke_device — desk operator
-- ---------------------------------------------------------------------------

create function public.boa_acc_revoke_device(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.boa_acc_is_operator(
    array['lead','admin']::public.boa_acc_operator_role[]
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.boa_acc_device
     set revoked_at = clock_timestamp()
   where id = p_id
     and revoked_at is null;
  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  return p_id;
end;
$$;

comment on function public.boa_acc_revoke_device(uuid) is
  'Revokes one gate device credential. lead/admin operators only. Idempotent revoke (already-revoked or unknown id) raises not found rather than silently succeeding twice.';

revoke all on function public.boa_acc_revoke_device(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_revoke_device(uuid)
  to authenticated;

commit;
