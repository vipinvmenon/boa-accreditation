import { defineConfig, devices } from '@playwright/test'

const port = process.env['PLAYWRIGHT_PORT'] ?? '4173'
const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${port}`

/**
 * Browser-test boundary for the gate.
 *
 * Keep this separate from Vitest's root-level unit files. ACC-057's
 * tests/e2e/aeroplane-mode.spec.ts covers cold reload green/amber/red plus
 * the two failure paths (401 queue preservation, 500 causal ordering)
 * against real browser Dexie and a true cold service-worker navigation, run
 * in CI via .github/workflows/ci.yml's `gate-e2e` job.
 *
 * The suite uses deterministic API mocks in tests/e2e rather than production
 * credentials or a live Supabase seed. The web server is always local.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: '**/*.unit.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: 'line',
  use: {
    baseURL,
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    command: `corepack pnpm build && corepack pnpm exec next start -p ${port}`,
    url: `${baseURL}/gate`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
