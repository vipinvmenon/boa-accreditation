-- ACC-144 · the person's own pass page, /p/[passToken].
--
-- WHAT THIS IS
--
-- pass_token has zero table grants (non-negotiable #4) and boa_acc_passes
-- (202609121910) is authenticated-desk-only — it checks
-- private.boa_acc_is_operator() and would refuse the anonymous person the QR
-- was minted for. /p/[passToken] needs the same shape as /s/[token]'s
-- boa_acc_org_view (202609110004): a SECURITY DEFINER function reachable only
-- by the service role, called server-side from app/api/p/[passToken]/route.ts
-- with the raw token as its one input.
--
-- Token-first, not session-first: `pass_token` is looked up directly (same
-- comparison boa_acc_gate_pull already makes at 202609121930 line 215),
-- unlike the org-invite token which is looked up by hash. Both are fine —
-- the invite token is a shared link handed to an org, so its hash sits in a
-- table an operator can otherwise browse; pass_token lives only on
-- boa_acc_person, already ungrantable at the column level, and is generated
-- by private.boa_acc_new_token() (202609110001): 16 bytes from
-- extensions.gen_random_bytes, base64url-encoded to 22 characters — 128 bits
-- of entropy, so guessing one is not a practical attack regardless of rate
-- limiting. No throttle table is added here for that reason.
--
-- Unknown, voided or not-yet-approved all raise the same 'not found' as
-- org_view — never a distinguishable error, so a probe cannot tell an unused
-- 22-character string from a rejected person's old one (docs/ARCHITECTURE.md:
-- "404, never 403 — a 403 confirms a token exists"). The person↔pass_token
-- CHECK constraint (boa_acc_person_pass_only_when_approved, 202609110001)
-- already guarantees pass_token is non-null only while status = 'approved',
-- so the explicit status filter below is defence in depth, not the only gate.
--
-- Returns exactly what the pass card needs and nothing that identifies the
-- person beyond what the QR itself already grants: no phone (non-negotiable
-- — a phone number is never shown, gate or public), no pass_token (the
-- caller already holds it), no person id. type_code/day_validity feed
-- lib/design.ts's tier()/zoneChips() and DAY_VALIDITY client-side, the same
-- as the desk's /desk/passes screen.
--
-- Returns a jsonb object with camelCase keys, same shape as
-- public.boa_acc_passes (202609121910) — that RPC is the desk's printable
-- projection of this same domain, and lib/schemas/pass-view.ts's Zod schema
-- reads these keys directly, no snake_case mapping in the route handler.

begin;

create function public.boa_acc_pass_view(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
           'fullName', p.full_name,
           'role', p.role_text,
           'orgName', o.name,
           'vehicleReg', p.vehicle_reg,
           'passRef', p.pass_ref,
           'typeCode', p.type_code,
           'dayValidity', p.day_validity
         )
    into v_result
    from public.boa_acc_person p
    join public.boa_acc_org o on o.id = p.org_id
   where p.pass_token = p_token
     and p.status = 'approved';

  if v_result is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

comment on function public.boa_acc_pass_view(text) is
  'Token-first pass projection for /p/[passToken]. Unknown/voided/not-yet-approved tokens all raise the same not found (P0002), never a distinguishable error. Never returns phone or pass_token itself.';

revoke all on function public.boa_acc_pass_view(text)
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_view(text)
  to service_role;

commit;
