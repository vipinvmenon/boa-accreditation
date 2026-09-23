-- ACC-148 · The double-issue warning.
--
-- THE DEFECT THIS PREVENTS
--
-- Up to ten issuers hand out wristbands on phones that may have no signal
-- (ADR-020). Two of them can each give the same person a band while neither
-- phone can see the other's outbox. Nothing can stop that offline, and the
-- ledger must not try: both bands were physically fastened to a wrist, so
-- both writes are facts, and an append-only ledger never refuses a drain for
-- a data-quality reason (non-negotiable #2, DATA-MODEL.md "Serials are not
-- unique"). Without this migration the second band simply disappears from
-- view — the dashboard counts people, not rows, and the gate pull projects
-- only the latest row per person — so a spare band walks out of the gate
-- and nobody at the desk ever learns it happened.
--
-- WHAT THIS ADDS
--
--  * public.boa_acc_double_issues() — one jsonb element per person holding
--    more than one live wristband, listing EVERY live wristband row they
--    hold: serial, issuer, gate, issue time and sync time. Read-only.
--  * boa_acc_desk_dashboard() gains one key, `doubleIssues` (a count of
--    affected people). Every existing key is unchanged — extended, not
--    renamed — so a client parsing the old contract still parses.
--
-- WHAT COUNTS AS A DOUBLE ISSUE
--
--  * "Live" means the dashboard's own definition: a wristband row that no
--    void row targets (ADR-012). An issue that was voided and then reissued
--    is one live band, not two.
--  * A person is flagged when they hold two or more live wristband rows that
--    are NOT `is_reissue`. A supervisor-noted reissue is a deliberate,
--    recorded decision to hand over a second band (ADR-012: "it adds a ledger
--    row, it does not replace the first") — flagging it would cry wolf at the
--    desk every time a lost band is replaced correctly. The reissue row is
--    still LISTED when the person is flagged for another reason, so the desk
--    sees the whole picture.
--  * Vehicle stickers are out of scope: a live sticker number is already
--    unique (boa_acc_checkin_sticker_no_idx), and ACC-148 is about bands.
--
-- WHO ISSUED IT — OPERATOR OR DEVICE
--
-- ACC-150 (202609221200, written in parallel) moves the gate from device
-- tokens to logged-in issuers and records the operator on every ledger row.
-- Rows written before it carry only the device's denormalised
-- gate_label/volunteer_name. This function must name the issuer for both,
-- and must not fail to install whether or not ACC-150's column exists yet,
-- so the operator id is read with a jsonb key probe on the ledger row
-- (`to_jsonb(c) ->> 'operator_id'`) rather than a column reference:
--
--    issuer = coalesce(boa_acc_operator.display_name  -- ACC-150 rows
--                      , c.volunteer_name)            -- legacy device rows
--
-- The probe returns null for a row (or a schema) without `operator_id`, and
-- the coalesce falls through to the row's own volunteer_name, which the gate
-- RPC has always filled from the authenticated principal. If ACC-150 names
-- the column something other than `operator_id`, operator rows still show
-- the volunteer_name the RPC wrote — correct, just without the join — and
-- `issuerKind` reads 'device'. Revisit this one expression when ACC-150
-- merges.
--
-- WHAT WAS REJECTED
--
--  * A unique index or a trigger that refuses the second band. Rejected by
--    the ledger's own contract: the band is already on a wrist.
--  * Auto-voiding one of the two rows. The desk decides which band is the
--    spare; a function that guesses would be writing to the ledger on a
--    read.
--  * Listing the rows inside boa_acc_desk_dashboard(). The dashboard's
--    comment promises aggregate counts only — no person names. The count
--    lives there; names live behind a separate call the screen makes only
--    when the count is non-zero.
--
-- AUTHORISATION
--
-- In the database (non-negotiable #3): an active lead, approver or admin.
-- The role list is explicit rather than "any operator" so the `issuer` role
-- ACC-150 adds does not inherit a desk read by default. EXECUTE to
-- authenticated only; anon and service_role get nothing
-- (privileges.test.sql).
--
-- VOLATILE for the same snapshot reason as boa_acc_desk_dashboard: a test
-- that appends rows and reads them back in one statement must see them.

begin;

create function public.boa_acc_double_issues()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.boa_acc_is_operator(
    array['lead', 'approver', 'admin']::public.boa_acc_operator_role[]
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  with live as (
    select
      c.id, c.person_id, c.band_serial, c.device_id, c.gate_label,
      c.volunteer_name, c.occurred_at, c.posted_at, c.is_reissue,
      -- ACC-150 probe; see the header. Null on legacy device rows.
      (to_jsonb(c) ->> 'operator_id')::uuid as operator_id
    from public.boa_acc_checkin c
    where c.kind = 'wristband'
      and not exists (
        select 1 from public.boa_acc_checkin v
        where v.kind = 'void' and v.voids_checkin_id = c.id
      )
  ),
  flagged as (
    select l.person_id
    from live l
    group by l.person_id
    having count(*) filter (where not l.is_reissue) > 1
  ),
  people as (
    select
      p.id as person_id,
      p.full_name,
      o.name as org_name,
      p.type_code,
      jsonb_agg(
        jsonb_build_object(
          'checkinId', l.id,
          'bandSerial', l.band_serial,
          'issuerName', coalesce(op.display_name, l.volunteer_name),
          'issuerKind', case when op.user_id is not null then 'operator' else 'device' end,
          'operatorId', op.user_id,
          'deviceId', l.device_id,
          'gateLabel', l.gate_label,
          'occurredAt', l.occurred_at,
          'postedAt', l.posted_at,
          'isReissue', l.is_reissue
        )
        order by l.occurred_at, l.posted_at, l.id
      ) as issues,
      count(*) as live_bands,
      max(l.posted_at) as last_posted_at
    from flagged f
    join live l on l.person_id = f.person_id
    join public.boa_acc_person p on p.id = f.person_id
    join public.boa_acc_org o on o.id = p.org_id
    left join public.boa_acc_operator op on op.user_id = l.operator_id
    group by p.id, p.full_name, o.name, p.type_code
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'personId', pe.person_id,
        'fullName', pe.full_name,
        'orgName', pe.org_name,
        'typeCode', pe.type_code,
        'liveBands', pe.live_bands,
        'issues', pe.issues
      )
      -- Newest sync first: the one the desk has not seen yet is on top.
      order by pe.last_posted_at desc, pe.person_id
    ),
    '[]'::jsonb
  )
  into v_result
  from people pe;

  return v_result;
end;
$$;

comment on function public.boa_acc_double_issues() is
  'ACC-148. One element per person holding two or more live (non-voided, non-reissue) wristband rows, with every live band they hold: serial, issuer (operator if the row names one, else the device volunteer), gate, occurred_at, posted_at. Read-only; the ledger keeps every row. Active lead/approver/admin only.';

revoke all on function public.boa_acc_double_issues()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_double_issues()
  to authenticated;

-- ---------------------------------------------------------------------------
-- boa_acc_desk_dashboard(): identical to 202609120010 plus `doubleIssues`.
-- ---------------------------------------------------------------------------

create or replace function public.boa_acc_desk_dashboard()
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
    'doubleIssues', coalesce(di.double_issues, 0),
    'types', coalesce(t.types, '[]'::jsonb),
    'orgs', coalesce(o.orgs, '[]'::jsonb)
  )
  into v_result
  from (
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
    -- ACC-148: the same rule as boa_acc_double_issues(), counted by person.
    -- A count only — names stay behind that function's own role check.
    select count(*) as double_issues
    from (
      select c.person_id
      from public.boa_acc_checkin c
      where c.kind = 'wristband'
        and not c.is_reissue
        and not exists (
          select 1 from public.boa_acc_checkin v
          where v.kind = 'void' and v.voids_checkin_id = c.id
        )
      group by c.person_id
      having count(*) > 1
    ) dbl
  ) di
  cross join lateral (
    select
      count(*) filter (where approved) as aaa_nominated_approved,
      count(*) filter (where person_id is not null) as aaa_stamped
    from public.boa_acc_aaa_nomination
  ) a
  cross join lateral (
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
  'Every Control-room number in one round trip (DATA-MODEL.md). Any active operator may call it. Returns aggregate counts only — no person names, phones or pass_tokens. doubleIssues (ACC-148) counts people holding two live non-reissue wristbands; boa_acc_double_issues() lists them.';

revoke all on function public.boa_acc_desk_dashboard()
  from public, anon, authenticated, service_role;
grant execute on function public.boa_acc_desk_dashboard()
  to authenticated;

commit;
