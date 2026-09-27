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

If the Meta business portfolio is not yours to administer, the access
handover comes first: **docs/WHATSAPP-ACCESS.md** is the short guide to
hand to whoever owns it.

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
- ~~**`/p/<token>` does not exist yet.**~~ **Stale — corrected 27 Sep 2026.**
  `app/p/[passToken]/` (page, screen, not-found) is built and committed; the
  template's button target resolves. The route has still not been opened with a
  real token end-to-end from a delivered message.
- The `/desk/passes` send controls have not been checked with `test:visual` or
  in a browser session. The visual harness (`scripts/visual-check.mjs`) stubs
  `/api/desk/passes` but not `/api/desk/passes/send`, so under it the page
  renders with no send state; the header button's label also changed from the
  design's "Send on WhatsApp" to "Send all unsent". Both are additions to the
  design contract (DESIGN-SYSTEM.md) that Vipin asked for in ACC-144.

## What the Meta side actually looks like (27 Sep 2026, verified in the console)

Observed directly in Meta Business Suite and the app dashboard by a browser
session driven by an agent, with Vipin present. **No IDs, tokens or secrets are
recorded here** — ACC-151 stands: they are read from the API Setup page and
typed into Vercel by Vipin, never pasted into chat or committed.

Done in this session:

- The Meta app **"BOA Accreditation"** was created (type **Business**, contact
  `vipinmenon006@gmail.com`) and attached to the **Bangalore Open Air** business
  portfolio. The **WhatsApp** and **Webhooks** products are added; the WhatsApp
  *Quickstart / API Setup / Configuration* pages are live. Before this, the
  portfolio had **no apps at all** — which is why `WHATSAPP_APP_SECRET` and the
  webhook had no possible value.
- Vipin has **Full access / Everything** on the portfolio, and two-factor
  authentication is now on (Meta blocks business access without it, per browser).

Facts that change the plan:

- **Two senders exist, on two different WhatsApp Business Accounts:**
  `+1 555 489 9720` and `+91 99727 69682`.
  **Corrected 27 Sep 2026:** an earlier version of this section called the `+1`
  number one of Meta's *test* numbers and said it could only reach a handful of
  allow-listed recipients. **That was wrong.** WhatsApp Manager's Activity log
  shows **Salman Syed added it on 25 Aug 2026**, requested name verification and
  installed an app, and **Haptik registered it on Cloud API** the same minute.
  It carries an approved display name, a full BOA business profile, and live
  templates created by Haptik (`update_regarding_case`,
  `informative_artist_features`, `boa_buy_tickets_`). It is BOA's real sender.
  The two numbers' WABA IDs differ, so `WHATSAPP_PHONE_NUMBER_ID` and
  `WHATSAPP_WABA_ID` must be copied as a **matched pair** from API Setup for
  whichever number is used — one from each fails every send.
- **That account is in active use.** Insights → Message pricing, last 7 days
  (read 27 Sep 2026): 16 sent, 23 delivered, 19 received; **7 paid
  "marketing-lite" messages delivered**, 16 free service messages; approximate
  total charges **₹0.00**. The crew-pass send will share this number with BOA's
  ticket marketing.
- **Decided by Vipin, 27 Sep 2026: the sender is `+1 555 489 9720`.** The agent
  twice argued against it on the mistaken test-number belief; the Activity log
  disproved that and the decision stands. The template, the env-var pair and the
  webhook all belong to that number's WABA.
  **Still open:** whether the new `BOA Accreditation` app can send from a number
  Haptik registered under its own app. A test send on 27 Sep **could not run** —
  Meta disables **Send message** before it gets that far (see the payment note
  below), so the question is untouched, not answered.
- **Vipin cannot open the other WABA.** WhatsApp Manager returns *"You do not
  have access to the WhatsApp Business Account …"* for the one holding the `+91`
  number, though that number does appear in API Setup's From picker.
- **Two BSPs hold partner access.** **Haptik** has *Full access* to **both**
  Bangalore Open Air WhatsApp accounts; **AiSensy** is also a partner with 2
  assets. BOA still **owns** the WABAs. A phone number can only be registered to
  one app at a time, so pointing this app's Cloud API at a number that is live on
  a BSP's app means taking it off theirs. **Resolved 27 Sep 2026 for Haptik:** BOA *is*
  sending through Haptik on the `+1` number (see the Activity log and Insights
  above). AiSensy's role is still unknown. No new number needs registering.
- **No payment method — and it blocks the send.** A test send was attempted on
  27 Sep 2026 with From set to `+1 555 489 9720` and a real `+91` recipient.
  **Send message is disabled**, with Meta's tooltip:
  > Missing payment method. Add a valid payment method to send business-initiated
  > messages using a **production phone number**. You can respond to the first
  > **1,000 user-initiated conversations each month for free**.

  Two things follow. First, Meta itself calls that number a *production* number,
  which is the last word on the test-number error corrected above. Second,
  **the free allowance is 1,000 user-initiated conversations a month** — more
  than the 612-person roster. That is only reachable if the crew member messages
  BOA **first** and the app replies inside the 24-hour window; the pass push
  ACC-144 built is business-initiated and therefore chargeable. Inverting the
  flow to reply-on-contact (the one-tap `wa.me` links already exist) would cost
  nothing per message but is an **ADR-level change, not a setting** — it has not
  been designed, costed or decided.

- **What Salman says (27 Sep 2026, reported by Vipin from WhatsApp — not
  verified by an agent):** BOA pays **₹4,000 per month**, and Salman knows the
  vendor as **Interakt**, which is Haptik's product; he did not recognise the
  name "Haptik". So the BSP subscription is live and billed monthly.
- **The credit lines differ per WABA.** The Summary tab of one Bangalore Open
  Air WhatsApp account shows a credit line from **Jio Haptik Technologies
  Limited**; a second, in a screenshot Salman sent, shows one from **AISENSY
  COMMUNICATIONS PRIVATE LIMITED**. Both BSPs are billing something. That is why
  Meta can say "missing payment method for 3 of your accounts" while credit
  lines exist: the line is attached per WABA, and the one our app targets does
  not appear to have a usable one.

  **Before anyone adds a card**, the question for Interakt/AiSensy support is
  narrow: *can the existing credit line on the WABA holding `+1 555 489 9720`
  cover Cloud API messages sent from BOA's own Meta app, or does that WABA need
  its own payment method?* The ₹4,000/month is a platform subscription, not
  Meta's per-message charge — the two are separate. Vipin's to resolve; an agent
  does not enter payment details.
- **The app is in Development mode.** It must be switched to **Live** before any
  real send to the roster.
- The WABA's **time zone is Europe/Vienna** and its currency INR. Cosmetic for
  sending, wrong for reporting — worth correcting.
- The API Setup page reports *"You have alerts that need review"* in WhatsApp
  Manager. **Not opened; contents unknown.**

Still outstanding, all Vipin's and none of them started: payment method, the
permanent **System User** token (no WhatsApp-capable system user exists — the
only one is a `Conversions API System User`, Employee role, no assets), the
**App secret**, the Vercel env vars, the `boa_crew_pass` template submission,
and the webhook registration.
