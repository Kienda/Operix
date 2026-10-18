import { defineConfig, devices } from '@playwright/test';

// Locally: the installed Microsoft Edge (no browser download). CI: Playwright Chromium.
const channel = process.env.CI ? undefined : process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.mjs/,
  globalSetup: './e2e/global-setup.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(channel ? { channel } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } },
  ],
});
