# Security

> **Status: specification plus shipped CSP.** The database controls below are
> ACC-021/022. The nonce CSP in the "CSP" section shipped 14 Sep 2026; the
> real-iPhone verification remains open as ACC-053b. See CURRENT-STATE.md.

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
| ~~`device_token`~~ | 22 chars base64url | sha256 + hint | **RETIRED by ACC-150 (ADR-020).** Issuers log in as people. `boa_acc_device` and its rows are kept for history; `boa_acc_mint_device`, `boa_acc_revoke_device` and every device-token gate RPC hold EXECUTE for no client role — proven in `privileges.test.sql` |
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

## Who may use the gate (ACC-150, ADR-020)

Wristbands are handed out by up to ten people, and every ledger row has to say
which one. There is no shared phone secret any more: an issuer is invited from
`/desk/users`, sets a password, and logs in exactly as the desk does.

| Operator role | Desk (queue, master, passes, import, invites, users) | Gate (`/api/gate/*`) |
|---|---|---|
| `lead`, `admin` | yes | yes |
| `approver` | yes | **no** |
| `issuer` | **no** | yes |

- **Roles are enforced in the database**, not in a route (non-negotiable #3).
  `private.boa_acc_gate_operator()` resolves `auth.uid()` to an *active*
  operator whose role is issuer, lead or admin, and raises `42501` otherwise;
  every gate RPC calls it first.
- **`private.boa_acc_is_operator()` with no argument now means "an active DESK
  operator" — lead, approver or admin, as an allowlist.** It is the predicate
  behind every desk read policy and every desk RPC, so an issuer reads nothing
  from `boa_acc_person`, `boa_acc_org`, `boa_acc_checkin` or any other desk
  table, and cannot approve, import, invite or manage users. A role added
  later is refused by default rather than admitted by default.
- **`/api/gate/*` hold no service-role key.** They call the RPCs with the
  operator's own cookie session (`lib/gate-auth.ts` → `lib/supabase-server.ts`),
  so the database sees a real `auth.uid()`. The session gate RPCs grant EXECUTE
  to `authenticated` only; `anon` and `service_role` hold nothing.
- **Every new ledger and vehicle row records `operator_id`** (plus the
  display name at the moment the band was handed over). `*_actor_required`
  refuses a row that names neither an operator nor a device, and the session
  RPCs are the only write path any role can reach.
- `GET /api/gate/session` and the `/gate` screen's redirect to
  `/desk/login?next=/gate` are **usability affordances**. A person who blocks
  them reaches nothing: the RPCs refuse them.
- `?next=` is an allowlist of in-app paths (`lib/safe-next.ts`), never "starts
  with `/`" — `//host`, `/\host` and absolute URLs all leave the origin.

Proof: `supabase/tests/issuer.test.sql` (37 assertions: issuer allowed on each
gate RPC and attributed; refused by decide, approve/reject org, import, invite,
create org, user admin, AAA, dashboard, queue, passes; approver, deactivated
issuer and no session refused at the gate; lead and admin allowed) and
`privileges.test.sql` (anon still holds nothing anywhere; no role may execute a
device-token RPC).

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

**Status shipped 14 Sep 2026.** `middleware.ts` generates a fresh per-request
nonce, places it on the request for Next's App Router script nonce propagation,
and sets:

- `script-src 'self' 'nonce-…' 'strict-dynamic' 'wasm-unsafe-eval'`
- **`'wasm-unsafe-eval'` is required** or zxing-wasm will not instantiate. iOS
  Safari has no `BarcodeDetector`, so without it every iPhone at the gate
  silently loses the camera.
- Development additionally permits `'unsafe-eval'` because React's
  development runtime uses `eval()` for debugging callstacks. It is absent
  from the production policy.
- `style-src 'self' 'unsafe-inline'` — unavoidable and accepted (ADR-006). The
  design *is* inline styles.
- `font-src 'self'` — no Google origin, because `@fontsource` self-hosts.

The aeroplane-mode E2E suite now asserts fresh per-response nonces and performs
a QR decode through the local zxing-wasm fallback while this policy is active.
The real-iPhone verification (ACC-053b) is still required; this headless
assertion is necessary but not sufficient for iOS Safari acceptance.

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
- **A phone that changes hands mid-shift attributes the queue to whoever is
  signed in when it syncs.** Work queued offline by issuer A and drained after
  issuer B has logged in on the same phone is recorded against B: the server
  can only see the session that posted it. Mitigation is procedural — an
  issuer signs in on their own phone and stays signed in (ADR-020). Nothing
  is lost either way; the ledger is still append-only and still names a real
  person.
- **A cached roster stays on the phone after sign-out.** It holds name, phone,
  role, org, tier and plate for approved people (non-negotiable #9 — nothing
  further), which is the same list that must survive with the radio off. A
  lost phone is handled by deactivating the operator (their session can no
  longer sync or pull), not by trusting the cache to disappear.
