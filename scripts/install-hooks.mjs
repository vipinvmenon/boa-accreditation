// Points git at .githooks/ so the gates travel with the repo instead of living
// in one person's .git/hooks. Run automatically by pnpm's `prepare` lifecycle.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (!existsSync(join(root, '.git'))) {
  console.log('install-hooks: not a git checkout, skipping')
  process.exit(0)
}
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root })
  console.log('install-hooks: core.hooksPath -> .githooks')
} catch (e) {
  // Never fail an install over a hook. A broken hook must not stop work.
  console.warn('install-hooks: could not set core.hooksPath —', e.message)
}
