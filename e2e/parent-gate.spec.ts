import { expect, test } from './fixtures';
import { firstRun } from './family';
import { gateNumber, passGate } from './gate';
import { fakeSpeech, spoken } from './speech';
import { mulberry32 } from '../src/lib/domain/random';

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

test('50 random taps do not open the gate', async ({ page }) => {
  // The page's Math.random (the gate's numbers) and the taps both come from fixed seeds, so
  // the run is the same every time. The odds over many seeds are unit-tested in gate.test.ts.
  await page.addInitScript(() => {
    let a = 20261019;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  await page.goto('/#/parent');
  const gate = page.getByTestId('gate');
  await expect(gate).toBeVisible();
  // Anywhere on the keypad, gaps included.
  const box = await page.getByTestId('keypad').boundingBox();
  if (!box) throw new Error('The keypad has no box');
  const random = mulberry32(4);
  let misses = 0;
  for (let tap = 0; tap < 50; tap++) {
    await page.mouse.click(box.x + random() * box.width, box.y + random() * box.height);
    await page.waitForTimeout(100);
    if ((await page.getByTestId('gate-locked').count()) > 0) misses++;
  }
  await expect(gate).toBeVisible();
  await expect(page.getByTestId('children')).toHaveCount(0);
  expect(misses, 'the random taps made a wrong guess, and the keypad paused').toBeGreaterThan(0);
});

test('a wrong number pauses the keypad and draws a new one; the right one opens the panel', async ({ page }) => {
  await page.goto('/#/parent');
  const first = await gateNumber(page);
  const wrong = first === 10 ? 11 : first - 1;
  await page.locator(`[data-key="${Math.floor(wrong / 10)}"]`).click();
  await page.locator(`[data-key="${wrong % 10}"]`).click();
  await expect(page.getByTestId('gate-locked')).toBeVisible();
  await expect(page.locator('[data-key="5"]')).toBeDisabled();
  expect(await gateNumber(page)).not.toBe(first);
  await expect(page.getByTestId('gate-locked')).toHaveCount(0, { timeout: 8000 });
  await passGate(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Panel rodzica' })).toBeVisible();
});

test('the gear says the gate is for a parent, and Polly leads back to the map', async ({ page }) => {
  const ola = await firstRun(page);
  await page.getByTestId('gear').click();
  await expect(page.getByTestId('gate')).toBeVisible();
  await expect
    .poll(() => spoken(page).then((s) => s.at(-1)?.text))
    .toBe('To jest miejsce dla rodzica. Dotknij Polly, żeby wrócić.');
  await page.getByTestId('gate-back').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
});

test('every parent screen is behind the gate, and a child screen closes it again', async ({ page }) => {
  const ola = await firstRun(page);
  for (const path of ['/parent', `/parent/child/${ola}`, '/parent/speech', '/parent/family']) {
    await page.goto(`/#${path}`);
    await expect(page.getByTestId('gate'), path).toBeVisible();
  }
  await passGate(page);
  await page.goto('/#/parent/speech');
  await expect(page.getByTestId('gate')).toHaveCount(0);
  await page.goto(`/#/child/${ola}`);
  await expect(page.getByTestId('map')).toBeVisible();
  await page.goto('/#/parent/speech');
  await expect(page.getByTestId('gate')).toBeVisible();
});
