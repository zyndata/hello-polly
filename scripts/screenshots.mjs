#!/usr/bin/env node
/**
 * Take the README screenshots against a running build.
 *
 * A script rather than a test because it asserts nothing: it walks a short session on a
 * phone-sized viewport (the first run, one look-and-listen lesson, the map, the parent gate, the
 * word plan, the speech screen) and writes PNGs into `docs/screenshots/`. Re-run it whenever a
 * screen in the README changes.
 *
 *   npm run docker:up          # or: npx vite preview --port 4173
 *   npm run screenshots        # another target: set BASE_URL (e.g. http://localhost:4173)
 *
 * Chromium comes from the Playwright the e2e suite already depends on; no new package. The
 * page's `Math.random` is pinned to 0, so the parent gate always asks for ten („dziesięć”).
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:8081';

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 400, height: 820 },
  deviceScaleFactor: 2,
  locale: 'pl-PL'
});
await context.addInitScript(() => {
  Math.random = () => 0;
});
const page = await context.newPage();

/** @param {string} name */
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  // Let entrance animations settle.
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT_DIR, `${name}.png`) });
  console.log(`docs/screenshots/${name}.png`);
}

async function passGate() {
  await page.getByTestId('gate').waitFor();
  await page.locator('[data-key="1"]').click();
  await page.locator('[data-key="0"]').click();
}

await page.goto(`${BASE_URL}/#/`);
await page.getByTestId('start').waitFor();
await shot('start');

// The first run.
await page.goto(`${BASE_URL}/#/setup`);
await page.getByRole('button', { name: 'Dalej' }).click();
await page.getByRole('button', { name: 'Zaczynamy' }).click();
await page.getByLabel('Imię lub przezwisko').fill('Ola');
await page.locator('label.avatar-option').filter({ has: page.locator('input[value="fox"]') }).click();
await page.getByRole('button', { name: 'Dalej' }).click();
await page.getByRole('button', { name: 'Dalej' }).click();
await page.getByTestId('handover').click();
await page.getByTestId('map').waitFor();

// One lesson, so the map has a flag behind the ship.
await page.getByTestId('sail').click();
await page.getByTestId('lesson-word').waitFor();
await page.getByTestId('lesson-word').locator('button').click();
await page.getByTestId('next').waitFor();
await shot('lesson');
for (let i = 0; i < 3; i++) {
  if (i > 0) await page.getByTestId('lesson-word').locator('button').click();
  await page.getByTestId('next').click();
}
await page.getByTestId('map').waitFor({ timeout: 15_000 });
await shot('map');

// The parent side.
await page.getByTestId('gear').click();
await page.getByTestId('gate').waitFor();
await shot('gate');
await passGate();
await page.getByTestId('children').locator('a').first().click();
await page.getByTestId('upcoming').waitFor();
await shot('plan');

await page.goto(`${BASE_URL}/#/parent/speech`);
await page.getByTestId('voice-en').waitFor();
await shot('speech');

await context.close();
await browser.close();
