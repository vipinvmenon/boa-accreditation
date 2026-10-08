-- Sending a pass by hand, and the desk remembering it.
--
-- International numbers cannot go through Interakt (lib/interakt.ts), so the
-- desk copies a wa.me link and a lead sends it from the festival phone. Until
-- now nothing recorded that, so the pass stayed "Failed" and counted as unsent
-- (and would be picked up again by "Send unsent").
--
-- boa_acc_pass_send_manual(person) appends a 'sent' row. The table requires a
-- message id on any sent row, so it carries 'manual:<uuid>' — unique, can never
-- match a webhook, and how the desk tells "sent by hand" from an Interakt send.
-- Nothing here claims delivery: WhatsApp never reports on a hand-sent message.

begin;

create function public.boa_acc_pass_send_manual(p_person_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status     public.boa_acc_person_status;
  v_pass_token text;
begin
  if not private.boa_acc_is_operator(array['lead', 'admin']::public.boa_acc_operator_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select p.status, p.pass_token
    into v_status, v_pass_token
    from public.boa_acc_person p
   where p.id = p_person_id
   for update;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if v_status <> 'approved' or v_pass_token is null then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;

  insert into public.boa_acc_pass_send (person_id, sent_by, resend, requested_at, status, status_at, wa_message_id)
  values (p_person_id, (select auth.uid()), false, clock_timestamp(), 'sent', clock_timestamp(),
          'manual:' || gen_random_uuid()::text);
end;
$$;

comment on function public.boa_acc_pass_send_manual(uuid) is
  'A lead/admin sent this pass by hand (wa.me link). Appends a sent row with a manual: message id. Refuses anyone not approved.';

revoke all on function public.boa_acc_pass_send_manual(uuid) from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_send_manual(uuid) to authenticated;

-- boa_acc_pass_sends gains "manual" on the latest send.
create or replace function public.boa_acc_pass_sends()
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

  return jsonb_build_object(
    'canSend', private.boa_acc_is_operator(array['lead', 'admin']::public.boa_acc_operator_role[]),
    'people', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'personId', p.id,
          'phone', p.phone,
          'attempts', coalesce(a.attempts, 0),
          -- Any live row, not just the latest: a failed resend does not
          -- un-deliver the pass that reached them earlier.
          'live', exists (
            select 1
              from public.boa_acc_pass_send z
             where z.person_id = p.id
               and private.boa_acc_pass_send_is_live(z.status, z.wa_message_id, z.requested_at)
          ),
          'last', case when s.id is null then null else jsonb_build_object(
            'sendId', s.id,
            'status', s.status,
            'requestedAt', s.requested_at,
            'statusAt', s.status_at,
            'failureReason', s.failure_reason,
            'hasMessageId', s.wa_message_id is not null,
            'manual', coalesce(s.wa_message_id like 'manual:%', false),
            'sentBy', o.display_name
          ) end
        )
        order by p.pass_ref
      )
      from public.boa_acc_person p
      left join lateral (
        select x.id, x.status, x.requested_at, x.status_at, x.failure_reason,
               x.wa_message_id, x.sent_by
          from public.boa_acc_pass_send x
         where x.person_id = p.id
         order by x.requested_at desc, x.id desc
         limit 1
      ) s on true
      left join lateral (
        select count(*)::integer as attempts
          from public.boa_acc_pass_send y
         where y.person_id = p.id
      ) a on true
      left join public.boa_acc_operator o on o.user_id = s.sent_by
      where p.status = 'approved'
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.boa_acc_pass_sends() from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_sends() to authenticated;

commit;
