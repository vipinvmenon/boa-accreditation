// CLAUDE.md and AGENTS.md must stay identical apart from their title line.
//
// Three agents work on this repo (Claude Code, Cursor, Codex) and they read
// different files. The moment those files disagree, one agent is working to
// rules another has abandoned — and nobody finds out, because each tool only
// ever reads its own. Divergence here is silent by construction, so it needs a
// gate rather than a good intention.
//
// .cursor/rules/ is deliberately NOT a copy: it is scoped by glob and states
// the same non-negotiables in its own form. It is checked for the rules being
// present, not for being identical.

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

let failed = 0
const fail = (m) => {
  console.error(`  ${m}`)
  failed++
}

// ── 1. CLAUDE.md === AGENTS.md, modulo the title ──────────────────────────
const strip = (s) =>
  s
    .replace(/^# (CLAUDE|AGENTS)\.md — BOA Accreditation$/m, '# TITLE')
    .replace(/This file is (identical to `CLAUDE\.md` and is )?short on purpose\./, 'INTRO')
    .trim()

const claude = strip(read('CLAUDE.md'))
const agents = strip(read('AGENTS.md'))

if (claude !== agents) {
  const a = claude.split('\n')
  const b = agents.split('\n')
  const n = Math.max(a.length, b.length)
  let shown = 0
  for (let i = 0; i < n && shown < 5; i++) {
    if (a[i] !== b[i]) {
      fail(`CLAUDE.md:${i + 1} differs from AGENTS.md`)
      console.error(`      CLAUDE: ${(a[i] ?? '(missing)').slice(0, 90)}`)
      console.error(`      AGENTS: ${(b[i] ?? '(missing)').slice(0, 90)}`)
      shown++
    }
  }
  if (shown === 0) fail('CLAUDE.md and AGENTS.md differ (whitespace or trailing content)')
}

// ── 2. Every doc the truth-table points at must exist ─────────────────────
for (const m of read('CLAUDE.md').matchAll(/\]\((docs\/[A-Z-]+\.md)\)/g)) {
  if (!existsSync(join(root, m[1]))) fail(`CLAUDE.md links ${m[1]}, which does not exist`)
}

// ── 3. Cursor must carry the non-negotiables, in some form ────────────────
if (!existsSync(join(root, '.cursor/rules'))) {
  fail('.cursor/rules/ is missing — Cursor would work without any project rules')
} else {
  const cursor = ['00-truth', '10-non-negotiables', '20-ui', '30-data']
    .map((f) => (existsSync(join(root, `.cursor/rules/${f}.mdc`)) ? read(`.cursor/rules/${f}.mdc`) : ''))
    .join('\n')
  // A handful of load-bearing phrases. Not a diff — the Cursor rules are
  // deliberately worded for their own globs — but a check that the ideas survived.
  const mustMention = [
    ['CURRENT-STATE', 'read the state doc first'],
    ['append-only', 'the ledger rule'],
    ['anon', 'the anon lockdown'],
    ['pass_token', 'no token before approval'],
    ['corepack pnpm', 'the command prefix'],
    ['test:visual', 'the design gate'],
    ['task start', 'the resume protocol — without it Cursor restarts instead of resuming'],
    ['IN FLIGHT', 'how to spot a half-finished task'],
  ]
  for (const [needle, what] of mustMention) {
    if (!cursor.includes(needle)) fail(`.cursor/rules/ never mentions "${needle}" — ${what} is missing for Cursor`)
  }
}

if (failed) {
  console.error('\nagent-docs check FAILED. Three agents, one set of rules.')
  process.exit(1)
}
console.log('agent-docs OK — CLAUDE.md === AGENTS.md, docs resolve, Cursor rules carry the non-negotiables')
