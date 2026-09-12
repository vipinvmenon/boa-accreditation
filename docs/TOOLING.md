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

## Handing off between agents

**The problem this solves:** an agent inherits the repository, not the previous
agent's conversation. If you hit Claude limits mid-task and open Cursor, Cursor
has the docs but no idea which task was underway or how far it got. Without a
marker it restarts the task, or worse, starts the one after it.

`docs/ROADMAP.md` is the single source of truth for task state — there is no
second copy anywhere. Every task is one parseable line:

```
- [ ] **ACC-020** · not started
- [~] **ACC-020** · IN FLIGHT — somebody is on this
- [x] **ACC-020** · done, gates passed
```

GitHub renders these as real checkboxes, so you can tick things off in the web UI
and the script sees it.

```bash
corepack pnpm task                      # in flight · next up · blocked on a human
corepack pnpm task start ACC-020        # claim it — refuses if another is in flight
corepack pnpm task done  ACC-020        # runs typecheck+lint+test, THEN ticks the box
corepack pnpm task block ACC-020 "ran out of limits mid-migration"
```

`task done` is the important one: it refuses to tick the box if any gate fails.
Non-negotiable #10 — *never mark a task done without meeting its acceptance
criteria* — made mechanical instead of remembered.

`task block` writes the reason into `docs/CURRENT-STATE.md`. **That one line is
what lets the next agent resume instead of restart**, so it is worth writing
properly: "stopped after the tables landed, RLS policies not written" beats
"out of limits".

**Always commit the roadmap change.** An uncommitted `[~]` is invisible to every
other tool. Dates are written in **IST**, not UTC — the whole plan is on festival
time, and a UTC timestamp writes yesterday's date for the entire Indian evening.

### The session-start protocol

All three agents are told the same thing (`CLAUDE.md`, `AGENTS.md`,
`.cursor/rules/00-truth.mdc`), and `check-agent-docs.mjs` fails lint if any of
them stops saying it:

1. `corepack pnpm task` and `git log --oneline -5`
2. Read `docs/CURRENT-STATE.md`
3. Something `[~]`? Pick that up. Otherwise take the first NEXT UP.
4. Claim, work, `task done` — or `task block` with a real reason.

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

### Watching ACC-071

The workflow is observable in GitHub Actions, but a schedule entry is not a
successful verification. Check both the event and conclusion:

```bash
gh run list --workflow deploy-verify.yml --event schedule --limit 20 \
  --json databaseId,event,status,conclusion,createdAt,url
```

For a failed run, inspect the verifier output rather than inferring the cause
from the red check:

```bash
gh run view <run-id> --log-failed
```

On 12 Sep 2026, the two observed scheduled runs (`34680327221` and
`34574267838`) both failed before checking the site. Deployment-triggered runs
showed the same issue: the workflow's `pnpm` invocation passed the separator
`--` through to `verify-deploy.mjs`, which treated it as the host. The workflow
now passes the URL without that separator, and the script tolerates the
separator for direct CLI use. This fixes the observed failure; it does not
claim that a later scheduled run has succeeded.

On the same day, local GitHub authentication was confirmed with `gh auth
status` (`vipinvmenon`, `repo` and `workflow` scopes), and a manual dispatch was
authorized. Run
[34702469104](https://github.com/vipinvmenon/boa-accreditation/actions/runs/34702469104)
used remote `main` at `f53f1b4`, which predates the local workflow fix, so it
failed on the literal `--` before reaching the live-site checks. Remote `main`
is 28 commits behind this checkout; no post-fix workflow evidence exists until
the fix is pushed. A direct local run against production passed 17 of 18
checks; the remaining mismatch is the live `Service-Worker-Allowed: /gate/`
header versus the verifier's expected `/gate`, which is a separate issue.

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
