# BOA Accreditation

Crew accreditation, wristband check-in and vehicle access for
**Bangalore Open Air 2026** — BITS Club, show day 10 October 2026.

> If a person or vehicle is not registered, approved and verified through the
> accreditation system, they do not enter the operational areas of the venue.

**Start with [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md).** Then
[`CLAUDE.md`](CLAUDE.md) for the non-negotiables.

## Three surfaces

| Surface | Route | Credential |
|---|---|---|
| Vendor submission | `/s/<invite_token>` | a secret link. No account |
| Allocation desk | `/desk/*` | email + password, invitation only |
| Gate scanner | `/gate`, `/gate/vehicle` | a device token, pasted once |

## Running it

**`pnpm` is not on the PATH on this machine.** Use `corepack pnpm`.

```bash
corepack pnpm install
cp .env.example .env.local     # then fill it in — see docs/CURRENT-STATE.md
corepack pnpm dev
```

## Gates

```bash
corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test && corepack pnpm build
corepack pnpm check:sql     # migrations, no database needed
corepack pnpm test:db       # pgTAP against a real PostgreSQL
corepack pnpm test:e2e      # includes the aeroplane-mode suite
corepack pnpm test:visual   # design fidelity
corepack pnpm db:state      # what the database actually contains
```

## The design is the contract

`design/source/boa_design_body.html` is the approved design, committed verbatim.
Markup is lines 1–560; the data and state model is lines 563–864. It is the UI
contract and the domain contract, not inspiration. `corepack pnpm lint` proves
the colour tokens and font weights still match it.

## Dates that do not move

Links out **20 Sep** · gate live **4 Oct** · build **5–9 Oct** · show **10 Oct 2026**.
