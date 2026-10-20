#!/usr/bin/env node
/**
 * Take the README screenshots against a running build.
 *
 * A script rather than a test because it asserts nothing: it walks a short session on a
 * phone-sized viewport (the first run, one lesson with a pick after two misses and its stars,
 * the map, *Cyferki*, *Pokoloruj* and *Gdzie jest…?* over a few learned words, a story page, a
 * chest and the album, the parent gate, the word plan, the progress dashboard, the speech
 * screen, and the lock once the day's minutes are used up)
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

/**
 * @param {string} name
 * @param {number} settle  ms for entrance animations to settle
 */
async function shot(name, settle = 600) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => [...document.images].every((img) => img.complete));
  await page.waitForTimeout(settle);
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

// Five fruit and three colours learned on two earlier days and 20 stars (as another device
// would sync them), for the games, the picnic story and a chest.
const childId = /** @type {string} */ (page.url().split('/child/')[1]);
await page.evaluate(async (child) => {
  const day = (/** @type {number} */ n) => new Date(Date.now() - n * 86_400_000).toLocaleDateString('sv-SE');
  const attempts = Object.fromEntries(
    ['fruit.apple', 'fruit.banana', 'fruit.pear', 'fruit.mango', 'fruit.orange', 'colours.red', 'colours.blue', 'colours.yellow'].map((w) => [
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
  // Some minutes on earlier days, for the dashboard's calendar.
  const minutes = { [day(1)]: 9, [day(2)]: 12, [day(4)]: 6, [day(8)]: 22, [day(9)]: 4 };
  const progress = { seq: 1, introduced: {}, attempts, stars: 20, chestsOpened: {}, lessons: {}, minutes, storiesHeard: {} };
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

// Pokoloruj: the right pot, then the picture.
await page.goto(`${BASE_URL}/#/child/${childId}/play/paint`);
await page.getByTestId('paint').waitFor();
await page.waitForTimeout(600);
const colour = await page.getByTestId('paint').getAttribute('data-colour');
await page.getByTestId('pots').locator(`[data-word-id="${colour}"]`).click();
await page.getByTestId('paint-picture').click();
await page.locator('[data-testid="paint-picture"][data-painted]').waitFor();
// Before the next round comes (with no voice to wait for, it comes quickly).
await shot('paint', 250);
await page.goto(`${BASE_URL}/#/child/${childId}/play/spy`);
await page.getByTestId('spy').waitFor();
await shot('spy');

// The picnic story, on its second page.
await page.goto(`${BASE_URL}/#/child/${childId}/stories`);
await page.locator('[data-story="polly-picnic"]').click();
await page.locator('[data-testid="story"][data-page="1"]').waitFor({ timeout: 20_000 });
await shot('story');
await page.goto(`${BASE_URL}/#/child/${childId}`);
await page.getByTestId('map').waitFor();

// A chest: three taps, the stickers, then the album with the new ones ringed.
await page.getByTestId('chest').click();
for (let i = 0; i < 3; i++) await page.getByTestId('chest-open').click();
await page.getByTestId('next').waitFor({ timeout: 20_000 });
await shot('chest');
await page.getByTestId('next').click();
await page.locator('[data-owned="true"]').first().waitFor();
await shot('album');
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
await page.getByRole('heading', { name: 'Postępy' }).evaluate((h) => h.scrollIntoView({ block: 'start' }));
await shot('dashboard');

await page.goto(`${BASE_URL}/#/parent/speech`);
await page.getByTestId('voice-en').waitFor();
await shot('speech');

// The lock: today's 15 minutes played on the other device, then back to the child.
await page.evaluate(async (child) => {
  const today = new Date().toLocaleDateString('sv-SE');
  const db = await new Promise((resolve) => {
    const open = indexedDB.open('hello-polly');
    open.onsuccess = () => resolve(open.result);
  });
  const row = await new Promise((resolve) => {
    const get = db.transaction('family').objectStore('family').get('local');
    get.onsuccess = () => resolve(get.result);
  });
  const other = row.file.progress[child]['screenshot-device'];
  row.file.progress[child]['screenshot-device'] = { ...other, seq: other.seq + 1, minutes: { ...other.minutes, [today]: 15 } };
  await new Promise((resolve) => {
    const tx = db.transaction('family', 'readwrite');
    tx.objectStore('family').put(row);
    tx.oncomplete = resolve;
  });
  db.close();
}, childId);
await page.goto(`${BASE_URL}/#/child/${childId}/play`);
await page.getByTestId('sleep').waitFor();
await shot('sleep');

await context.close();
await browser.close();
