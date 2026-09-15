-- ACC-091 · boa_acc_org_roster().
--
-- THE DEFECT THIS PREVENTS
--
-- The public submission page needs to show the current server roster for the
-- invite token's organisation. Keeping that list in browser state makes each
-- vendor see only their own additions, while the design contract requires the
-- shared "Your list" to survive reloads and reflect decisions made at the
-- desk.
--
-- WHAT WAS REJECTED
--
-- * Returning phone numbers, vehicle registrations, or pass credentials.
--   The page needs only full name, role and workflow status; returning more
--   would unnecessarily expose personal data to every holder of an org link.
-- * Accepting org_id separately from the token. The token is the authority
--   boundary, so the function resolves it first and cannot be redirected to a
--   different organisation by a caller-controlled identifier.
--
-- CONVENTIONS
--
-- * Unknown, revoked and expired tokens all raise P0002 through
--   private.boa_acc_live_invite, matching boa_acc_org_view.
-- * Draft and voided rows are not roster entries. Submitted, approved and
--   rejected rows are returned in creation order.
-- * The route uses the service-role client, so this RPC is service-role-only.
--   anon and authenticated retain zero EXECUTE.

begin;

create function public.boa_acc_org_roster(p_token text)
returns table(
  full_name text,
  role_text text,
  status    public.boa_acc_person_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_invite public.boa_acc_org_invite;
begin
  v_invite := private.boa_acc_live_invite(p_token);
  if v_invite.id is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  return query
  select
    p.full_name,
    p.role_text,
    p.status
  from public.boa_acc_person p
  where p.org_id = v_invite.org_id
    and p.status in ('submitted', 'approved', 'rejected')
  order by p.created_at asc, p.id asc;
end;
$$;

comment on function public.boa_acc_org_roster(text) is
  'Token-first roster projection for /s/[token]. Returns only full name, role and submitted/approved/rejected status; never phone, vehicle registration or pass credentials.';

revoke all on function public.boa_acc_org_roster(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_org_roster(text)
  to service_role;

commit;
