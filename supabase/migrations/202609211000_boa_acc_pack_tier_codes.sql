-- ACC-113 (1 of 2) · The accreditation pack's eight tiers — the enum values.
--
-- ADR-018: the printed pack replaces the design's three pass types with eight
-- woven wristband tiers. Three of the eight keep their codes (crew, stage,
-- aaa), so boa_acc_type_code is EXTENDED, not rebuilt.
--
-- WHY NOT REBUILD IT. Five functions take this enum as a parameter
-- (boa_acc_decide, private.boa_acc_decide_one, boa_acc_approve_org,
-- boa_acc_create_org, private.boa_acc_test_approve_person). Rebuilding the
-- type means dropping and recreating every one of them with its grants —
-- a large, risky diff for zero behavioural gain, since every existing value
-- survives. ADD VALUE leaves them, their grants and privileges.test.sql's
-- signatures exactly as they are.
--
-- WHY A SEPARATE FILE. A value added by ALTER TYPE ... ADD VALUE cannot be
-- USED until the transaction that added it commits. db:push runs each file
-- in its own transaction, so the seed that uses these values lives in the
-- next migration, 202609211010_boa_acc_accreditation_pack.sql.
--
-- Enum declaration order does not drive display order: boa_acc_type.sort_order
-- does. The values are still added in the master sheet's order after the
-- existing three, for readability.

begin;

alter type public.boa_acc_type_code add value if not exists 'artist';
alter type public.boa_acc_type_code add value if not exists 'promoters_lounge';
alter type public.boa_acc_type_code add value if not exists 'photo';
alter type public.boa_acc_type_code add value if not exists 'eddies_lounge';
alter type public.boa_acc_type_code add value if not exists 'general_admission';

commit;
