-- ACC-022 · Install pgTAP for the privilege test suite.
--
-- There is no shadow/local Postgres in this workflow (no Docker — see
-- scripts/db-test.mjs) so tests run against the real project inside a
-- transaction that is always rolled back. pgTAP has to be installed on that
-- project for `select plan(...)`, `ok(...)`, `table_privs_are(...)` etc. to
-- exist at all.
--
-- Installed into `extensions`, never `public` — same reasoning as pgcrypto:
-- keeps public's namespace free of extension-owned objects. anon and
-- authenticated get nothing here; they never call these functions, only
-- scripts/db-test.mjs does, authenticated as `postgres` or via the
-- Management API.

begin;

create extension if not exists pgtap with schema extensions;

commit;
