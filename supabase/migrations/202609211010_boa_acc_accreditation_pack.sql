-- ACC-113 (2 of 2) · The accreditation pack: six zones, eight tiers, the
-- 26-row access matrix, and an advisory requested tier on a person.
--
-- SOURCE. design/source/accreditation/access-matrix.json, itself a
-- transcription of the ten printed sheets beside it (ADR-018). This seed is a
-- MIRROR of that file; tests/unit/accreditation-contract.test.ts parses this
-- migration and fails if any row, flag or window drifts from the JSON.
--
-- WHAT CHANGES
--   * boa_acc_zone is rebuilt: the design's seven zones (site … artist_area)
--     share no value with the pack's six. The only thing that used the old
--     enum was boa_acc_type.zones, which is dropped — access now lives in
--     boa_acc_zone_access, one row per (zone, tier) the pack ALLOWS.
--   * boa_acc_type is reseeded to the eight tiers. Chip colours are Vipin's
--     call of 21 Sep: each tier's printed band colour, tuned for contrast on
--     both themes (ADR-018).
--   * boa_acc_person.requested_type_code: ADVISORY only. The roster importer
--     may fill it from a crew-type mapping. type_code is still set only by
--     boa_acc_decide, and nothing reads the hint as authority.
--
-- SAFE ON THE LIVE DATA. db:state on 21 Sep: boa_acc_person 0 rows,
-- boa_acc_checkin 0, boa_acc_aaa_nomination 0. boa_acc_org has 38 rows whose
-- default_type is 'crew', a code that survives.

begin;

-- ---------------------------------------------------------------------------
-- 1. Zones — rebuilt
-- ---------------------------------------------------------------------------

alter table public.boa_acc_type drop column zones;
drop type public.boa_acc_zone;

-- ORDER IS LOAD-BEARING. The sheets' own "ZONE n OF 6" numbering. Every zone
-- strip renders in this order; lib/design.ts ALL_ZONES carries the same order
-- and tests/unit/accreditation-contract.test.ts fails if they drift.
create type public.boa_acc_zone as enum
  ('festival_area', 'eddies_lounge', 'promoters_lounge', 'photo_pit', 'backstage', 'main_stage');

-- ---------------------------------------------------------------------------
-- 2. The eight tiers
-- ---------------------------------------------------------------------------

comment on table public.boa_acc_type is
  'The eight woven wristband tiers of the printed accreditation pack (ADR-018, supersedes ADR-001 on vocabulary). Mirrors design/source/accreditation/access-matrix.json.';
comment on column public.boa_acc_type.requestable is
  'false for aaa and artist (named lists) and general_admission (ticketing, never accredited here). The real control for aaa is the nomination check in boa_acc_decide.';

alter table public.boa_acc_type
  add column print_qty integer check (print_qty is null or print_qty > 0),
  add column artwork_no smallint check (artwork_no between 1 and 8);
comment on column public.boa_acc_type.print_qty is
  'Bands printed, from the artwork sheet. NULL for photo: the sheet says QTY TBC (discrepancy P3). Not zero, not guessed.';
comment on column public.boa_acc_type.artwork_no is
  'The artwork sheet''s 01–08 numbering: the printer''s order, NOT a display order. sort_order is the display order.';

-- The three surviving codes are updated in place (org.default_type and the
-- person FK reference them); sort_order is freed first because it is UNIQUE.
update public.boa_acc_type set sort_order = sort_order + 100;

update public.boa_acc_type set
  label = 'AAA', num_label = 'Every zone', band_name = 'Green',
  colour_dark = '#39E639', colour_light = '#1E7A1E',
  note = 'Every zone. Named list only, approved directly by Salman.',
  requestable = false, sort_order = 1, print_qty = 100, artwork_no = 4
where code = 'aaa';

update public.boa_acc_type set
  label = 'Stage', num_label = 'Festival · Photo pit · Backstage · Main stage', band_name = 'Orange',
  colour_dark = '#F07A2A', colour_light = '#9C4A10',
  note = 'People who work on or directly around the stage.',
  requestable = true, sort_order = 3, print_qty = 50, artwork_no = 7
where code = 'stage';

update public.boa_acc_type set
  label = 'Crew', num_label = 'Festival · Photo pit', band_name = 'Purple',
  colour_dark = '#A64DFF', colour_light = '#6A1FB8',
  note = 'The standard band. Most people working the festival.',
  requestable = true, sort_order = 5, print_qty = 500, artwork_no = 5
where code = 'crew';

insert into public.boa_acc_type
  (code, label, num_label, band_name, colour_dark, colour_light, note, requestable, sort_order, print_qty, artwork_no)
values
  ('artist', 'Artist', 'Every zone · + photo ID', 'Magenta', '#F0169A', '#A50E69',
   'Every zone. Photo ID required everywhere except the Festival Area.', false, 2, 100, 6),
  ('promoters_lounge', 'Promoters Lounge', 'Festival · Promoters · Backstage after 10 PM', 'Royal blue', '#4371FF', '#1F43C2',
   'Festival Area, Promoters Lounge with photo ID, Backstage from 22:00 with photo ID.', true, 4, 50, 3),
  ('photo', 'Photo', 'Festival · Photo pit', 'Yellow', '#F2D21C', '#6E5E00',
   'Photographers. Festival Area and Photo Pit.', true, 6, null, 8),
  ('eddies_lounge', 'Eddie''s Lounge', 'Festival · Eddie''s', 'Red', '#FF4A3D', '#A81E14',
   'Festival Area, and Eddie''s Lounge with photo ID.', true, 7, 50, 2),
  ('general_admission', 'General Admission', 'Festival area only', 'Black / grey / white', '#B8B8B8', '#55555C',
   'Ticket-holder band issued by ticketing. Never accredited here; present so the zone matrix is complete.', false, 8, 3000, 1);

alter table public.boa_acc_type alter column artwork_no set not null;

-- ---------------------------------------------------------------------------
-- 3. The access matrix
-- ---------------------------------------------------------------------------

create table public.boa_acc_zone_access (
  zone              public.boa_acc_zone      not null,
  type_code         public.boa_acc_type_code not null references public.boa_acc_type(code),
  requires_photo_id boolean                  not null,
  from_local_time   time,
  to_local_time     time,
  primary key (zone, type_code)
);
comment on table public.boa_acc_zone_access is
  'One row per (zone, tier) the printed pack ALLOWS. ABSENCE IS REFUSAL: there is no allowed flag to get backwards. Times are wall-clock Asia/Kolkata, a daily rule rather than an instant, hence time and not timestamptz.';
comment on column public.boa_acc_zone_access.from_local_time is
  'Asia/Kolkata wall-clock. Only promoters_lounge -> backstage has one: 22:00, "after 10 PM only".';

insert into public.boa_acc_zone_access (zone, type_code, requires_photo_id, from_local_time, to_local_time) values
  ('festival_area', 'general_admission', false, null, null),
  ('festival_area', 'eddies_lounge',     false, null, null),
  ('festival_area', 'promoters_lounge',  false, null, null),
  ('festival_area', 'aaa',               false, null, null),
  ('festival_area', 'crew',              false, null, null),
  ('festival_area', 'artist',            false, null, null),
  ('festival_area', 'stage',             false, null, null),
  ('festival_area', 'photo',             false, null, null),

  ('eddies_lounge', 'eddies_lounge',     true,  null, null),
  ('eddies_lounge', 'artist',            true,  null, null),
  ('eddies_lounge', 'aaa',               false, null, null),

  ('promoters_lounge', 'promoters_lounge', true,  null, null),
  ('promoters_lounge', 'artist',           true,  null, null),
  ('promoters_lounge', 'aaa',              false, null, null),

  ('photo_pit', 'photo',  false, null, null),
  ('photo_pit', 'crew',   false, null, null),
  ('photo_pit', 'stage',  false, null, null),
  ('photo_pit', 'aaa',    false, null, null),
  ('photo_pit', 'artist', true,  null, null),

  ('backstage', 'aaa',              false, null,    null),
  ('backstage', 'artist',           true,  null,    null),
  ('backstage', 'stage',            false, null,    null),
  ('backstage', 'promoters_lounge', true,  '22:00', null),

  ('main_stage', 'aaa',    false, null, null),
  ('main_stage', 'artist', true,  null, null),
  ('main_stage', 'stage',  false, null, null);

alter table public.boa_acc_zone_access enable row level security;

revoke all on public.boa_acc_zone_access from public, anon, authenticated;
grant select (zone, type_code, requires_photo_id, from_local_time, to_local_time)
  on public.boa_acc_zone_access to authenticated;

create policy boa_acc_zone_access_read on public.boa_acc_zone_access
  for select to authenticated using (private.boa_acc_is_operator());

-- The zones column is gone from boa_acc_type; re-state its column grant so
-- the new columns are readable and nothing else changes.
revoke all on public.boa_acc_type from anon, authenticated;
grant select (
  code, label, num_label, band_name, colour_dark, colour_light,
  note, requestable, sort_order, print_qty, artwork_no, created_at
) on public.boa_acc_type to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The advisory requested tier
-- ---------------------------------------------------------------------------

alter table public.boa_acc_person
  add column requested_type_code public.boa_acc_type_code references public.boa_acc_type(code);
comment on column public.boa_acc_person.requested_type_code is
  'ADVISORY. A hint from the roster importer''s crew-type mapping. Never authority: type_code is set only by boa_acc_decide (non-negotiable #3).';

grant select (requested_type_code) on public.boa_acc_person to authenticated;

commit;
