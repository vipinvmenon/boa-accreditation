# Granting access to the WhatsApp Cloud API (for Salman)

Hand this to whoever owns BOA's Meta business portfolio. It unblocks **ACC-151**
— the Meta setup the pass-sending code (docs/WHATSAPP.md) is waiting for.

It is five minutes of clicking **if** the portfolio owner is an Admin and the
WhatsApp account is owned by BOA rather than by a third-party provider. If a
step is greyed out, jump to *When it will not let you*.

## What is actually needed

Vipin needs **three** things, all inside the same business portfolio:

| # | Asset | Level | Why |
| --- | --- | --- | --- |
| 1 | The **business portfolio** itself | Admin / *Full control* | to see anything below |
| 2 | The **WhatsApp Account** (WABA) + its phone number | *Full control* | phone-number ID, template submission, system-user token |
| 3 | The **Meta app** | *Full control* + app **Administrator** | App secret and webhook configuration |

Two of the five env vars (`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`) come
from the app, not the WhatsApp account — which is why #3 is not optional.

## Step 1 — Add Vipin to the business portfolio

1. Open **business.facebook.com/settings** (Meta Business Suite → *Settings* →
   *Business settings*). Check the portfolio picker at the top left is BOA's,
   not a personal one.
2. **Users → People → Add people** (older UI: *Invite*).
3. Enter Vipin's **work email address, the one on his Facebook login**. An
   invite to any other address cannot be accepted.
4. Choose **Full control** / **Admin access**, not *Employee*. Employees cannot
   create system users, which is the whole point.
5. Send. Vipin gets an email and must click through it; until he does, he shows
   as *Pending* and can do nothing.

## Step 2 — Give him the WhatsApp account

Still in Business settings:

1. **Accounts → WhatsApp accounts** → click BOA's WhatsApp Business Account.
2. **Add people** (right-hand panel) → pick Vipin → toggle **Full control** →
   **Assign**.
3. Confirm the sending number is listed under that account's **Phone numbers**
   tab. If no number is registered yet, that is Vipin's job once he has access —
   you do not need to do it.

## Step 3 — Give him the app

1. **Accounts → Apps** → click the Meta app used for WhatsApp → **Add people** →
   Vipin → **Full control** → *Assign*.
2. Then, separately, at **developers.facebook.com** → that app → **App roles →
   Roles → Add people → Administrator**. This is a different permission system
   from Business settings, and only an app Administrator can reveal the
   **App secret**. Skipping this is the single most common reason the handover
   "looks done" but the webhook still cannot be configured.

## Step 4 — Tell Vipin it is done

Reply with just: which portfolio name, which app name, and that all three are
granted. **Never send tokens, the app secret, or passwords over WhatsApp,
Telegram, email or chat.** Vipin generates the token himself in step 2 of
docs/WHATSAPP.md and puts it straight into Vercel; nobody needs to transmit a
secret anywhere.

## When it will not let you

| What you see | What it means |
| --- | --- |
| *Add people* is greyed out, or you cannot reach Business settings | You are an **Employee**, not an Admin, of the portfolio. Whoever created it must raise you first — or do steps 1–3 themselves. |
| Meta refuses the invite until you "secure your account" | Admins must have **two-factor authentication** on. Turn it on (Accounts Centre → Password and security), then retry. Vipin needs 2FA on his account too. |
| The WhatsApp account is missing from *Accounts → WhatsApp accounts* | The number is probably on a **personal** WhatsApp Business app, or owned by a reseller/BSP (Wati, Interakt, Twilio, Gupshup, 360dialog…). A WABA held by a BSP cannot be shared from here — access must come from that provider's console, or the number gets migrated to BOA's own portfolio. Tell Vipin which it is; it changes the plan. |
| You see the WhatsApp account but it says *Requested* / *Pending* | The portfolio has asked for access and the current owner has not approved. Chase the owner, not the settings page. |
| Vipin says he still sees nothing | He has not accepted the email invite, or he accepted it while logged into a different Facebook account. Have him check **business.facebook.com** with the right login. |
| *Business verification required* | Some WhatsApp actions are gated behind portfolio verification. Start **Security Centre → Start verification**; it can take a few days, so begin it now rather than on the day. |

## After access lands

Vipin continues at **docs/WHATSAPP.md → "Setup checklist"** — system user token,
the `boa_crew_pass` Utility template (which needs Meta's approval, so submit it
the same day), Vercel env vars, then the webhook. Template review is the slow
part and it is out of everyone's hands once submitted.
