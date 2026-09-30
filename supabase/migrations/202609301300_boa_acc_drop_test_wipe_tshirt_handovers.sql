-- ACC-197b · Withdraws 202609301200's test helper.
--
-- private.boa_acc_test_wipe_tshirt_handovers switched the append-only trigger
-- off to delete rows. It could not even run (ALTER TABLE is refused while the
-- test statement is using the table), and a function that can disable an
-- immutability trigger should not exist. The hand-over tests use the rollback
-- pattern of double-issue.test.sql instead: nothing they write is committed.
-- Dropping it here rather than editing 202609301200 keeps the history honest.

begin;
drop function if exists private.boa_acc_test_wipe_tshirt_handovers(text);
commit;
