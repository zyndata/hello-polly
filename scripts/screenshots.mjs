#!/usr/bin/env node
/**
 * Take the README screenshots against a running build.
 *
 * A script rather than a test because it asserts nothing: it walks a short session on a
 * phone-sized viewport (the first run, one lesson with a pick after two misses and its stars,
 * the map, *Cyferki* over a few learned words, the parent gate, the word plan, the speech screen)
 * and writes PNGs into `docs/screenshots/`. Re-run it whenever a screen in the README changes.
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
let picks = 0;
for (;;) {
  const step = page.getByTestId('step').or(page.getByTestId('lesson-finished'));
  await step.waitFor();
  if (await page.getByTestId('lesson-finished').isVisible()) break;
  const index = await page.getByTestId('step').getAttribute('data-index');
  if ((await page.getByTestId('step').getAttribute('data-kind')) === 'introduce') {
    if ((await page.getByTestId('next').count()) === 0) await page.getByTestId('lesson-word').locator('button').click();
    await page.getByTestId('next').click();
  } else {
    const target = await page.getByTestId('pick').getAttribute('data-target');
    if (picks++ === 0) {
      // Two misses: the right picture glows.
      const wrong = page.getByTestId('pick').locator(`[data-word-id]:not([data-word-id="${target}"])`);
      await wrong.click();
      await wrong.click();
      await shot('pick');
    }
    await page.locator(`[data-word-id="${target}"]`).click();
  }
  await page.waitForFunction(
    (before) =>
      document.querySelector('[data-testid="lesson-finished"]') ||
      document.querySelector('[data-testid="step"]')?.getAttribute('data-index') !== before,
    index
  );
}
await page.waitForTimeout(900);
await shot('finish');
await page.getByTestId('map').waitFor({ timeout: 15_000 });
await shot('map');

// Four fruit learned on two earlier days (as another device would sync them), for Cyferki.
const childId = /** @type {string} */ (page.url().split('/child/')[1]);
await page.evaluate(async (child) => {
  const day = (/** @type {number} */ n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE');
  const attempts = Object.fromEntries(
    ['fruit.apple', 'fruit.banana', 'fruit.pear', 'fruit.mango'].map((w) => [
      w,
      { [day(2)]: { c: 2, w: 0, first: 2 }, [day(1)]: { c: 1, w: 0, first: 1 } }
    ])
  );
  const db = await new Promise((resolve) => {
    const open = indexedDB.open('hello-polly');
    open.onsuccess = () => resolve(open.result);
  });
  const row = await new Promise((resolve) => {
    const get = db.transaction('family').objectStore('family').get('local');
    get.onsuccess = () => resolve(get.result);
  });
  const progress = { seq: 1, introduced: {}, attempts, stars: 0, chestsOpened: {}, lessons: {}, minutes: {}, storiesHeard: {} };
  row.file.progress[child] = { ...row.file.progress[child], 'screenshot-device': progress };
  await new Promise((resolve) => {
    const tx = db.transaction('family', 'readwrite');
    tx.objectStore('family').put(row);
    tx.oncomplete = resolve;
  });
  db.close();
}, childId);
await page.goto(`${BASE_URL}/#/child/${childId}`);
await page.getByTestId('games').click();
await page.locator('[data-game="digits"]').click();
await page.locator('[data-digit="2"]').click();
await shot('digits');
await page.goto(`${BASE_URL}/#/child/${childId}`);
await page.getByTestId('map').waitFor();

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
