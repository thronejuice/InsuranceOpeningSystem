import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for UI acceptance flow (spec §47).
 * Requires `npm run dev` (api + web) running before executing these tests.
 * The API must be seeded: `npm run db:seed` with SEED_USER_PASSWORD set.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    // Dev server proxies /api → localhost:3000
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
