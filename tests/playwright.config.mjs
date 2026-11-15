// Playwright config for the browser E2E suite (tests/e2e). Same BASE_URL as the
// other live suites. Keep @playwright/test in package.json pinned to the same
// version as the mcr.microsoft.com/playwright image in Jenkinsfile_post.

import { defineConfig, devices } from '@playwright/test';
import { BASE_URL } from './lib/config.mjs';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.mjs',
  outputDir: 'reports/e2e-artifacts', // traces, screenshots, videos of failures

  // Tests mostly wait on the game's card animations, not CPU, so run them side by
  // side: the suite takes about as long as its longest full game (~3 min). A
  // fixed count keeps that true on small CI agents too (default is half the cores).
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS) || 4,
  timeout: 90_000,
  expect: { timeout: 15_000 },

  reporter: [
    ['list'],
    ['junit', { outputFile: 'reports/e2e-junit.xml' }],
    ['html', { outputFolder: 'reports/e2e-html', open: 'never' }]
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // Safari engine on a phone-sized, touch-enabled viewport: the solo flows only.
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] }, testMatch: 'solo.spec.mjs' }
  ]
});
