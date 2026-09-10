# Tooling — Claude Code, Cursor, Codex

> **Status: current.** Everything here was verified on 11 Sep 2026.

This project is worked on by more than one agent. They must all follow the same
rules and run the same gates, or the gates stop meaning anything.

## What each tool reads

| Tool | Reads | Notes |
|---|---|---|
| **Claude Code** | `CLAUDE.md` → `/docs` | `.claude/skills/` symlinks the Supabase skills |
| **Cursor** | `.cursor/rules/*.mdc` | `00`/`10` always apply; `20` on UI globs, `30` on data globs |
| **Codex** | `AGENTS.md` → `/docs` | Identical content to `CLAUDE.md` |
| all three | `.mcp.json`, `.agents/skills/` | project-scoped, committed, travel with the repo |

`AGENTS.md` and `CLAUDE.md` are deliberately identical. If you change one,
change both — there is a CI check for exactly this.

**The rule for all three: read `docs/CURRENT-STATE.md` first, every session.**

## Commands — the same everywhere

**`pnpm` is not on the PATH on this machine.** Always `corepack pnpm`.

```bash
corepack pnpm dev                # local dev on :3000
corepack pnpm typecheck
corepack pnpm lint               # design tokens + font weights + eslint
corepack pnpm test               # vitest
corepack pnpm build
corepack pnpm test:visual        # design fidelity — REQUIRED for any UI change
corepack pnpm design:reference   # re-capture the 28 references (rarely)
corepack pnpm test:db            # pgTAP against a real PostgreSQL
corepack pnpm check:sql          # static migration check, no database
corepack pnpm db:state           # ask the database, do not ask a document
corepack pnpm verify:deploy      # 18 checks against the LIVE site
```

## Build and deploy, always

Three layers, so nothing reaches production unverified:

1. **pre-commit** (`.githooks/pre-commit`) — typecheck, design gates, unit
   tests. Fast, because a hook people bypass is not a hook.
2. **pre-push** (`.githooks/pre-push`) — full build, then `test:visual`, then
   `check:sql` if migrations exist. This is the last point before a push
   triggers a real Vercel deploy. Skip deliberately with `SKIP_VISUAL=1 git push`.
3. **CI + deployment_status** — `ci.yml` on every push; `deploy-verify.yml` when
   Vercel reports a successful production deploy, plus daily at 08:00 IST.

Hooks are installed by `corepack pnpm install` (the `prepare` script points
`core.hooksPath` at `.githooks`). To confirm: `git config core.hooksPath`.

> Why `verify-deploy` exists: every setting in `vercel.json` fails *silently* —
> a wrong `source` pattern does not error, it simply never matches. The only way
> to know is to ask the running site. It has already earned its place: it found
> the service worker precaching three routes that 404, which would have made
> `caches.addAll()` reject and disabled offline support at the gate.

## MCP servers

All four are project-scoped in `.mcp.json`, so Cursor and Codex get them too.

| Server | Why this project needs it |
|---|---|
| `supabase` | schema, migrations, logs, advisors for project `tjbfvuboyvaephtewjwq` |
| `vercel` | deployments, build logs, runtime errors without a dashboard round trip |
| `github` | PRs, issues, Actions runs — CI failures are otherwise fetched by hand |
| `playwright` | the design gate and the aeroplane-mode test are both browser-driven |

**All four need authenticating once, in a regular terminal, from this directory:**

```bash
claude        # approve the project-scoped servers when prompted
/mcp          # select each server, then Authenticate
```

This cannot be done from an IDE-hosted or non-interactive session — it is an
OAuth flow. Until it is done, agents can write migrations but cannot run them,
and `db:state` has nothing to ask.

In Cursor: Settings → MCP; it picks up `.mcp.json` and prompts separately.

## Agent skills

`.agents/skills/` holds two Supabase skills (`supabase`,
`supabase-postgres-best-practices`), symlinked into `.claude/skills/` with
relative links so they are portable. They are documentation only — no scripts,
no hooks, nothing executable. Reviewed 11 Sep before being committed; the
installer's own warning is that skills run with full agent permissions.

Reading them caught four things worth having: views bypass RLS by default,
`auth.role()` is deprecated, an UPDATE needs a SELECT policy, and the browser
key should be publishable rather than the legacy anon key. All four are in
`docs/SECURITY.md`.

## The design gate, in detail

`design/reference/` holds 28 PNGs: 7 screens × 2 themes × 2 viewports.

They are captured by **opening the approved bundle in a real browser and driving
its own controls** — not by re-implementing its logic in Node. That distinction
is the whole point: a gate whose reference is a second implementation proves
only that two of my guesses agree. bar-control's design QA failed exactly that
way.

`visual-check.mjs` starts **its own** server on a free port, because bar-control
once got a false verdict from a stale dev server on :5173. It also reports
COVERAGE every run — a screen with no route cannot fail a pixel comparison, so
a gate that only compares what exists would report success while six of seven
screens are missing.

If it fails: open the `.diff.png` in `test-results/visual/`. **Do not regenerate
the reference to make it pass.**
