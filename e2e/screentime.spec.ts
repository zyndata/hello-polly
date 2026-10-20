import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun } from './family';
import { passGate } from './gate';
import { ownProgress, seedLearned, seedLimits, seedMinutes, sessionClock } from './progress';
import { fakeSpeech, spoken } from './speech';
import { localDay } from '../src/lib/domain/time';
import type { ChildLimits } from '../src/lib/types';

/**
 * PLAN.md Phase 10: the screen-time limits (STATE.md decisions 91–95). The page's clock is
 * Playwright's (`page.clock`): it runs as usual, and `fastForward` jumps it, firing the
 * ticker once with the whole jump, as a real minute of play would end.
 */

const FRUIT = { 'fruit.apple': 1, 'fruit.banana': 1, 'fruit.pear': 2, 'fruit.lemon': 2, 'fruit.mango': 1 };
const ONE_MINUTE_SESSION: ChildLimits = { dailyMinutes: null, sessionMinutes: 1 };

test.beforeEach(async ({ page }) => {
  await page.clock.install();
  await fakeSpeech(page);
});

/** A minute and a bit of play passes, and the ticker has seen it: Polly is asleep. */
async function timeRunsOut(page: Page, child: string): Promise<void> {
  await page.clock.fastForward(61_000);
  await expect.poll(async () => (await sessionClock(page, child))?.asleep, { timeout: 10_000 }).toBe(true);
}

const asleep = (page: Page) => page.getByTestId('sleep');

/** The first run, then a limit set and the map opened afresh. */
async function childWithLimits(page: Page, limits = ONE_MINUTE_SESSION, learned?: Record<string, number>): Promise<string> {
  const child = await firstRun(page);
  if (learned) await seedLearned(page, child, learned);
  await seedLimits(page, child, limits);
  await page.goto(`/#/child/${child}`);
  await expect(page.getByTestId('map')).toBeVisible();
  return child;
}

test('with a 1-minute session the lock waits for the look-and-listen step, then the lesson stops', async ({ page }) => {
  test.setTimeout(60_000);
  const child = await childWithLimits(page);
  await page.getByTestId('sail').click();
  const picture = page.getByTestId('lesson-word');
  await expect(picture).toBeVisible();
  const word = (await picture.getAttribute('data-word')) as string;

  await timeRunsOut(page, child);
  // Mid-step: the step stays and still works.
  await page.waitForTimeout(500);
  await expect(page.getByTestId('step')).toHaveAttribute('data-index', '0');
  await expect(asleep(page)).toHaveCount(0);
  await picture.locator('button').click();
  await expect(page.getByTestId('next')).toBeVisible();
  await expect(asleep(page)).toHaveCount(0);

  // The step is done: Polly sleeps, and the lesson goes no further.
  await page.getByTestId('next').click();
  await expect(asleep(page)).toBeVisible();
  await expect(page.getByTestId('step')).toHaveCount(0);
  await expect.poll(async () => (await spoken(page)).map((r) => r.text)).toContain('Koniec na dziś! Polly idzie spać.');
  // The one step done is paid; the island has no flag; the word was met.
  await expect.poll(async () => (await ownProgress(page, child))?.stars).toBe(1);
  const progress = await ownProgress(page, child);
  expect(progress?.lessons).toEqual({});
  expect(Object.keys(progress?.introduced ?? {})).toEqual([word]);
  // The minute played is on this device's record for today.
  expect(progress?.minutes[localDay(new Date(await page.evaluate(() => Date.now())))]).toBe(1);

  // Every child screen is the lock now, even a lesson opened by its address; it never starts.
  for (const path of ['', '/lesson', '/play', '/stories', '/album']) {
    await page.goto(`/#/child/${child}${path}`);
    await expect(asleep(page)).toBeVisible();
    await expect(page.getByTestId('step')).toHaveCount(0);
    await expect(page.getByTestId('map')).toHaveCount(0);
  }
});

test('with a 1-minute session the lock waits for a pick to be solved, misses and all', async ({ page }) => {
  test.setTimeout(90_000);
  const child = await childWithLimits(page, ONE_MINUTE_SESSION, FRUIT);
  await page.getByTestId('sail').click();
  const step = page.getByTestId('step');
  // Through look-and-listen to the first pick.
  for (;;) {
    await expect(step).toBeVisible();
    if ((await step.getAttribute('data-kind')) === 'pick') break;
    const index = await step.getAttribute('data-index');
    await page.getByTestId('lesson-word').locator('button').click();
    await page.getByTestId('next').click();
    await expect(step).not.toHaveAttribute('data-index', index as string);
  }
  const index = (await step.getAttribute('data-index')) as string;
  const pick = page.getByTestId('pick');
  const target = (await pick.getAttribute('data-target')) as string;
  const wrong = (await pick.locator('[data-word-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word-id') as string))).find(
    (w) => w !== target
  ) as string;

  await timeRunsOut(page, child);
  // Two misses: still the same pick, now with the glow; no lock.
  await pick.locator(`[data-word-id="${wrong}"]`).click();
  await page.waitForTimeout(300);
  await pick.locator(`[data-word-id="${wrong}"]`).click();
  await expect(pick.locator(`[data-word-id="${target}"]`)).toHaveClass(/is-glowing/);
  await expect(step).toHaveAttribute('data-index', index);
  await expect(asleep(page)).toHaveCount(0);

  await pick.locator(`[data-word-id="${target}"]`).click();
  await expect(asleep(page)).toBeVisible();
  const today = localDay(new Date(await page.evaluate(() => Date.now())));
  await expect.poll(async () => (await ownProgress(page, child))?.attempts[target]?.[today]).toMatchObject({ c: 1, w: 2, first: 0 });
  expect((await ownProgress(page, child))?.lessons).toEqual({});
});

test('a game plays to its finish screen; the shelf it returns to is the lock', async ({ page }) => {
  test.setTimeout(90_000);
  const child = await childWithLimits(page, ONE_MINUTE_SESSION, FRUIT);
  await page.getByTestId('games').click();
  await page.locator('[data-game="listen"]').click();
  for (let i = 0; i < 5; i++) {
    const pick = page.getByTestId('pick');
    await expect(pick).toBeVisible();
    if (i === 1) await timeRunsOut(page, child);
    await expect(asleep(page)).toHaveCount(0);
    await pick.locator(`[data-word-id="${await pick.getAttribute('data-target')}"]`).click();
    if (i < 4) await expect(page.locator(`[data-testid="dots"] li:nth-child(${i + 2})`)).toHaveClass(/is-now/, { timeout: 10_000 });
  }
  await expect(page.getByTestId('game-finished')).toBeVisible();
  await expect(asleep(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/child/${child}/play$`), { timeout: 15_000 });
  await expect(asleep(page)).toBeVisible();
  await expect(page.getByTestId('shelf')).toHaveCount(0);
  expect((await ownProgress(page, child))?.stars).toBe(6);
});

test('the parent gate lifts the lock; the next day lifts it too', async ({ page }) => {
  test.setTimeout(60_000);
  const child = await childWithLimits(page);
  await timeRunsOut(page, child);
  // The map has no step: it locks at once. Only the gear is there, no way home.
  await expect(asleep(page)).toBeVisible();
  await expect(page.getByTestId('home')).toHaveCount(0);
  await page.getByTestId('sleep-polly').click();
  await expect(asleep(page)).toBeVisible();

  await page.getByTestId('gear').click();
  await expect(page).toHaveURL(/#\/parent$/);
  await passGate(page);
  await expect.poll(async () => (await sessionClock(page, child))?.asleep).toBe(false);
  expect((await sessionClock(page, child))?.sessionMs).toBe(0);
  await page.getByTestId('to-child').click();
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(asleep(page)).toHaveCount(0);

  // A fresh session, with the same 1-minute limit: another minute puts Polly to sleep again.
  await timeRunsOut(page, child);
  await expect(asleep(page)).toBeVisible();

  // Overnight: the next tick of a new day wakes her by itself.
  await page.clock.fastForward('24:00:00');
  await page.clock.fastForward(6_000);
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 10_000 });
  await expect(asleep(page)).toHaveCount(0);
});

test("the daily limit counts another device's minutes; the gate waives it for the rest of the day", async ({ page }) => {
  test.setTimeout(60_000);
  const child = await firstRun(page);
  // 15 minutes today on the tablet, synced: the default daily limit (15) is reached.
  await seedMinutes(page, child, 15);
  await page.goto(`/#/child/${child}/lesson`);
  await expect(asleep(page)).toBeVisible();
  await expect(page.getByTestId('step')).toHaveCount(0);
  // The lesson never started: no word was met.
  expect(Object.keys((await ownProgress(page, child))?.introduced ?? {})).toEqual([]);

  await page.getByTestId('gear').click();
  await passGate(page);
  await page.getByTestId('to-child').click();
  await expect(page.getByTestId('map')).toBeVisible();
  expect((await sessionClock(page, child))?.waived).toBe(true);
  // Played on for a while: the daily limit does not come back today (the session one would at 10).
  await page.clock.fastForward(90_000);
  await page.clock.fastForward(6_000);
  await expect.poll(async () => (await sessionClock(page, child))?.sessionMs ?? 0).toBeGreaterThan(60_000);
  await expect(asleep(page)).toHaveCount(0);
});

test('no limits: hours of play never lock', async ({ page }) => {
  const child = await childWithLimits(page, { dailyMinutes: null, sessionMinutes: null });
  for (let i = 0; i < 3; i++) await page.clock.fastForward(110_000);
  await expect.poll(async () => (await ownProgress(page, child))?.minutes[localDay(new Date(await page.evaluate(() => Date.now())))]).toBeGreaterThanOrEqual(5);
  await expect(asleep(page)).toHaveCount(0);
  await expect(page.getByTestId('map')).toBeVisible();
});
