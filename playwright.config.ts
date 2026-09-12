import { defineConfig, devices } from '@playwright/test'

/**
 * Browser-test boundary for the gate.
 *
 * Keep this separate from Vitest's root-level unit files. ACC-057 must not
 * manufacture a browser flow before /gate and /api/gate/* exist; the suite
 * will intentionally report "No tests found" until that interface is built.
 *
 * The eventual aeroplane-mode test must provide its seeded local Supabase
 * environment and server through the invoking CI job. This config does not
 * point at production and does not invent credentials or fixtures.
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
    baseURL: process.env['PLAYWRIGHT_BASE_URL'] ?? 'http://127.0.0.1:3000',
    browserName: 'chromium',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
})
