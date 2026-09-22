-- ACC-144 · The send record for passes delivered on WhatsApp (ACC-140d/f).
--
-- WHAT THIS IS
--
-- The app sends each approved person their pass through the WhatsApp Business
-- Cloud API (docs/WHATSAPP.md). Every attempt is one row here: who asked for
-- it, when, the message ID Meta gave back, and the delivery status Meta's
-- webhook reports afterwards. The record is what lets the desk say "no one was
-- sent twice by accident, and no one was missed".
--
-- THE FLOW (app/api/desk/passes/send/route.ts, app/api/whatsapp/webhook)
--
--   1. boa_acc_pass_send_begin(person, resend)   lead/admin session
--        refuses anyone not approved (no pass_token → nothing to send,
--        non-negotiable #5), refuses a second send while one is live unless
--        resend is explicit, inserts a 'queued' row, and hands the route the
--        three things the template needs: the number, the first name, the
--        pass token.
--   2. the route calls Meta, then boa_acc_pass_send_record(send, id, reason)
--        stores Meta's message ID, or marks the row failed with Meta's reason.
--   3. Meta's webhook → boa_acc_pass_send_status(message id, status, at,
--        reason), service_role only — the webhook has no operator session;
--        its authorisation is the X-Hub-Signature-256 HMAC checked in the
--        route before this is ever called.
--
-- "LIVE" = queued, sent, delivered or read. A failed send is not live, so the
-- person counts as unsent again. A queued row with no Meta message ID older
-- than 10 minutes is also not live: the route died between step 1 and step 2
-- (a timeout, a deploy) and Meta never answered. Without that, one crashed
-- request would block the person until someone knew to press resend.
--
-- STATUS NEVER GOES BACKWARDS. Meta does not promise webhook order; a
-- 'delivered' can arrive before its 'sent'. queued < sent < delivered < read,
-- and 'failed' only lands on a row that has not yet been delivered.
--
-- NOT THE LEDGER. Non-negotiable #2 is about boa_acc_checkin. This table is
-- mutable by design (a status moves), but only through these functions:
-- nobody holds a table grant on it, not even service_role.
--
-- DELETE BEHAVIOUR. person_id cascades so private.boa_acc_wipe_org (tests,
-- dummy data) still works; sent_by is set null on user deletion, the same
-- decision 202609141600 made for every other attribution column — a message
-- that was sent stays sent when the operator who pressed the button leaves.

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create type public.boa_acc_pass_send_status as enum
  ('queued', 'sent', 'delivered', 'read', 'failed');

create table public.boa_acc_pass_send (
  id             uuid primary key default gen_random_uuid(),
  person_id      uuid not null references public.boa_acc_person(id) on delete cascade,
  sent_by        uuid references auth.users(id) on delete set null,
  resend         boolean not null default false,
  requested_at   timestamptz not null default now(),
  status         public.boa_acc_pass_send_status not null default 'queued',
  status_at      timestamptz not null default now(),
  wa_message_id  text unique check (wa_message_id is null or length(wa_message_id) between 1 and 200),
  failure_reason text check (failure_reason is null or length(failure_reason) <= 500),

  constraint boa_acc_pass_send_failed_has_reason check (
    status <> 'failed' or length(btrim(coalesce(failure_reason, ''))) > 0
  ),
  -- Meta cannot report delivery of a message it never acknowledged.
  constraint boa_acc_pass_send_progress_has_message_id check (
    status not in ('sent', 'delivered', 'read') or wa_message_id is not null
  )
);

comment on table public.boa_acc_pass_send is
  'ACC-144. One row per WhatsApp pass send attempt. Written only by boa_acc_pass_send_* SECURITY DEFINER functions; zero table grants.';
comment on column public.boa_acc_pass_send.wa_message_id is
  'The wamid Meta returns from POST /{phone-number-id}/messages. The webhook matches statuses on it.';

create index boa_acc_pass_send_person_idx
  on public.boa_acc_pass_send (person_id, requested_at desc);

alter table public.boa_acc_pass_send enable row level security;
alter table public.boa_acc_pass_send force row level security;
revoke all on public.boa_acc_pass_send from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. What counts as live (blocks a second send)
-- ---------------------------------------------------------------------------

create function private.boa_acc_pass_send_is_live(
  p_status public.boa_acc_pass_send_status,
  p_wa_message_id text,
  p_requested_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_status = 'failed' then false
    when p_status = 'queued' and p_wa_message_id is null
         and p_requested_at < now() - interval '10 minutes' then false
    else true
  end;
$$;
-- STABLE, not IMMUTABLE: it reads now(). Never index on it.

revoke all on function private.boa_acc_pass_send_is_live(public.boa_acc_pass_send_status, text, timestamptz)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. boa_acc_pass_sends — the desk's view of who has been sent what
-- ---------------------------------------------------------------------------
--
-- Any active operator may read it (the pass sheet is open to every operator);
-- canSend says whether this caller may press Send. Phone is returned for the
-- one-tap wa.me fallback; authenticated already holds a column grant on
-- boa_acc_person.phone, so this reveals nothing new.

create function public.boa_acc_pass_sends()
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

comment on function public.boa_acc_pass_sends() is
  'ACC-144. Latest WhatsApp send per approved person, plus whether the caller (lead/admin) may send. Active operators only.';

revoke all on function public.boa_acc_pass_sends() from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_sends() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. boa_acc_pass_send_unsent — who "Send all unsent" means
-- ---------------------------------------------------------------------------

create function public.boa_acc_pass_send_unsent()
returns uuid[]
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.boa_acc_is_operator(array['lead', 'admin']::public.boa_acc_operator_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return coalesce((
    select array_agg(p.id order by p.pass_ref)
      from public.boa_acc_person p
     where p.status = 'approved'
       and p.pass_token is not null
       and not exists (
         select 1
           from public.boa_acc_pass_send s
          where s.person_id = p.id
            and private.boa_acc_pass_send_is_live(s.status, s.wa_message_id, s.requested_at)
       )
  ), array[]::uuid[]);
end;
$$;

comment on function public.boa_acc_pass_send_unsent() is
  'ACC-144. Approved people with no live WhatsApp send. Lead/admin only.';

revoke all on function public.boa_acc_pass_send_unsent() from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_send_unsent() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. boa_acc_pass_send_begin — claim one send
-- ---------------------------------------------------------------------------
--
-- Errors (the route maps each to an HTTP status):
--   42501 not authorized  — no active lead/admin row
--   P0002 not found       — no such person
--   P0001 not_approved    — not approved, so no pass_token to send
--   P0001 already_sent    — a live send exists and p_resend is false
--
-- The person row is locked FOR UPDATE, so two leads pressing Send on the same
-- person at the same moment serialise: the second sees the first's queued row
-- and gets already_sent.

create function public.boa_acc_pass_send_begin(p_person_id uuid, p_resend boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status     public.boa_acc_person_status;
  v_full_name  text;
  v_phone      text;
  v_pass_token text;
  v_send_id    uuid;
begin
  if not private.boa_acc_is_operator(array['lead', 'admin']::public.boa_acc_operator_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select p.status, p.full_name, p.phone, p.pass_token
    into v_status, v_full_name, v_phone, v_pass_token
    from public.boa_acc_person p
   where p.id = p_person_id
   for update;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;

  if v_status <> 'approved' or v_pass_token is null then
    raise exception 'not_approved' using errcode = 'P0001';
  end if;

  if not coalesce(p_resend, false) and exists (
    select 1
      from public.boa_acc_pass_send s
     where s.person_id = p_person_id
       and private.boa_acc_pass_send_is_live(s.status, s.wa_message_id, s.requested_at)
  ) then
    raise exception 'already_sent' using errcode = 'P0001';
  end if;

  insert into public.boa_acc_pass_send (person_id, sent_by, resend, requested_at, status, status_at)
  values (p_person_id, (select auth.uid()), coalesce(p_resend, false), clock_timestamp(), 'queued', clock_timestamp())
  returning id into v_send_id;

  return jsonb_build_object(
    'sendId', v_send_id,
    'personId', p_person_id,
    'phone', v_phone,
    'firstName', split_part(btrim(regexp_replace(v_full_name, '\s+', ' ', 'g')), ' ', 1),
    'passToken', v_pass_token
  );
end;
$$;

comment on function public.boa_acc_pass_send_begin(uuid, boolean) is
  'ACC-144. Lead/admin only. Refuses a person who is not approved, and a second live send unless p_resend. Returns what the WhatsApp template needs.';

revoke all on function public.boa_acc_pass_send_begin(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_send_begin(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. boa_acc_pass_send_record — what Meta said to the send request
-- ---------------------------------------------------------------------------
--
-- Exactly one of p_wa_message_id / p_failure_reason. Only a 'queued' row with
-- no message ID yet can be recorded, so a replayed call cannot overwrite a
-- status the webhook has already moved on.

create function public.boa_acc_pass_send_record(
  p_send_id uuid,
  p_wa_message_id text,
  p_failure_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.boa_acc_is_operator(array['lead', 'admin']::public.boa_acc_operator_role[]) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if (p_wa_message_id is null) = (p_failure_reason is null) then
    raise exception 'exactly one of message id or failure reason' using errcode = '22023';
  end if;

  update public.boa_acc_pass_send
     set wa_message_id  = p_wa_message_id,
         status         = case when p_failure_reason is null then 'queued' else 'failed' end::public.boa_acc_pass_send_status,
         failure_reason = left(p_failure_reason, 500),
         status_at      = clock_timestamp()
   where id = p_send_id
     and status = 'queued'
     and wa_message_id is null;

  if not found then
    raise exception 'not found' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.boa_acc_pass_send_record(uuid, text, text) is
  'ACC-144. Lead/admin only. Stores Meta''s message id for a queued send, or marks it failed with Meta''s reason.';

revoke all on function public.boa_acc_pass_send_record(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_send_record(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. boa_acc_pass_send_status — the webhook's write
-- ---------------------------------------------------------------------------
--
-- service_role only. Returns true when a row moved, false for a message ID we
-- do not know (another app's message on the same number) or a status that
-- would go backwards. The route answers Meta 200 either way.

create function public.boa_acc_pass_send_status(
  p_wa_message_id text,
  p_status text,
  p_at timestamptz,
  p_failure_reason text default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_new public.boa_acc_pass_send_status;
begin
  if p_status not in ('sent', 'delivered', 'read', 'failed') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;
  v_new := p_status::public.boa_acc_pass_send_status;

  update public.boa_acc_pass_send s
     set status         = v_new,
         status_at      = coalesce(p_at, clock_timestamp()),
         failure_reason = case
                            when v_new = 'failed'
                              then left(coalesce(nullif(btrim(p_failure_reason), ''), 'failed (no reason given)'), 500)
                            else s.failure_reason
                          end
   where s.wa_message_id = p_wa_message_id
     and case v_new
           when 'failed' then s.status in ('queued', 'sent')
           else array_position(array['queued','sent','delivered','read']::text[], s.status::text)
                < array_position(array['queued','sent','delivered','read']::text[], v_new::text)
                and s.status <> 'failed'
         end;

  return found;
end;
$$;

comment on function public.boa_acc_pass_send_status(text, text, timestamptz, text) is
  'ACC-144. service_role only, called by the signature-checked WhatsApp webhook. Moves a send forward; never backwards.';

revoke all on function public.boa_acc_pass_send_status(text, text, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_pass_send_status(text, text, timestamptz, text) to service_role;

commit;
