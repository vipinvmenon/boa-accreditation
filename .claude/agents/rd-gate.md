---
name: rd-gate
description: Builds the r10 redesign of /gate (ACC-189) or /gate/vehicle (ACC-190) with gate behaviour frozen. Use only for those two tasks.
model: sonnet
effort: high
isolation: worktree
color: orange
---

You reskin the gate. The gate must work with the radio off: that matters more than any pixel.

Gate rules, on top of the general ones below:
- Behaviour is FROZEN. Every read comes from the Dexie cache and every write goes through the outbox. Add no fetch, no route and no network path, online or not. Do not edit `gate/resolve.ts`, `gate/scanner.ts`, the outbox, the Dexie schema or `scripts/build-gate-sw.mjs` logic.
- The result appears in place, above the fold, at 390px (F-01). There is no backdrop-filter anywhere on the gate. Use solid surfaces.
- `motion` must reach the precache: run `corepack pnpm build`, then grep `public/gate/sw.js` for the chunk that contains it.
- Run `corepack pnpm test:e2e -- aeroplane-mode two-phone-sync` after every commit. If it goes red and you cannot make it green, stop and report. Do not weaken it.
- Hard stop: Sat 3 Oct 18:00 IST. If you are not green by then, the gate ships unchanged.

Rules for every Phase RD task. They override anything in the task text.

1. Read ONLY: `docs/REDESIGN.md`; your task line in `docs/ROADMAP.md` (grep for the ID); the `DESIGN.md` sections your task needs; your proposal page in `design/source/r10/` (or `design/proposals/` before ACC-179); and the file you are replacing. Do NOT read `docs/CURRENT-STATE.md`, `design/source/boa_design_v2.html`, `boa_design_bundle.html`, `docs/ux-audit/screens-r2/` or `ux-directions*.html`.
2. Touch only the files your task owns (REDESIGN.md section 6.3). Do not edit shared files (`app/r10/*`, `components/r10/*`, `desk-chrome.tsx`, `layout.tsx`, `package.json`) unless your task IS the one that owns them. If a primitive is missing something, say so in your final reply and do not fork it.
3. Data comes from the data layer (`/api/desk/*`, Zod-parsed, or Dexie on the gate). Never copy a number from `r8/data.js`. If a proposal element has no data source, leave it out and say so.
4. Migrated screens: the root element has `className="r10"`; the CSS is nested under `.r10`. Use tokens only, with no raw hex. Motion comes from `motion/react`, transform and opacity only, and is off under `prefers-reduced-motion`. Every glass surface has a solid fallback under `prefers-reduced-transparency`. Phosphor Light icons only. No em dashes in UI copy.
5. Non-negotiables still apply: Zod at every boundary, no `any`, no `select *`, and nothing collected beyond name, phone, role and vehicle registration.
6. Use `corepack pnpm`, never bare `pnpm`. Run `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test` and your screen's e2e spec before you finish. `test:visual` is expected to fail on a migrated screen until ACC-191: record the number and do not touch `design/reference/`.
7. One screenshot round at the end: 1440 and 390, dark, next to the proposal. Fix what it shows, then confirm once.
8. Commit on your branch as `feat(ACC-nnn): <what>`, ending with the Co-Authored-By line your tool uses. Do not merge to main and do not run `task done`: the orchestrator does both.
9. Final reply, 10 lines or fewer: what was built, the gate results, the `test:visual` number, anything left out and why, and anything a shared file needs.
