// The handoff mechanism. Answers "what do I do next?" for whichever agent opens
// this repo — Claude Code, Cursor or Codex — without any of them needing the
// conversation the previous one had.
//
// That is the whole problem this solves. An agent inherits the repository, not
// the chat. If the only record of "where we stopped" lives in someone's
// terminal scrollback, the next agent restarts the task, or worse, starts the
// one after it.
//
// docs/ROADMAP.md is the single source of truth. This script reads and writes
// its checkboxes; it does not keep a second copy of the state anywhere.
//
//   corepack pnpm task                 what is in flight, what is next, what blocks
//   corepack pnpm task start ACC-020   claim it (marks [~])
//   corepack pnpm task done ACC-020    run the gates, then tick it
//   corepack pnpm task block ACC-020 "waiting on keys"
//
// Checkbox states:  [ ] not started   [~] IN FLIGHT   [x] done

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROADMAP = join(root, 'docs/ROADMAP.md')
const STATE = join(root, 'docs/CURRENT-STATE.md')

const TASK_RE = /^- \[([ x~])\] \*\*(ACC-[\w-]+)\*\* · (.+)$/

function parse() {
  const lines = readFileSync(ROADMAP, 'utf8').split('\n')
  const tasks = []
  let phase = '(no phase)'
  let blockedSection = false

  lines.forEach((line, i) => {
    const h = /^##+\s+(.*)$/.exec(line)
    if (h) {
      phase = h[1].replace(/[⛔▶✅]/g, '').replace(/\s+/g, ' ').trim()
      blockedSection = /Blocked on/i.test(h[1])
    }
    const m = TASK_RE.exec(line)
    if (!m) return
    // Continuation lines are indented under the bullet.
    let desc = m[3]
    for (let j = i + 1; j < lines.length; j++) {
      if (/^      \S/.test(lines[j])) desc += ' ' + lines[j].trim()
      else break
    }
    const owner = /\*\*([A-Z]{1,2}(?:\/[A-Z]{1,2})?)\*\*/.exec(desc)?.[1] ?? '?'
    const due = /due ([A-Za-z0-9 ]+)$/.exec(desc.trim())?.[1] ?? null
    tasks.push({
      id: m[2],
      state: m[1],
      phase,
      blocking: blockedSection,
      owner,
      due,
      line: i,
      text: desc.replace(/·\s*\*\*[A-Z/]{1,5}\*\*.*$/, '').replace(/`/g, '').trim(),
    })
  })
  return { lines, tasks }
}

function setState(id, next) {
  const { lines, tasks } = parse()
  const t = tasks.find((x) => x.id === id)
  if (!t) {
    console.error(`task: ${id} is not in docs/ROADMAP.md`)
    process.exit(1)
  }
  lines[t.line] = lines[t.line].replace(/^- \[[ x~]\]/, `- [${next}]`)
  writeFileSync(ROADMAP, lines.join('\n'))
  return t
}

const short = (s, n = 68) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

/** Asia/Kolkata, always. The festival, the build days and every date in
 *  ROADMAP.md are IST; a UTC timestamp writes yesterday's date into the log
 *  for the whole Indian evening, which is exactly when work happens here. */
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const cmd = process.argv[2]
const id = process.argv[3]

// ── status (default) ──────────────────────────────────────────────────────
if (!cmd || cmd === 'status') {
  const { tasks } = parse()
  const inFlight = tasks.filter((t) => t.state === '~')
  const blockers = tasks.filter((t) => t.blocking && t.state === ' ')
  const agentTodo = tasks.filter((t) => t.state === ' ' && !t.blocking && /C/.test(t.owner))
  const done = tasks.filter((t) => t.state === 'x')

  console.log(`\n  BOA Accreditation — ${done.length}/${tasks.length} tasks done\n`)

  if (inFlight.length) {
    console.log('  IN FLIGHT (pick this up first; Phase RD tasks may run in parallel, see docs/REDESIGN.md):')
    for (const t of inFlight) console.log(`    ~ ${t.id}  ${short(t.text)}`)
    console.log(`      git log --oneline -3   # see how far it got`)
  } else {
    console.log('  IN FLIGHT: nothing claimed.')
  }

  if (blockers.length) {
    console.log(`\n  ⛔ BLOCKED ON A HUMAN — ${blockers.length} item(s):`)
    for (const t of blockers) console.log(`    ! ${t.id}  [${t.owner}] ${short(t.text)}`)
  }

  console.log('\n  NEXT UP for an agent:')
  if (!agentTodo.length) console.log('    nothing left in ROADMAP.md for owner C')
  for (const t of agentTodo.slice(0, 5)) {
    console.log(`    · ${t.id}  ${short(t.text)}${t.due ? `   (due ${t.due})` : ''}`)
  }

  console.log(`\n  Read first: docs/CURRENT-STATE.md`)
  console.log(`  Claim one:  corepack pnpm task start <ID>\n`)
  process.exit(0)
}

// ── start ─────────────────────────────────────────────────────────────────
if (cmd === 'start') {
  if (!id) { console.error('usage: task start ACC-020'); process.exit(1) }
  const { tasks } = parse()
  // One task at a time, per lane. Phase RD (docs/REDESIGN.md) runs parallel
  // agents, one per task, each in its own worktree, so RD tasks never block
  // each other and never block the one non-RD task in flight.
  const isRD = (t) => /^Phase RD\b/.test(t.phase)
  const self = tasks.find((t) => t.id === id)
  const open = tasks.filter(
    (t) => t.state === '~' && t.id !== id && !(self && isRD(self)) && !isRD(t),
  )
  if (open.length) {
    console.error(`task: ${open.map((t) => t.id).join(', ')} already in flight.`)
    console.error('One task at a time outside Phase RD — CLAUDE.md. Finish or release it first:')
    console.error(`  corepack pnpm task block ${open[0].id} "why"`)
    process.exit(1)
  }
  const blockers = tasks.filter((t) => t.blocking && t.state === ' ')
  if (blockers.length) {
    console.warn(`task: NOTE ${blockers.length} human blocker(s) still open — ${blockers.map((t) => t.id).join(', ')}`)
    console.warn('       If this task needs the database, it cannot finish.\n')
  }
  const t = setState(id, '~')
  console.log(`task: ${id} IN FLIGHT — ${short(t.text)}`)
  console.log('       Commit the roadmap change so the next agent sees it:')
  console.log(`       git add docs/ROADMAP.md && git commit -m "chore(${id}): start"`)
  process.exit(0)
}

// ── done ──────────────────────────────────────────────────────────────────
if (cmd === 'done') {
  if (!id) { console.error('usage: task done ACC-020'); process.exit(1) }
  console.log('task: running the gates before ticking anything.\n')
  // "Never mark a task done without meeting its acceptance criteria" is
  // non-negotiable #10. Making the tick conditional on the gates is the only
  // version of that rule which does not rely on somebody remembering it.
  for (const g of ['typecheck', 'lint', 'test']) {
    try {
      execSync(`corepack pnpm ${g}`, { cwd: root, stdio: 'inherit' })
    } catch {
      console.error(`\ntask: ${g} FAILED. ${id} is not done.`)
      process.exit(1)
    }
  }
  const t = setState(id, 'x')
  console.log(`\ntask: ${id} done — ${short(t.text)}`)
  console.log('       Now add a line to docs/CURRENT-STATE.md saying what is')
  console.log('       true that was not true before, and what you VERIFIED.')
  process.exit(0)
}

// ── block ─────────────────────────────────────────────────────────────────
if (cmd === 'block') {
  if (!id) { console.error('usage: task block ACC-020 "reason"'); process.exit(1) }
  const reason = process.argv.slice(4).join(' ') || 'no reason given'
  setState(id, ' ')
  const state = readFileSync(STATE, 'utf8')
  const note = `\n> **${id} released ${today()} (IST):** ${reason}\n`
  writeFileSync(STATE, state.replace(/^## Session log$/m, note + '\n## Session log'))
  console.log(`task: ${id} released back to not-started. Reason recorded in CURRENT-STATE.md.`)
  process.exit(0)
}

console.error(`task: unknown command "${cmd}". Try: status | start | done | block`)
process.exit(1)
