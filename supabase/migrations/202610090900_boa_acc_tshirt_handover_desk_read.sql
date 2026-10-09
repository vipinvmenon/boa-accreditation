-- ACC-199 · The desk sees which T-shirts have been handed over.
--
-- boa_acc_tshirt_handover was RPC-only (ACC-197b): no operator could read it,
-- so the Master list could show the size but not whether the shirt was given.
-- This grants operators SELECT on two columns only, behind the same operator
-- check as boa_acc_checkin. No write path changes: the table stays
-- append-only (trigger) and RLS stays forced, and `anon` still has nothing.
-- The columns that stay unreadable: idempotency_key, operator_id, volunteer_name.

begin;

create policy boa_acc_tshirt_handover_read on public.boa_acc_tshirt_handover
  for select to authenticated using (private.boa_acc_is_operator());

grant select (person_id, occurred_at) on public.boa_acc_tshirt_handover to authenticated;

commit;
