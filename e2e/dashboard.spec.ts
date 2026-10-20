import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { connectedDevice, focus, joinFromSetup, ownDevice } from './drive';
import { FakeDrive, installFakeGoogle, openDevice } from './fake-google';
import { firstRun } from './family';
import { gotoParent } from './gate';
import { playLesson } from './lesson';
import { ownProgress, readFamily, seedLearned, seedMinutes, seedStars } from './progress';
import { fakeSpeech } from './speech';
import { canonicalJson } from '../src/lib/domain/lww';
import { addDays, localDay } from '../src/lib/domain/time';

/**
 * PLAN.md Phase 10 tasks 2–3: minutes per device per day, summed across devices, and the
 * parent's progress dashboard (STATE.md decisions 91, 95–96).
 */

const today = async (page: Page) => localDay(new Date(await page.evaluate(() => Date.now())));

/** The ticker has seen another minute of play on this page. */
async function playAMinute(page: Page, child: string): Promise<void> {
  const before = (await ownProgress(page, child))?.minutes[await today(page)] ?? 0;
  await page.clock.fastForward(61_000);
  await expect.poll(async () => (await ownProgress(page, child))?.minutes[await today(page)] ?? 0, { timeout: 10_000 }).toBe(before + 1);
}

async function openDashboard(page: Page, child: string): Promise<void> {
  await page.goto(`/#/child/${child}`);
  await expect(page.getByTestId('map')).toBeVisible();
  await gotoParent(page, `/parent/child/${child}`);
  await expect(page.getByTestId('dashboard')).toBeVisible();
}

test('the dashboard: learned per topic, words to practise, the calendar, stickers, stories; limits are saved', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.install();
  await fakeSpeech(page);
  const child = await firstRun(page);
  await seedLearned(page, child, { 'fruit.apple': 2, 'fruit.banana': 1, 'fruit.pear': 1, 'fruit.lemon': 1, 'colours.red': 3 });
  await seedStars(page, child, 20, { c1: { at: new Date().toISOString(), stickers: ['fruit.apple', 'colours.red'] } });
  const day = await today(page);
  await seedMinutes(page, child, 4, day);
  await page.goto(`/#/child/${child}`);

  // A lesson in which the first pick is missed twice.
  await page.getByTestId('sail').click();
  let missed = '';
  await playLesson(page, async (pick, n) => {
    if (n > 0) return;
    missed = pick.target;
    const wrong = pick.choices.find((c) => c !== pick.target) as string;
    await page.getByTestId('pick').locator(`[data-word-id="${wrong}"]`).click();
    await page.waitForTimeout(300);
    await page.getByTestId('pick').locator(`[data-word-id="${wrong}"]`).click();
  });
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 15_000 });
  await playAMinute(page, child);
  await openDashboard(page, child);

  const fruit = page.locator('[data-topic-progress="fruit"]');
  await expect(fruit).toHaveAttribute('data-learned', '4');
  await expect(page.locator('[data-topic-progress="colours"]')).toHaveAttribute('data-learned', '1');
  // A topic not enabled and never met is not listed.
  await expect(page.locator('[data-topic-progress="body"]')).toHaveCount(0);
  const practice = page.getByTestId('needs-practice').locator('[data-word]');
  await expect(practice.first()).toHaveAttribute('data-word', missed);
  await expect(practice.first()).toHaveAttribute('data-misses', '1');
  // Today: 4 minutes on the other device and 1 here.
  await expect(page.getByTestId('minutes-today')).toHaveText('5 min');
  await expect(page.locator(`[data-day="${day}"]`)).toHaveAttribute('data-minutes', '5');
  await expect(page.locator(`[data-day="${day}"]`)).toHaveClass(/is-today/);
  await expect(page.locator(`[data-day="${addDays(day, -1)}"]`)).toHaveAttribute('data-minutes', '0');
  await expect(page.getByTestId('calendar').locator('[role="cell"]')).toHaveCount(28);
  await expect(page.getByTestId('stickers-collected')).toHaveAttribute('data-owned', '2');
  await expect(page.locator('[data-story="polly-picnic"]')).toHaveAttribute('data-times', '0');

  // Limits: no daily limit, a 20-minute session; written as the child's limits register.
  await page.getByTestId('limit-daily').selectOption({ label: 'brak limitu' });
  await expect.poll(async () => (await readFamily(page)).limits[child]?.v.dailyMinutes).toBeNull();
  await page.getByTestId('limit-session').selectOption({ label: '20 min' });
  await expect.poll(async () => (await readFamily(page)).limits[child]?.v).toEqual({ dailyMinutes: null, sessionMinutes: 20 });
  await page.reload();
  await gotoParent(page, `/parent/child/${child}`);
  await expect(page.getByTestId('limit-daily')).toHaveValue('');
  await expect(page.getByTestId('limit-session')).toHaveValue('20');
});

test("two devices' minutes add up after sync (fake Drive)", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const drive = new FakeDrive();
  await installFakeGoogle(page.context(), drive);
  await page.clock.install();
  await fakeSpeech(page);
  const child = await connectedDevice(page);
  const tablet = await openDevice(browser, drive, baseURL as string);
  await tablet.clock.install();
  expect(await joinFromSetup(tablet)).toBe(child);

  // Two minutes on the phone, one on the tablet, the same day, each on its own clock.
  await playAMinute(page, child);
  await playAMinute(page, child);
  await playAMinute(tablet, child);
  const [phoneId, tabletId] = [await ownDevice(page), await ownDevice(tablet)];
  const day = await today(page);

  await focus(page);
  await focus(tablet);
  await focus(page);
  await expect
    .poll(async () => canonicalJson(await readFamily(page)) === canonicalJson(await readFamily(tablet)), { timeout: 20_000 })
    .toBe(true);
  const file = await readFamily(page);
  expect(file.progress[child]?.[phoneId]?.minutes[day]).toBe(2);
  expect(file.progress[child]?.[tabletId]?.minutes[day]).toBe(1);
  expect(canonicalJson(drive.only())).toBe(canonicalJson(file));

  for (const device of [page, tablet]) {
    await openDashboard(device, child);
    await expect(device.getByTestId('minutes-today')).toHaveText('3 min');
    await expect(device.locator(`[data-day="${day}"]`)).toHaveAttribute('data-minutes', '3');
  }
  await tablet.context().close();
});
