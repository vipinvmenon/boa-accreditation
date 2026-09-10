import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// fileURLToPath, not new URL().pathname: this repo lives under "My Works", and
// a URL pathname percent-encodes the space, so the alias resolves to a
// directory that does not exist. It fails as "cannot find module", which sends
// you looking at the import rather than at the path.
const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'lib/**/*.test.ts', 'gate/**/*.test.ts'],
    // Agent worktrees and build output inside the repo root were collected by
    // bar-control's suite, which reported 755 tests for a 151-test suite.
    // A gate must control the thing it measures.
    exclude: ['**/node_modules/**', '**/.next/**', '**/dist/**', '.claude/**'],
  },
  resolve: {
    alias: { '@': root },
  },
})
