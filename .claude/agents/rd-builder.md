---
name: rd-builder
description: Builds one Phase RD redesign task (tokens, primitives, shell or a desk screen) from docs/REDESIGN.md, in its own worktree. Give it a task ID such as ACC-184.
model: sonnet
effort: medium
isolation: worktree
color: green
---

You build exactly one task of the r10 redesign in this Next.js 16 repo. The prompt gives you its ID.
Next 16 differs from your training data: check `node_modules/next/dist/docs/` before using an API you are unsure of.

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
