# WhatsApp pass delivery (ACC-144)

The app sends each approved person their pass on WhatsApp, to their own number,
through the **WhatsApp Business Cloud API** from BOA's Meta-verified business
account (ACC-140d, ACC-140f). The one-tap `wa.me` link on each pass stays as the
fallback when a template is rejected or the API is down.

## How it works

| Piece | Where |
| --- | --- |
| Cloud API client (template send, webhook signature, status parsing) | `lib/whatsapp.ts` — server only |
| Send route: one person, or "all approved and unsent" | `POST /api/desk/passes/send` |
| Send state for the pass sheet | `GET /api/desk/passes/send` |
| Meta's webhook: handshake + delivery statuses | `GET`/`POST /api/whatsapp/webhook` |
| The send record and its RPCs | `supabase/migrations/202609221100_boa_acc_pass_send.sql` |
| UI | `/desk/passes` — status per pass, **Send**/**Resend**, **Send all unsent (N)**, failures with Meta's reason, **One-tap** link |

- **Who may send:** an active **lead** or **admin**, checked inside
  `boa_acc_pass_send_begin` (non-negotiable #3). Approvers see the status and the
  one-tap links; per-person Send is hidden and "Send all unsent" is disabled
  for them, and the database refuses them if they try anyway.
- **Only approved people.** No `pass_token` means nothing to send; the database
  refuses (`not_approved`).
- **No accidental double send.** A second send while one is queued, sent,
  delivered or read is refused (`already_sent`). **Resend** asks for
  confirmation and sets an explicit `resend` flag. A queued send with no Meta
  message ID after 10 minutes (the request died mid-flight) stops blocking.
- **Nothing fires on zero people.** "Send all unsent" is disabled at 0, and the
  route returns immediately if the database lists nobody.
- **Every attempt is recorded:** who pressed Send, when, Meta's message ID, the
  status (`queued → sent → delivered → read`, or `failed` with Meta's reason).
  Statuses never move backwards when Meta's webhooks arrive out of order.
- **Batches.** "Send all" sends 4 at a time for up to 40 s per request; the page
  repeats the request until everyone is done.

## Environment variables (Vercel, server-only)

None of these may ever carry a `NEXT_PUBLIC_` prefix. Vipin sets them in
Vercel; an agent never sees the values.

| Name | What | Needed for |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Permanent **System User** token with `whatsapp_business_messaging` | sending |
| `WHATSAPP_PHONE_NUMBER_ID` | The sending number's **Phone number ID** (not the phone number) | sending |
| `WHATSAPP_WABA_ID` | WhatsApp Business Account ID | reference only today; kept for template management |
| `WHATSAPP_APP_SECRET` | Meta app → App settings → Basic → **App secret** | webhook signature check |
| `WHATSAPP_VERIFY_TOKEN` | Any long random string you choose (e.g. `openssl rand -hex 24`) | webhook handshake |
| `WHATSAPP_TEMPLATE_NAME` | Defaults to `boa_crew_pass` | sending |
| `WHATSAPP_TEMPLATE_LANG` | Defaults to `en` — must equal the template's language code | sending |

If the token or phone-number ID is unset, `POST /api/desk/passes/send` answers
`503 whatsapp_not_configured`, the Send buttons are disabled, and the page says
to use the one-tap links. Nothing crashes. If `WHATSAPP_APP_SECRET` is unset
the webhook answers 503 to every event; if `WHATSAPP_VERIFY_TOKEN` is unset the
handshake is refused.

## The template to submit to Meta

WhatsApp Manager → Message templates → Create template.

- **Category:** Utility
- **Name:** `boa_crew_pass`
- **Language:** English (`en`) — if you pick a different English variant (e.g.
  `en_US`), set `WHATSAPP_TEMPLATE_LANG` to that code.
- **Header:** none
- **Body** (`{{1}}` = the person's first name; sample value `Asha`):

  > Hi {{1}}, your Bangalore Open Air crew accreditation is approved. Tap the
  > button below to open your pass. Show its QR code with a photo ID at the
  > accreditation desk to collect your wristband. The pass is for you only;
  > please do not forward it.

- **Footer** (optional): `Bangalore Open Air · 10 Oct 2026`
- **Button:** *Visit website* → type **Dynamic**
  - Button text: `Open my pass`
  - URL: `https://accred.bangaloreopenair.com/p/{{1}}`
  - Sample: `https://accred.bangaloreopenair.com/p/AbCdEfGhIjKlMnOpQrStUv`

The app fills body `{{1}}` with the first word of the person's name and the
button's `{{1}}` with their 22-character pass token (URL-safe, no encoding
needed). If Meta asks for changes to the wording, keep exactly one body
variable and one dynamic URL button — the code sends exactly those two
parameters, and a mismatch fails every send with error 132000.

## Webhook to register

Meta app → WhatsApp → Configuration → Webhook:

- **Callback URL:** `https://accred.bangaloreopenair.com/api/whatsapp/webhook`
- **Verify token:** the value of `WHATSAPP_VERIFY_TOKEN`
- **Subscribe to field:** `messages`

Meta signs every event with `X-Hub-Signature-256` (HMAC-SHA256 of the raw body
keyed with the app secret). The route rejects a missing or wrong signature with
401 before anything touches the database, then updates statuses through
`boa_acc_pass_send_status`, which only `service_role` may execute.

## Setup checklist for Vipin (ACC-151)

1. Register the sending phone number on BOA's WhatsApp Business Account
   (Meta Business Manager → WhatsApp Accounts). Note its **Phone number ID**
   and the **WABA ID**.
2. Create a **System User** (Business settings → Users → System users) with
   admin access to the WhatsApp account and the Meta app; generate a
   **permanent** token with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
3. Submit the `boa_crew_pass` template above and wait for **Approved**.
4. In Vercel (production), set `WHATSAPP_ACCESS_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_APP_SECRET`,
   `WHATSAPP_VERIFY_TOKEN` (and the template name/lang only if they differ
   from the defaults). Redeploy.
5. Register the webhook (above). Meta's "Verify and save" must succeed.
6. Apply the migration (`corepack pnpm db:push`, by a human) and run
   `corepack pnpm test:db`.
7. Acceptance (ACC-144): approve yourself, press **Send** on your own pass,
   see it arrive and the status move to Delivered/Read; then send to a number
   that is not on WhatsApp (or temporarily set a wrong template name) and see
   the failure listed with Meta's reason.

Meta bills per template message sent. Each Send / Send all is one message per
person.

## What was and was not verified (22 Sep 2026, by the ACC-144 agent)

Verified:

- `tests/unit/whatsapp.test.ts` (vitest, mocked `fetch`): the request URL,
  bearer header and template body; Meta's success and error shapes; network
  failure; webhook HMAC accept/reject (wrong secret, altered body, malformed or
  sha1 header, no secret); handshake; status extraction including failed with
  reason.
- The migration and `supabase/tests/pass-send.test.sql` (21 assertions) and
  `supabase/tests/privileges.test.sql` (107 assertions) against the production
  database **inside one transaction that was deliberately aborted** — all
  passed, and a read-only query afterwards confirmed nothing persisted. The
  migration is **not applied** to production.
- The Graph API version and request/response shapes were read from Meta's
  developer docs on 22 Sep 2026 (cited in `lib/whatsapp.ts`). The version is
  pinned to **v25.0**.

Not verified:

- **No real WhatsApp message has been sent.** The Cloud API has not been
  called with real credentials; that is ACC-144's acceptance and needs ACC-151.
- The webhook has not received a real Meta event; the handshake and signature
  code is proven only by unit tests.
- The Graph API error object's shape was not re-read from a Meta page (the
  reference page shows no error example); it is parsed leniently.
- The template wording has not been submitted to or approved by Meta.
- **`/p/<token>` does not exist yet** (docs/ARCHITECTURE.md lists it, no route
  is built). Until it ships, the template's button and the one-tap link open a
  404. Build it before the first real send.
- The `/desk/passes` send controls have not been checked with `test:visual` or
  in a browser session. The visual harness (`scripts/visual-check.mjs`) stubs
  `/api/desk/passes` but not `/api/desk/passes/send`, so under it the page
  renders with no send state; the header button's label also changed from the
  design's "Send on WhatsApp" to "Send all unsent". Both are additions to the
  design contract (DESIGN-SYSTEM.md) that Vipin asked for in ACC-144.
