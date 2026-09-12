-- ACC-033 · boa_acc_desk_dashboard().
--
-- THE DEFECT THIS PREVENTS
--
-- Without this, /desk (the Control room) would need eight separate
-- authenticated reads — one per stat, one per type, one per org row's used
-- count — each subject to its own RLS evaluation and each a network round
-- trip on a desk laptop or a phone on festival wifi. docs/DATA-MODEL.md
-- calls this out by name: "The Control room is one query, not eight."
-- Everything the screen needs comes back as one jsonb value.
--
-- WHAT WAS REJECTED
--
--  * Two separate views (boa_acc_person_state, boa_acc_sticker_current)
--    named in DATA-MODEL.md, built as a prerequisite. Rejected for now: the
--    "latest non-voided checkin per person" logic they'd encapsulate is
--    needed here in exactly one shape (a distinct-person count, not a
--    per-person row), so it is inlined. ACC-042 (Master list) needs the
--    per-person row shape and can extract the shared logic into those views
--    then, when there is a second real caller to justify it.
--  * A materialized view refreshed on write. Rejected: nothing here is slow
--    enough to need it yet, and a stale Control room the day quota disputes
--    happen would be worse than a few extra milliseconds per load.
--  * Selecting boa_acc_person.full_name/phone for the org list. The screen
--    only needs aggregate counts per org, not a roster — non-negotiable #9's
--    spirit (collect/expose only what's needed) applies to reads too.
--
-- CONVENTIONS
--
--  * search_path = '' with fully-qualified names, same as every function.
--  * Any active operator may call this (lead, admin AND approver) — unlike
--    boa_acc_create_org, the Control room is a read the whole desk shares,
--    not a lead/admin-only write. private.boa_acc_is_operator() with no
--    array argument checks exactly that.
--  * VOLATILE, not STABLE, for the same reason 202609110005 made org_view
--    and live_invite volatile: a STABLE function shares the calling
--    statement's snapshot and cannot see rows written by an earlier CTE of
--    the SAME statement — exactly how supabase/tests/dashboard.test.sql (and
--    any future "approve, then read the dashboard" admin flow) calls it.
--    This function does no writes itself, so there is no correctness cost in
--    production: every real caller is its own fresh statement either way.
--  * grant EXECUTE to authenticated only, same as boa_acc_create_org: the
--    desk route calls this via the operator's own session
--    (lib/supabase-server.ts), never the service-role client.

begin;

create function public.boa_acc_desk_dashboard()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.boa_acc_is_operator() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'submittedTotal', coalesce(p.submitted_total, 0),
    'submittedOrgs', coalesce(p.submitted_orgs, 0),
    'approvedTotal', coalesce(p.approved_total, 0),
    'pendingTotal', coalesce(p.pending_total, 0),
    'bandsIssued', coalesce(bw.bands_issued, 0),
    'bandsNotCollected', greatest(coalesce(p.approved_total, 0) - coalesce(bw.bands_issued, 0), 0),
    'stickersActive', coalesce(bs.stickers_active, 0),
    'stickersPending', greatest(coalesce(p.vehicles_approved, 0) - coalesce(bs.stickers_active, 0), 0),
    'bmsAdded', coalesce(p.bms_added, 0),
    'bmsPending', coalesce(p.bms_pending, 0),
    'aaaStamped', coalesce(a.aaa_stamped, 0),
    'aaaNominatedApproved', coalesce(a.aaa_nominated_approved, 0),
    'types', coalesce(t.types, '[]'::jsonb),
    'orgs', coalesce(o.orgs, '[]'::jsonb)
  )
  into v_result
  from (
    -- Only 'submitted' | 'approved' | 'rejected' count as "in the pipeline" —
    -- a 'draft' row has never been through boa_acc_submit, and 'voided' is a
    -- withdrawn entry that never occupied a decision.
    select
      count(*) filter (where status in ('submitted', 'approved', 'rejected')) as submitted_total,
      count(distinct org_id) filter (where status in ('submitted', 'approved', 'rejected')) as submitted_orgs,
      count(*) filter (where status = 'approved') as approved_total,
      count(*) filter (where status = 'submitted') as pending_total,
      count(*) filter (where status = 'approved' and vehicle_reg is not null) as vehicles_approved,
      count(*) filter (where in_bms) as bms_added,
      count(*) filter (where status = 'approved' and not in_bms) as bms_pending
    from public.boa_acc_person
  ) p
  cross join lateral (
    -- A wristband checkin is "active" unless some later void row targets it.
    -- Counted by person, not by row, so a reissue (which appends a second
    -- wristband row after voiding the first) still counts as one band held.
    select count(distinct c.person_id) as bands_issued
    from public.boa_acc_checkin c
    where c.kind = 'wristband'
      and not exists (
        select 1 from public.boa_acc_checkin v
        where v.kind = 'void' and v.voids_checkin_id = c.id
      )
  ) bw
  cross join lateral (
    select count(distinct c.person_id) as stickers_active
    from public.boa_acc_checkin c
    where c.kind = 'vehicle_sticker'
      and not exists (
        select 1 from public.boa_acc_checkin v
        where v.kind = 'void' and v.voids_checkin_id = c.id
      )
  ) bs
  cross join lateral (
    -- C9 (DATA-MODEL.md): two different, both-true AAA statistics, from the
    -- nomination table's own comment — never reconciled into one number.
    -- aaa_nominated_approved: Salman's named list, `where approved`.
    -- aaa_stamped: of those, how many are actually stamped onto a person's
    -- approved pass — `where person_id is not null` — which is what the
    -- 'aaa' row in `types` below also reflects.
    select
      count(*) filter (where approved) as aaa_nominated_approved,
      count(*) filter (where person_id is not null) as aaa_stamped
    from public.boa_acc_aaa_nomination
  ) a
  cross join lateral (
    -- crew/stage: approved persons carrying that type_code. aaa is the one
    -- exception (see `a` above, and its comment): AAA is never assigned by
    -- type_code alone, so its count is aaa_stamped, not a boa_acc_person
    -- count, to match the single definition this project uses everywhere.
    select jsonb_agg(jsonb_build_object('code', tt.code, 'count', tt.cnt) order by tt.sort_order) as types
    from (
      select ty.code, ty.sort_order,
        case when ty.code = 'aaa' then a.aaa_stamped
             else count(pe.id) end as cnt
      from public.boa_acc_type ty
      left join public.boa_acc_person pe
        on pe.type_code = ty.code and pe.status = 'approved' and ty.code <> 'aaa'
      group by ty.code, ty.sort_order, a.aaa_stamped
    ) tt
  ) t
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', o.id,
      'name', o.name,
      'kind', o.kind,
      'defaultType', o.default_type,
      'contactName', o.contact_name,
      'contactPhone', o.contact_phone,
      'quota', o.quota,
      'used', coalesce(u.used, 0),
      'status', o.status
    ) order by o.created_at desc) as orgs
    from public.boa_acc_org o
    left join lateral (
      select count(*) as used
      from public.boa_acc_person pe
      where pe.org_id = o.id and pe.status in ('submitted', 'approved', 'rejected')
    ) u on true
  ) o;

  return v_result;
end;
$$;

comment on function public.boa_acc_desk_dashboard() is
  'Every Control-room number in one round trip (DATA-MODEL.md). Any active operator may call it. Returns aggregate counts only — no person names, phones or pass_tokens.';

revoke all on function public.boa_acc_desk_dashboard()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_desk_dashboard()
  to authenticated;

commit;
