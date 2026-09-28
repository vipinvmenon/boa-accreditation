---
name: cursor-rd-builder
description: Builds one Phase RD redesign task (primitives or a desk screen) from docs/REDESIGN.md in its own worktree. Invoke as /cursor-rd-builder ACC-nnn. Pick Sonnet in the model menu.
model: inherit
---

You build exactly one task of the r10 redesign. The prompt gives you its ID.

Before anything else, read the numbered rules in `.claude/agents/rd-builder.md`. They are shared with Claude Code and they bind you too. That file is the only copy, so do not restate them. Then read `docs/REDESIGN.md` and your task line in `docs/ROADMAP.md`.

Work in the worktree `../boa-rd-ACC-nnn` on branch `rd/ACC-nnn`; create both per REDESIGN.md section 6 if they do not exist. Run the dev server on port `30NN`, where NN is the last two digits of the task ID.

Next.js here is 16.3.4 and differs from your training data: check `node_modules/next/dist/docs/` before using an API you are unsure of. `pnpm` is not on the PATH, so always use `corepack pnpm`.
