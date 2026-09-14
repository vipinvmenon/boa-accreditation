# Security

> **Status: specification.** Nothing below is built. This is ACC-021/022.
> See CURRENT-STATE.md.

## The one rule

**Authorisation is enforced in the database.** Client-side checks are a usability
affordance, never a control. Every claim in this document must be provable by
`supabase/tests/privileges.test.sql`, for every table and every function, for both
roles. Assertions check refusals for **side effects too**, not just for throwing.

## `anon` gets nothing

Zero table grants, zero sequence grants, zero function EXECUTE.

Supabase grants broad privileges on `public` to `anon` and `authenticated` by
default, and **the anon key ships in the browser bundle**. So: revoke everything
from both roles, then `alter default privileges` so the hole cannot reopen on the
next table anyone adds. Grant back only `select`, only to `authenticated`, and
only on an **explicit column list that omits `pass_token`**.

`create function` grants EXECUTE to PUBLIC by default. **Revoke in the same
`begin;`/`commit;` block that creates the function.** bar-control needed three
separate migrations to learn this; we start there.

The public surface therefore does **not** call RPCs with the anon key (ADR-004).
Next route handlers hold the service-role key and call token-first RPCs. The RPC
validates the token before touching a row, so the handler is a thin proxy and a
bug in one cannot exceed what the RPC allows.

## The token trilogy

| Token | Shape | At rest | Why |
|---|---|---|---|
| `invite_token` | 22 chars base64url | sha256 + 6-char hint | the org contact always has it; the server never needs to recover it |
| `device_token` | 22 chars base64url | sha256 + hint | pasted once into localStorage; re-minted, never recovered |
| `pass_token` | 22 chars base64url | **plaintext, zero column grants** | ADR-002 — the QR must resolve offline, and the desk must reprint on any day |

> ⚠ **`gen_random_bytes()` is pgcrypto and lives in the `extensions` schema on
> hosted Supabase.** Inside a `SECURITY DEFINER` function with
> `set search_path = public, private, pg_temp` it will **not** resolve. Call it as
> `extensions.gen_random_bytes(16)`. bar-control hit the same class of bug with
> `digest()` and documented it in `202608220002_live_access.sql`.

**Multiple live invite tokens per org, on purpose.** Bhoopesh will be asked to
resend a lost link. With one token per org, resending means rotating — which kills
the link already sitting in a WhatsApp group with four other people from that
company. Multiple concurrent hashed tokens make "resend to Ranjith" a *mint*, not
a *rotate*.

**QR payload:** `BOA26:<pass_token>`. The scheme prefix lets the scanner reject a
foreign QR in one `startsWith` before touching the roster index, and stops a stray
camera app opening anything.

## Policy authoring rules

Three Postgres/Supabase behaviours that fail *silently* and would each quietly
undo something above. All three are asserted in `privileges.test.sql`.

1. **Target the role with `TO`, never `auth.role()`.** `auth.role()` is
   deprecated, and `auth.role() = 'authenticated'` breaks outright if anonymous
   sign-ins are ever enabled, because an anonymous user carries the
   `authenticated` Postgres role and passes the check without being signed in.
   Write `... for select to authenticated using (...)`.

2. **Views bypass RLS by default.** Create every view
   `with (security_invoker = true)`. See DATA-MODEL.md — this is the easiest way
   to leak `pass_token` past the column grants, and it fails by *working*.

3. **An UPDATE needs a SELECT policy**, because Postgres must read the row
   first. Without one, updates return 0 rows with no error. We have no UPDATE
   policies by design — every write is a `SECURITY DEFINER` RPC — but if anyone
   ever adds one, this is why it appears to do nothing.

## Quota is enforced server-side

`select … for update` on the org row inside `boa_acc_submit`. The form's
"14 / 22 SEATS USED" bar is an affordance — two contacts pasting the same link on
two phones must not both get past 22. The acceptance test is a **`curl` past the
quota**, not a click.

## Rate limiting — three layers

1. **Per-IP, in memory** — `lib/rate-limit.ts`, ported from `boa-stok-form`
   *including* its honest header that it is a Map on one warm instance and not a
   distributed limiter.
2. **Per-token per-hour, in the database** — `boa_acc_submit_throttle`. The only
   layer that holds across instances. This is the spec's requirement.
3. **Vercel WAF** rule on `/api/s/*`.

No captcha. The form is already behind a secret link sent to 38 known companies;
stok-form refused one for design reasons and the exposure here is lower.

## 404, never 403

An unknown, revoked, expired, rejected or mistyped token gets the same 404 as a
typo. A 403 on a real token and a 404 on a fake one would let anyone probe which
22-character strings exist.

## CSP

**Status corrected 14 Sep 2026: NOT YET IMPLEMENTED.** This section
previously described the intended policy as already shipped ("nonce-based, in
`middleware.ts`"). It never was — `middleware.ts` has never existed in this
repo (confirmed via `git log --all -- middleware.ts`, no results), no CSP
header is set anywhere (`next.config.ts`, `vercel.json` set only the
non-CSP security headers), and `tests/e2e/aeroplane-mode.spec.ts` has no CSP,
nonce, or `strict-dynamic` reference at all — the claim that it asserts a
decode with CSP enforced was false. Found while auditing for exactly this
class of drift; see ADR-006's matching correction in `docs/DECISIONS.md`.

The app currently ships with no `script-src` restriction, which is *why*
zxing-wasm has been working — nothing is blocking it, not an enforced,
verified-compatible policy. The intended design, still to be built:

- `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'`
- **`'wasm-unsafe-eval'` is required** or zxing-wasm will not instantiate. iOS
  Safari has no `BarcodeDetector`, so without it every iPhone at the gate would
  silently lose the camera **once a real CSP is added** — this is the single
  most likely silent failure on show day *if this is built without also
  re-testing the gate scanner against it*, not before.
- `style-src 'self' 'unsafe-inline'` — unavoidable and accepted (ADR-006). The
  design *is* inline styles.
- `font-src 'self'` — no Google origin, because `@fontsource` self-hosts.

**Before this is shipped:** the aeroplane-mode e2e suite must actually gain a
CSP-enforced decode assertion (it currently has none), and it must be verified
on a real iPhone (ACC-053b, already an open roadmap item) with the policy
active, not just in a desktop headless browser.

## Data handling

Collected: full name, phone, role, and optionally a vehicle registration.

**Not collected, ever:** ID number, Aadhaar, photo, address, date of birth.
Anything more is a liability carried until deletion and slows the form down on a
phone. This is non-negotiable #9 and a `CHECK`-free rule enforced by the absence
of the columns.

The browser gets a **publishable** key, not the legacy `anon` key (which exists
only for backwards compatibility). Either way it holds nothing: zero grants.

The service-role key is server-only and must never carry a `NEXT_PUBLIC_` prefix.
`lib/supabase-admin.ts` is import-restricted by ESLint to `app/api/**`.

Retention is decided and dated — see OPERATIONS.md.

## Known residual risks

- A database backup leaks every live `pass_token` (ADR-002). Accepted; the ledger,
  not the token, is the control that makes a shared pass scan amber.
- Two offline gates can both issue to the same person. Structurally unpreventable;
  both rows land, the next scan anywhere shows amber, the desk gets a duplicate
  report. The ledger records the truth rather than pretending.
