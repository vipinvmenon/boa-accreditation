-- ACC-150 (1 of 2) · The `issuer` operator role (ADR-020).
--
-- WHY THIS IS ITS OWN MIGRATION
--
-- `ALTER TYPE ... ADD VALUE` may run inside a transaction block (PostgreSQL
-- 12+), but the new label cannot be USED until that transaction commits —
-- any cast of 'issuer' to public.boa_acc_operator_role in the same
-- transaction raises "unsafe use of new value". scripts/db-push.mjs wraps
-- each migration file in its own transaction and commits it before starting
-- the next, so this file adds the label and commits, and
-- 202609221201_boa_acc_gate_session.sql (which grants the label meaning) runs
-- in the next transaction.
--
-- Belt and braces: 202609221201 compares roles as TEXT
-- (`o.role::text in (...)`) and never casts the literal 'issuer' to the enum,
-- so it also applies cleanly in a single rolled-back verification
-- transaction together with this file (see its header).
--
-- WHAT `issuer` MAY DO (enforced in 202609221201, in the database —
-- non-negotiable #3): pull the gate roster, issue/reissue/void a band or
-- sticker, and record a vehicle barrier event, each attributed to the
-- issuer's own operator row. Nothing else: every desk RPC and every desk
-- read policy uses private.boa_acc_is_operator(), whose "any operator" form
-- is redefined in 202609221201 as "any DESK role" (lead, approver, admin).
--
-- `if not exists` so a hand-applied label (or a re-run after a partial
-- failure) does not abort the push.

begin;

alter type public.boa_acc_operator_role add value if not exists 'issuer';

commit;
