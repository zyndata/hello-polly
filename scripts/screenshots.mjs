#!/usr/bin/env node
/**
 * Take the README screenshots against a running build.
 *
 * A script rather than a test because it asserts nothing: it opens the screens on a phone-sized
 * viewport and writes PNGs into `docs/screenshots/`. Re-run it whenever a screen in the README
 * changes.
 *
 *   npm run docker:up          # or: npx vite preview --port 4173
 *   npm run screenshots        # another target: set BASE_URL (e.g. http://localhost:4173)
 *
 * Chromium comes from the Playwright the e2e suite already depends on; no new package.
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';

/** Which screens, under which file name. Grows as the phases build real screens. */
const SHOTS = [
  ['start', '/'],
  ['map', '/child/demo'],
  ['parent', '/parent']
];

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 400, height: 820 },
  deviceScaleFactor: 2,
  locale: 'pl-PL'
});
const page = await context.newPage();

for (const [name, path] of SHOTS) {
  await page.goto(`${BASE_URL}/#${path}`);
  await page.getByRole('heading', { level: 1 }).waitFor({ state: 'visible' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`docs/screenshots/${name}.png`);
}

await context.close();
await browser.close();
