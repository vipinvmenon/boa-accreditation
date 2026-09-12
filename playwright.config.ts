import { defineConfig, devices } from '@playwright/test'

const port = process.env['PLAYWRIGHT_PORT'] ?? '4173'
const baseURL = process.env['PLAYWRIGHT_BASE_URL'] ?? `http://127.0.0.1:${port}`

/**
 * Browser-test boundary for the gate.
 *
 * Keep this separate from Vitest's root-level unit files. ACC-057 must not
 * manufacture a browser flow before /gate and /api/gate/* exist; the suite
 * will intentionally report "No tests found" until that interface is built.
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
    url: `${baseURL}/gate/setup`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
})
