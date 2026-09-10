-- ACC-020 · The accreditation core schema.
--
-- Nine domain tables plus one auth-plumbing table, for BOA 2026. The 29-Aug
-- spec proposed five tables; the approved design (design/source/) needs nine,
-- because the spec's five cannot express a single figure on the Control room
-- except "Submitted". See docs/DECISIONS.md ADR-001.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--
-- It creates no policies and grants nothing. Privileges are the whole subject
-- of 202609110002, so that the lockdown is one reviewable unit rather than
-- scattered across every create table. Between the two migrations the tables
-- are RLS-enabled with no policy, which denies everyone except the owner —
-- the safe intermediate state, not an open one.
--
-- CONVENTIONS, and why
--
--  * search_path = '' on every function, with fully-qualified names. Stricter
--    than bar-control's `public, private, pg_temp`, and it removes an entire
--    class of bug: pgcrypto lives in `extensions` on hosted Supabase, so an
--    unqualified gen_random_bytes() silently fails to resolve inside a
--    SECURITY DEFINER function. Fully qualifying makes that impossible.
--  * timestamptz everywhere, never timestamp. Stored UTC, shown Asia/Kolkata.
--  * text, never varchar(n). CHECK constraints where a shape actually matters.
--  * Every design invariant is a CHECK, not a convention. A rule enforced only
--    by an RPC is a rule that holds until someone writes a second RPC.
--
-- Verified against PostgreSQL 17.6 (project tjbfvuboyvaephtewjwq, ap-south-1).

begin;

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public;
comment on schema private is
  'Server-internal helpers. Never exposed through PostgREST; see the API schema setting.';

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.boa_acc_org_kind as enum
  ('vendor', 'crew', 'sponsor', 'media', 'security', 'contractor');

create type public.boa_acc_org_status as enum
  ('open', 'submitted', 'approved', 'closed');

create type public.boa_acc_type_code as enum ('crew', 'stage', 'aaa');

-- ORDER IS LOAD-BEARING. This is the design's own ALL_ZONES sequence
-- (design/source/boa_design_body.html:570). Every zone strip on every screen
-- renders in this order, with zones a pass does NOT hold prefixed '—— '.
-- lib/design.ts carries the same order and tests/unit/design-contract.test.ts
-- fails if the two drift. Do not reorder.
create type public.boa_acc_zone as enum
  ('site', 'backstage', 'stage', 'prod_office', 'bar', 'lounges', 'artist_area');

create type public.boa_acc_day_validity as enum ('build', 'show', 'build_show');

create type public.boa_acc_person_status as enum
  ('draft', 'submitted', 'approved', 'rejected', 'voided');

create type public.boa_acc_checkin_kind as enum ('wristband', 'vehicle_sticker', 'void');

create type public.boa_acc_vehicle_outcome as enum ('cleared', 'turned_away');

create type public.boa_acc_operator_role as enum ('lead', 'approver', 'admin');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- 22 URL-safe characters from 16 random bytes. Used for invite, pass and device
-- tokens. base64 then strip padding and swap the URL-unsafe characters, so the
-- value survives a WhatsApp message and a QR code without escaping.
create function private.boa_acc_new_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
           encode(extensions.gen_random_bytes(16), 'base64'),
           '+/=', '-_'
         );
$$;
comment on function private.boa_acc_new_token() is
  '22-char URL-safe token. extensions.gen_random_bytes is fully qualified because pgcrypto is not on the search_path of a SECURITY DEFINER function.';

-- pg_catalog.sha256, NOT pgcrypto's digest(). digest() lives in the
-- `extensions` schema on hosted Supabase and does not resolve under
-- search_path = '' without qualifying it; sha256(bytea) is core Postgres and
-- always available. bar-control hit this exact wall and wrote it down in
-- 202608220002_live_access.sql — the dry run caught it here in one second.
create function private.boa_acc_hash_token(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.sha256(pg_catalog.convert_to(p_token, 'UTF8'));
$$;

-- Immutability for the append-only tables. Raised as 55000 so the client can
-- tell "you may not change this" apart from "that was invalid".
create function private.boa_acc_reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'BOA accreditation records are append-only; write a new row instead'
    using errcode = '55000';
end;
$$;

-- Keeps updated_at honest without the application having to remember.
create function private.boa_acc_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. boa_acc_type — the three pass classes
-- ---------------------------------------------------------------------------

create table public.boa_acc_type (
  code         public.boa_acc_type_code primary key,
  label        text        not null,
  num_label    text        not null,
  band_name    text        not null,
  colour_dark  text        not null check (colour_dark  ~ '^#[0-9A-F]{6}$'),
  colour_light text        not null check (colour_light ~ '^#[0-9A-F]{6}$'),
  note         text        not null,
  zones        public.boa_acc_zone[] not null check (cardinality(zones) > 0),
  requestable  boolean     not null,
  sort_order   smallint    not null unique,
  created_at   timestamptz not null default now()
);
comment on table public.boa_acc_type is
  'Three types, not the six the 29-Aug spec proposed. Seeded from the design''s TYPES const; see ADR-001.';
comment on column public.boa_acc_type.requestable is
  'false for aaa: it is never offered on the vendor form. The real control is the nomination check in boa_acc_decide.';

-- ---------------------------------------------------------------------------
-- 2. boa_acc_org
-- ---------------------------------------------------------------------------

create table public.boa_acc_org (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(btrim(name)) between 2 and 120),
  kind          public.boa_acc_org_kind not null,
  quota         integer not null check (quota >= 0 and quota <= 500),
  default_type  public.boa_acc_type_code not null default 'crew'
                  references public.boa_acc_type(code),
  contact_name  text not null check (length(btrim(contact_name)) between 2 and 80),
  contact_phone text not null check (contact_phone ~ '^\+91[6-9][0-9]{9}$'),
  status        public.boa_acc_org_status not null default 'open',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on column public.boa_acc_org.contact_phone is
  'Normalised E.164-ish: +91 followed by ten digits starting 6-9. Stored without spaces; the UI formats for display.';
comment on column public.boa_acc_org.quota is
  'The only ceiling on how many people an org may submit. Enforced server-side in boa_acc_submit under a row lock, never by the form.';

create trigger boa_acc_org_touch before update on public.boa_acc_org
  for each row execute function private.boa_acc_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. boa_acc_org_invite — MANY live links per org, on purpose
-- ---------------------------------------------------------------------------
--
-- A single token column on boa_acc_org would be simpler and wrong. Bhoopesh
-- will be asked to resend a lost link, and with one token per org "resend"
-- means "rotate", which silently kills the link already sitting in a WhatsApp
-- group with four other people from that company. Multiple concurrent hashed
-- tokens make a resend a mint. One extra table; removes a guaranteed support
-- incident in the week the links go out.

create table public.boa_acc_org_invite (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.boa_acc_org(id) on delete cascade,
  token_hash   bytea not null unique,
  token_hint   text  not null check (length(token_hint) = 6),
  label        text,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id),
  last_used_at timestamptz,
  use_count    integer not null default 0 check (use_count >= 0),
  revoked_at   timestamptz,
  expires_at   timestamptz not null default (timestamptz '2026-10-11 00:00+05:30')
);
comment on column public.boa_acc_org_invite.token_hint is
  'First 6 characters of the raw token. NOT a secret — it is how the desk tells two live links apart in a list.';

create index boa_acc_org_invite_live_idx
  on public.boa_acc_org_invite (org_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- 4. boa_acc_person — the spine
-- ---------------------------------------------------------------------------

create sequence public.boa_acc_pass_ref_seq start 1;

create table public.boa_acc_person (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid not null references public.boa_acc_org(id) on delete restrict,

  -- THE ONLY PERSONAL DATA COLLECTED. No ID number, no Aadhaar, no photo, no
  -- address, no date of birth. This is non-negotiable #9 and it is enforced
  -- here by the absence of the columns, which is the only enforcement that
  -- cannot be forgotten. A wristband handout needs a name, a phone and a
  -- company; anything more is a liability carried until deletion.
  full_name   text not null check (length(btrim(full_name)) between 2 and 80),
  phone       text not null check (phone ~ '^\+91[6-9][0-9]{9}$'),
  role_text   text not null check (length(btrim(role_text)) between 2 and 60),
  vehicle_reg text check (vehicle_reg ~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$'),

  status       public.boa_acc_person_status not null default 'draft',
  type_code    public.boa_acc_type_code references public.boa_acc_type(code),
  day_validity public.boa_acc_day_validity,

  pass_ref   text unique,
  pass_token text unique,

  approved_at     timestamptz,
  approved_by     uuid references auth.users(id),
  decision_reason text,

  in_bms         boolean not null default false,
  bms_entered_at timestamptz,
  bms_entered_by uuid references auth.users(id),

  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  -- The design's rule — "pass tokens generate on approval, nothing before" — as
  -- a CHECK rather than a convention, so it holds even when an RPC is wrong.
  constraint boa_acc_person_pass_only_when_approved check (
    (status = 'approved') = (pass_token   is not null) and
    (status = 'approved') = (pass_ref     is not null) and
    (status = 'approved') = (type_code    is not null) and
    (status = 'approved') = (day_validity is not null)
  ),
  constraint boa_acc_person_rejection_needs_reason check (
    status <> 'rejected' or length(btrim(coalesce(decision_reason, ''))) > 0
  ),
  constraint boa_acc_person_bms_flag_consistent check (
    in_bms = (bms_entered_at is not null)
  ),
  constraint boa_acc_person_approved_has_actor check (
    (status <> 'approved') or (approved_at is not null)
  )
);
comment on column public.boa_acc_person.pass_ref is
  'Human-readable, printed on the pass: BOA26-0412. NOT the credential.';
comment on column public.boa_acc_person.pass_token is
  'The credential the QR encodes. Never granted to anon or authenticated at column level; reachable only via SECURITY DEFINER. See ADR-002.';
comment on column public.boa_acc_person.vehicle_reg is
  'Normalised, no spaces: KA05MJ8871. A plate identifies a vehicle, not a person.';

-- One person, one live row per org. Voided rows are excluded so a rejected
-- entry never blocks a genuine re-submission of the same human.
create unique index boa_acc_person_org_phone_idx
  on public.boa_acc_person (org_id, phone)
  where status <> 'voided';

create index boa_acc_person_org_status_idx on public.boa_acc_person (org_id, status);

-- The roster delta cursor. The gate pulls `where updated_at > $1`, so this
-- index is what keeps a refresh cheap on a phone with one bar of signal.
create index boa_acc_person_updated_idx on public.boa_acc_person (updated_at);

-- Backs the master list's search across name, phone, company and plate.
create index boa_acc_person_search_idx on public.boa_acc_person
  using gin (to_tsvector('simple',
    full_name || ' ' || phone || ' ' || coalesce(vehicle_reg, '')));

-- Partial index for the BMS worklist: /desk/master?in_bms=false. Partial
-- because the set shrinks to zero as Bhoopesh works through it, and an index
-- over the whole table would be mostly dead weight by show day.
create index boa_acc_person_bms_todo_idx on public.boa_acc_person (org_id)
  where status = 'approved' and in_bms = false;

create trigger boa_acc_person_touch before update on public.boa_acc_person
  for each row execute function private.boa_acc_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. boa_acc_device — gate devices. No accounts.
-- ---------------------------------------------------------------------------

create table public.boa_acc_device (
  id             uuid primary key default gen_random_uuid(),
  token_hash     bytea not null unique,
  token_hint     text  not null check (length(token_hint) = 6),
  gate_label     text  not null check (length(btrim(gate_label)) between 1 and 40),
  volunteer_name text  not null check (length(btrim(volunteer_name)) between 1 and 60),
  scope          text  not null default 'crew' check (scope in ('crew', 'vehicle', 'both')),
  created_at     timestamptz not null default now(),
  created_by     uuid references auth.users(id),
  last_seen_at   timestamptz,
  revoked_at     timestamptz,
  expires_at     timestamptz not null default (timestamptz '2026-10-11 06:00+05:30')
);
comment on table public.boa_acc_device is
  'A pasted token is the whole credential. Gate volunteers never get accounts.';

-- ---------------------------------------------------------------------------
-- 6. boa_acc_checkin — the append-only ledger
-- ---------------------------------------------------------------------------
--
-- Wristbands AND vehicle stickers live here. Same actor, same physical tap,
-- same once-per-person cardinality, so one outbox entry and one drain order on
-- the device that has to work with the radio off. The vehicle GATE is a
-- separate table because a truck crosses the barrier a dozen times over five
-- build days. ADR-003: same cardinality and same actor -> same ledger.

create table public.boa_acc_checkin (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null references public.boa_acc_person(id) on delete restrict,
  kind            public.boa_acc_checkin_kind not null,
  idempotency_key uuid not null unique,

  band_serial text,
  sticker_no  text,
  vehicle_reg text,

  device_id      uuid not null references public.boa_acc_device(id),
  gate_label     text not null,
  volunteer_name text not null,

  -- The device clock, which may be wrong. Clamped server-side by the issuing
  -- RPC; posted_at is the server's own record and is never client-supplied.
  occurred_at timestamptz not null,
  posted_at   timestamptz not null default now(),

  is_reissue       boolean not null default false,
  supervisor_note  text,
  voids_checkin_id uuid references public.boa_acc_checkin(id),

  constraint boa_acc_checkin_reissue_needs_note check (
    not is_reissue or length(btrim(coalesce(supervisor_note, ''))) > 0
  ),
  constraint boa_acc_checkin_void_targets_a_row check (
    (kind = 'void') = (voids_checkin_id is not null)
  ),
  constraint boa_acc_checkin_sticker_needs_plate check (
    kind <> 'vehicle_sticker' or vehicle_reg is not null
  )
);
comment on table public.boa_acc_checkin is
  'Append-only. A reissue appends, a void appends. Enforced by an ENABLE ALWAYS trigger, not by convention.';
comment on column public.boa_acc_checkin.band_serial is
  'Typed at the gate as the band is handed over, or left blank. DELIBERATELY NOT UNIQUE: a unique index would reject an offline write at drain time, days after the band was physically fastened to a wrist, and an append-only ledger must never refuse a drain for a data-quality reason. Typos surface as a desk report.';

create index boa_acc_checkin_person_kind_idx on public.boa_acc_checkin (person_id, kind);
create index boa_acc_checkin_occurred_idx on public.boa_acc_checkin (occurred_at desc);

-- A sticker number identifies one physical sticker, so it may be live once.
-- Scoped to non-voided sticker rows only.
create unique index boa_acc_checkin_sticker_no_idx
  on public.boa_acc_checkin (sticker_no)
  where kind = 'vehicle_sticker' and sticker_no is not null;

create trigger boa_acc_checkin_immutable
  before update or delete on public.boa_acc_checkin
  for each row execute function private.boa_acc_reject_mutation();

-- ENABLE ALWAYS: a plain trigger does not fire for the table owner, and the
-- owner is exactly who a migration or a console session runs as. Without this,
-- "append-only" holds for clients and not for the people most able to break it.
alter table public.boa_acc_checkin enable always trigger boa_acc_checkin_immutable;

-- ---------------------------------------------------------------------------
-- 7. boa_acc_vehicle_event — the barrier log
-- ---------------------------------------------------------------------------

create table public.boa_acc_vehicle_event (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  plate           text not null check (plate ~ '^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{1,4}$'),
  person_id       uuid references public.boa_acc_person(id),
  sticker_checkin_id uuid references public.boa_acc_checkin(id),
  outcome         public.boa_acc_vehicle_outcome not null,
  reason          text,
  checks          jsonb not null default '{}'::jsonb,
  device_id       uuid not null references public.boa_acc_device(id),
  gate_label      text not null,
  officer_name    text not null,
  occurred_at     timestamptz not null,
  posted_at       timestamptz not null default now(),

  constraint boa_acc_vehicle_turn_away_needs_reason check (
    outcome <> 'turned_away' or length(btrim(coalesce(reason, ''))) > 0
  )
);
comment on column public.boa_acc_vehicle_event.checks is
  '{sticker, wristband, plate_visual} booleans. The officer''s visual plate check is the real control — a match on the plate is not a match on the vehicle.';

create index boa_acc_vehicle_event_plate_idx
  on public.boa_acc_vehicle_event (plate, occurred_at desc);

create trigger boa_acc_vehicle_event_immutable
  before update or delete on public.boa_acc_vehicle_event
  for each row execute function private.boa_acc_reject_mutation();
alter table public.boa_acc_vehicle_event enable always trigger boa_acc_vehicle_event_immutable;

-- ---------------------------------------------------------------------------
-- 8. boa_acc_aaa_nomination — Salman's named list
-- ---------------------------------------------------------------------------
--
-- Exists because the nomination predates any person row, and because it is the
-- CONTROL that stops the desk stamping all-areas access on anyone. Salman holds
-- his own account so the ledger can distinguish "Salman approved this" from
-- "Bhoopesh says Salman approved this". For an 18-name all-areas list, that
-- distinction is the entire point.

create table public.boa_acc_aaa_nomination (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(btrim(full_name)) between 2 and 80),
  phone        text not null unique check (phone ~ '^\+91[6-9][0-9]{9}$'),
  org_hint     text,
  nominated_by uuid references auth.users(id),
  nominated_at timestamptz not null default now(),
  approved     boolean not null default false,
  approved_at  timestamptz,
  approved_by  uuid references auth.users(id),
  person_id    uuid unique references public.boa_acc_person(id),

  constraint boa_acc_aaa_approved_consistent check (approved = (approved_at is not null))
);
comment on table public.boa_acc_aaa_nomination is
  'Design conflict C9 resolved here: aaa_nominated_approved (18) counts approved rows; aaa_stamped (14) counts rows with a person_id. Both figures on the design are true at once.';

-- ---------------------------------------------------------------------------
-- 9. boa_acc_submit_throttle — the rate limiter that actually holds
-- ---------------------------------------------------------------------------
--
-- The in-memory per-IP limiter in lib/rate-limit.ts is a Map on one warm
-- serverless instance and cannot see a second one. This is the layer that works.

create table public.boa_acc_submit_throttle (
  token_hash   bytea not null,
  window_start timestamptz not null,
  hits         integer not null default 0 check (hits >= 0),
  primary key (token_hash, window_start)
);

-- ---------------------------------------------------------------------------
-- 10. boa_acc_operator — the desk roster (auth plumbing, not domain)
-- ---------------------------------------------------------------------------

create table public.boa_acc_operator (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         public.boa_acc_operator_role not null,
  display_name text not null check (length(btrim(display_name)) between 2 and 80),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
comment on table public.boa_acc_operator is
  'A Supabase session alone is not authorisation. Every desk RPC additionally requires an active row here.';


-- ---------------------------------------------------------------------------
-- Seed: the three pass types
-- ---------------------------------------------------------------------------
--
-- Seeded in the same migration as the table because these are not variable
-- data — they are the design contract. The three rows, their colours, their
-- band names and their zones are transcribed from the design's TYPES const
-- (design/source/boa_design_body.html:564-568), and lib/design.ts carries the
-- same values with tests/unit/design-contract.test.ts proving they match.
-- A fourth type is a design change, not a data entry.
--
-- `count` from the design (520/78/14) is deliberately NOT stored: those are
-- mock figures. Real counts come from boa_acc_desk_dashboard().

insert into public.boa_acc_type
  (code, label, num_label, band_name, colour_dark, colour_light, note, zones, requestable, sort_order)
values
  ('crew', 'Working Crew', 'The standard', 'Poison green', '#00F5A5', '#05603F',
   'The standard band. Most people working the festival.',
   array['site','backstage','prod_office','bar']::public.boa_acc_zone[], true, 1),

  ('stage', 'Stage', 'The limited', 'Ritual gold', '#E3BB72', '#5E4610',
   'Limited. Only people who work on or directly around the stages.',
   array['site','backstage','stage','prod_office']::public.boa_acc_zone[], true, 2),

  -- requestable = false. AAA is never offered on the vendor form; it is
  -- stamped onto an already-approved pass from Salman's named list, and
  -- boa_acc_decide refuses it without a matching approved nomination.
  ('aaa', 'AAA', 'The restricted', 'Bone white', '#F2EFE2', '#2A2A33',
   'Highly restricted. Named list only, approved directly by Salman.',
   array['site','backstage','stage','prod_office','bar','lounges','artist_area']::public.boa_acc_zone[],
   false, 3);

-- ---------------------------------------------------------------------------
-- RLS on, no policies yet
-- ---------------------------------------------------------------------------
--
-- With RLS enabled and no policy, anon and authenticated can do nothing at all.
-- That is the safe intermediate state between this migration and the lockdown
-- in 202609110002. FORCE additionally applies RLS to the table owner, so a
-- future SECURITY DEFINER function cannot accidentally read past it.

alter table public.boa_acc_type            enable row level security;
alter table public.boa_acc_org             enable row level security;
alter table public.boa_acc_org_invite      enable row level security;
alter table public.boa_acc_person          enable row level security;
alter table public.boa_acc_device          enable row level security;
alter table public.boa_acc_checkin         enable row level security;
alter table public.boa_acc_vehicle_event   enable row level security;
alter table public.boa_acc_aaa_nomination  enable row level security;
alter table public.boa_acc_submit_throttle enable row level security;
alter table public.boa_acc_operator        enable row level security;

alter table public.boa_acc_org_invite      force row level security;
alter table public.boa_acc_person          force row level security;
alter table public.boa_acc_device          force row level security;
alter table public.boa_acc_checkin         force row level security;
alter table public.boa_acc_vehicle_event   force row level security;
alter table public.boa_acc_aaa_nomination  force row level security;
alter table public.boa_acc_submit_throttle force row level security;

commit;
