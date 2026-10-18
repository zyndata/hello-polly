import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * End-to-end runs in a real browser.
 *
 * By default the suite builds the app and serves it with `vite preview`, which applies no
 * production headers. `playwright.csp.config.ts` points the same specs at the Caddy container
 * (`npm run docker:up`, then `npm run test:e2e:csp`), and since every spec asserts that the page
 * reported no CSP violation, that run is the one that proves the policy.
 */

/**
 * Declared rather than pulled in with `@types/node`: the app's type environment stays free of
 * Node globals that have no business being reachable from `src/`.
 */
declare const process: { env: Record<string, string | undefined> };

const isCI = process.env.CI !== undefined;

/**
 * Chromium always; WebKit (the engine of Safari, and of every browser on an iPhone) in CI and
 * whenever `E2E_WEBKIT` is set, so a local loop can stay on one engine.
 */
const projects: PlaywrightTestConfig['projects'] = [
  { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ...(isCI || process.env.E2E_WEBKIT !== undefined
    ? [{ name: 'webkit', use: { ...devices['Desktop Safari'] } }]
    : [])
];

export const shared: PlaywrightTestConfig = {
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  projects
};

export default defineConfig({
  ...shared,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !isCI,
    timeout: 180_000
  }
});
