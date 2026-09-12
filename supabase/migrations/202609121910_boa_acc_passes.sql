-- ACC-043 · authorized pass projection.
--
-- pass_token has zero table grants by design. The desk therefore needs a
-- narrow, database-authorized projection rather than a table read. This
-- function is the only client-facing path for the printable pass payload.
-- It returns approved people only, and checks the operator inside the
-- SECURITY DEFINER boundary.

begin;

create function public.boa_acc_passes()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'fullName', p.full_name,
        'role', p.role_text,
        'vehicleReg', p.vehicle_reg,
        'orgName', o.name,
        'passRef', p.pass_ref,
        'passToken', p.pass_token,
        'typeCode', p.type_code,
        'dayValidity', p.day_validity
      )
      order by p.pass_ref
    )
    from public.boa_acc_person p
    join public.boa_acc_org o on o.id = p.org_id
    where p.status = 'approved'
  ), '[]'::jsonb);
end;
$$;

comment on function public.boa_acc_passes() is
  'Authorized printable pass projection. The only desk path that returns pass_token; active operators only.';

revoke all on function public.boa_acc_passes() from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_passes() to authenticated;

commit;
