# Consolidated plan — 14 Sep 2026

Vipin asked to consolidate what's left and split it between Claude and
Cursor working in parallel. What actually happened: rather than force a
split across roadmap items that turned out to be genuinely human-only, this
session audited the parts of the repo that *looked* fine on paper but had
never been re-checked against reality — and found several real, previously
unnoticed production bugs. Most of what was "left" got fixed today, not
distributed. What's left after that is one substantial, well-specified,
security-sensitive build — a good fit for a focused Cursor session — plus
the items that were always going to need Bhoopesh or a physical human.

## Fixed today (Claude, already on `main`)

Found by actually checking `gh run list` / running things for real, not by
trusting what a doc claimed — the same method that had already caught one
bug earlier this session (a stale `verify-deploy.mjs` check after ADR-013).

1. **`dashboard.test.sql` asserted global counts as absolute values** —
   would have broken the required `database` CI job the moment any real
   person got submitted. Fixed to assert fixture deltas over a baseline.
2. **`verify-deploy.mjs` checked root's pre-ADR-013 contract** (expected a
   200 page; root has redirected to `/desk/login` since 13 Sep). Fixed.
3. **`deploy-verify.yml`'s primary trigger (`deployment_status`) had been
   failing on every single run since the workflow was created** — it
   verified Vercel's per-deployment alias URL, which sits behind Vercel's
   SSO wall, not the custom domain. Fixed to always verify
   `accred.bangaloreopenair.com` on automatic runs.
4. **The "served from bom1" check asserted a CDN-edge fact it could never
   reliably prove** — static/prerendered pages are served from whichever
   edge POP is nearest the *requester*, not from `vercel.json`'s
   `regions: ["bom1"]` (that pins serverless function execution only).
   Downgraded to informational.
5. **`backup.yml` had a 100% failure rate since inception — zero encrypted
   backups have ever actually existed.** Root cause: unversioned
   `postgresql-client` on the runner resolves to v16, which refuses to dump
   the real Postgres 17.6 server. Fixed via the PGDG apt repo, pinned to
   `postgresql-client-17`. **A real bug in this fix was itself caught by
   actually triggering the workflow** (`gh workflow run backup.yml`) rather
   than waiting for tonight's schedule: `gpg --dearmor` needed `--batch
   --yes` to run non-interactively in CI. Fixed and re-triggered — see
   `docs/CURRENT-STATE.md` for the final confirmed result.
6. **`docs/SECURITY.md` and ADR-006 (`docs/DECISIONS.md`) described a
   nonce-based CSP in `middleware.ts` as already shipped. It was never
   built** — `middleware.ts` has never existed in this repo's git history,
   and the aeroplane-mode e2e test has no CSP assertion despite the doc's
   claim that it does. Corrected both docs to say plainly what's actually
   true. **The real CSP implementation is this session's one substantial
   piece of open work — see the Cursor section below.**
7. **`app/api/desk/export/` was an empty stub** — ACC-072 (post-show ledger
   reconciliation) had no real export; the only existing one
   (`/desk/master?format=csv`) dedupes and drops voided rows, so it can't
   reconstruct what actually happened. Built `app/api/desk/export/route.ts`
   — every `boa_acc_checkin` row, unfiltered, chronological. No new
   migration needed; reuses the RLS pattern `/desk/master` already proves.
8. **`validate:paper` only ever checked CSV shape, never whether the rows
   were still true.** Built `scripts/reconcile-paper-fallback.mjs`
   (`corepack pnpm validate:paper:live`) — cross-checks a paper-fallback
   roster CSV against the live database and flags stale/missing/mismatched
   rows before a physical print run.
9. **ACC-030 placeholder org data + invites loaded** (38 `PLACEHOLDER —`
   orgs, persistent in the database) so desk-screen work and rehearsals
   don't have to wait for Bhoopesh's real list. Roadmap kept at `[~]` IN
   FLIGHT, not `[x]` done — the real acceptance criterion is the real list.

All of the above: `typecheck`/`lint`/`test` (49/49) green throughout,
`test:db` (10/10 pgTAP files) green with the placeholder orgs present,
`check:sql` green. Full detail and exact verification for each item is in
`docs/CURRENT-STATE.md`'s dated session-log entries — this file is the
plan, that file is the record.

## For Cursor — the one big remaining build

### Implement the CSP (`docs/SECURITY.md`, "CSP" section has the exact spec)

This is real, unstarted, security-relevant work — not busywork invented to
fill a split. Build:

1. **`middleware.ts`** — generate a per-request nonce, set:
   ```
   script-src 'self' 'nonce-<generated>' 'strict-dynamic' 'wasm-unsafe-eval'
   style-src 'self' 'unsafe-inline'
   font-src 'self'
   ```
   `'wasm-unsafe-eval'` is required or zxing-wasm (the gate's iOS QR-scan
   fallback — no `BarcodeDetector` on iOS Safari) will not instantiate, and
   every iPhone at the gate silently loses its camera. This is the single
   highest-risk part of this task — **do not ship it without verifying the
   gate scanner still works under the real policy**, not just that the
   header is present.
2. Thread the nonce into whatever inline bootstrap scripts Next 16 emits
   (check how Next surfaces this — `next.config.ts` / the App Router's own
   nonce support — before hand-rolling anything).
3. **Add a real CSP assertion to `tests/e2e/aeroplane-mode.spec.ts`** — it
   currently has none, despite `docs/SECURITY.md` previously (falsely)
   claiming it does. The test should assert a QR decode succeeds with the
   policy actually enforced, not disabled for the test.
4. Run the full local suite: `typecheck`, `lint`, `test`, `test:e2e`,
   `test:visual` (a new response header shouldn't move any pixel, but
   confirm), `check:sql` is irrelevant here (no schema change).
5. **Before calling this done**, per `docs/SECURITY.md`'s own corrected
   text: this still needs real-iPhone verification (ACC-053b, already an
   open roadmap item, owned by Vipin) — a passing headless e2e test is
   necessary but not sufficient. Flag that clearly in your own summary
   rather than claiming the roadmap item closed.
6. Update `docs/SECURITY.md` and ADR-006 in `docs/DECISIONS.md` to describe
   what's actually shipped once it's real — both already have a "corrected
   14 Sep 2026" note explaining the gap; replace that note with what you
   built, the same way this session did for every other fix today.

Nothing else in this repo should need touching for this — it's additive
(a new file, one test file, two doc corrections). Low collision risk with
anything Claude might do next.

## Still genuinely blocked or human-only (not assignable to either of us)

- **ACC-030a / ACC-026a** — Bhoopesh's real 38-org list, real operator
  emails. Nothing downstream of these can be *finished* (as opposed to
  rehearsed on placeholder data) until they land.
- **ACC-046, ACC-053b, ACC-058, ACC-059, ACC-061** — approvers rehearsing
  the queue, a real iPhone proving the scanner, a two-phone aeroplane-mode
  rehearsal, physically printing the paper fallback, physically minting and
  handing out 4 device tokens. All of these already have working,
  tested tooling behind them (confirmed today) — what's missing is a human
  in the room, not code.
- **ACC-070, ACC-072, ACC-080** — not due yet (post-4-Oct, 11 Oct, 9 Nov).
  ACC-072's export tooling now exists ahead of time (see above); ACC-080
  still has no retention-narrowing script — flagged as real, low-priority,
  future work, not built today.

## When the real org list lands

```bash
node scripts/wipe-orgs.mjs --prefix "PLACEHOLDER — "
corepack pnpm validate:org-import -- path/to/real-organisations.csv
# then create the 38 real orgs through /desk/orgs by hand, per docs/ORG-IMPORT.md
corepack pnpm task done ACC-030
```
