-- ACC-023 · org_view / live_invite must be VOLATILE.
--
-- 202609110004 created them STABLE. STABLE functions share the calling
-- statement's snapshot, so they cannot see invite rows inserted in an earlier
-- CTE of the same statement — which is exactly how the pgTAP suites (and any
-- future "mint then view" transaction) call them. The lookup then raises the
-- same `not found` as a bad token. VOLATILE sees the current transaction state.
--
-- Already-applied 004 on this project still has STABLE; this ALTER is what
-- changes the live functions. New environments that run the updated 004 get
-- VOLATILE twice, which is a no-op.

begin;

alter function private.boa_acc_live_invite(text) volatile;
alter function public.boa_acc_org_view(text) volatile;

commit;
