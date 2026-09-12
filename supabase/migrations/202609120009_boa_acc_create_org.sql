-- ACC-027 · boa_acc_create_org.
--
-- THE DEFECT THIS PREVENTS
--
-- There are deliberately no insert/update/delete RLS policies anywhere in
-- this schema (202609110002) — every write goes through a SECURITY DEFINER
-- RPC that validates the caller before touching a row. boa_acc_org is no
-- exception: without this function, /desk/orgs would have to reach for
-- `supabase.from('boa_acc_org').insert(...)`, which the RLS lockdown already
-- refuses (no write policy exists), or worse, someone would be tempted to add
-- one "just for orgs" and reopen exactly the hole ACC-021 closed.
--
-- WHAT WAS REJECTED
--
--  * An insert RLS policy gated on private.boa_acc_is_operator(). Rejected
--    for the same reason ACC-021's header gives for every other table: a
--    write policy bypasses whatever validation the RPC would otherwise do,
--    and "the RPC does the real check" stops being true the day someone adds
--    a second write path.
--  * Trusting the client to only submit sane values. Every shape rule (name
--    length, quota range, phone format, contact name length) is already a
--    CHECK constraint on public.boa_acc_org — this function relies on those
--    firing rather than re-deriving them, so the rule holds even if a second
--    caller of this RPC is ever written.
--
-- CONVENTIONS
--
--  * search_path = '' with fully-qualified names, same as every function in
--    202609110001/4.
--  * lead/admin only, same predicate and same array literal as
--    boa_acc_mint_invite — an org and its first invite are created by the
--    same class of operator.
--  * create function grants EXECUTE to PUBLIC; revoke in this same block,
--    then grant back only to authenticated — the desk route handler calls
--    this via the operator's own session (lib/supabase-server.ts), never the
--    service-role client. There is no reason for /desk/orgs to hold the
--    service role at all.

begin;

create function public.boa_acc_create_org(
  p_name          text,
  p_kind          public.boa_acc_org_kind,
  p_quota         integer,
  p_contact_name  text,
  p_contact_phone text,
  p_default_type  public.boa_acc_type_code default 'crew'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_phone text;
begin
  if not private.boa_acc_is_operator(
    array['lead','admin']::public.boa_acc_operator_role[]
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Same normalisation as boa_acc_submit: strip whitespace, then let the
  -- column's own CHECK be the judge of the shape.
  v_phone := regexp_replace(btrim(coalesce(p_contact_phone, '')), '\s', '', 'g');

  begin
    insert into public.boa_acc_org (
      name, kind, quota, contact_name, contact_phone, default_type
    ) values (
      btrim(p_name),
      p_kind,
      p_quota,
      btrim(p_contact_name),
      v_phone,
      coalesce(p_default_type, 'crew')
    )
    returning public.boa_acc_org.id into v_id;
  exception
    when unique_violation then
      raise exception 'duplicate_name' using errcode = 'P0001';
  end;

  return v_id;
end;
$$;

comment on function public.boa_acc_create_org(text, public.boa_acc_org_kind, integer, text, text, public.boa_acc_type_code) is
  'Creates one organisation. lead/admin operators only, checked in the database, not by the screen. Normalises the contact phone; a repeated name raises duplicate_name. status defaults to open — no RPC sets it here.';

revoke all on function public.boa_acc_create_org(text, public.boa_acc_org_kind, integer, text, text, public.boa_acc_type_code)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_create_org(text, public.boa_acc_org_kind, integer, text, text, public.boa_acc_type_code)
  to authenticated;

commit;
