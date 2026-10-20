import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun } from './family';
import { ownProgress, seedLearned, seedStars } from './progress';
import { fakeSpeech, spoken } from './speech';

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

const texts = (page: Page) => spoken(page).then((s) => s.map((r) => r.text));
const english = (page: Page) => spoken(page).then((s) => s.filter((r) => r.lang === 'en-GB').map((r) => r.text));

async function holdHome(page: Page): Promise<void> {
  await page.getByTestId('home').hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
}

const animationOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { name: s.animationName, transform: s.transform, opacity: s.opacity };
  });

test('a chest waits on the map, survives a reload, opens in three taps and fills the album', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await firstRun(page);
  // Another device: 34 stars and one chest already opened there → 2 earned, 1 waiting, 4 on the meter.
  await seedLearned(page, ola, { 'fruit.apple': 1, 'fruit.pear': 1 });
  await seedStars(page, ola, 34, { 'other-chest': { at: new Date().toISOString(), stickers: ['colours.red'] } });
  await page.reload();
  await expect(page.getByTestId('chest')).toHaveAttribute('data-unopened', '1');
  await expect(page.getByTestId('meter')).toHaveAttribute('data-value', '4');
  await expect(page.getByTestId('meter')).toHaveAttribute('data-max', '15');

  await page.reload();
  await expect(page.getByTestId('chest')).toHaveAttribute('data-unopened', '1');

  await page.getByTestId('chest').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/chest$`));
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Skrzynia skarbów! Dotknij jej!');
  const scene = page.getByTestId('chest-scene');
  const target = page.getByTestId('chest-open');
  await target.click();
  await expect(scene).toHaveAttribute('data-stage', '1');
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Jeszcze raz!');
  await target.click();
  await expect(scene).toHaveAttribute('data-stage', '2');
  await target.click();
  await expect(scene).toHaveAttribute('data-stage', '3');

  const shown = page.getByTestId('chest-stickers').locator('[data-sticker-id]');
  await expect(shown.first()).toBeVisible();
  const ids = await shown.evaluateAll((els) => els.map((e) => e.getAttribute('data-sticker-id') as string));
  expect(ids.length).toBeGreaterThanOrEqual(1);
  expect(ids.length).toBeLessThanOrEqual(3);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).not.toContain('colours.red');

  // „Hurra! Naklejki!”, then every sticker's word in English.
  await expect(page.getByTestId('next')).toBeVisible({ timeout: 20_000 });
  const said = await texts(page);
  expect(said).toContain('Hurra! Naklejki!');
  const words = await shown.evaluateAll((els) => els.map((e) => e.querySelector('[aria-label]')?.getAttribute('aria-label') as string));
  expect((await english(page)).slice(-words.length)).toEqual(words);

  // Recorded on this device, under one event id, with exactly the stickers shown.
  const mine = await ownProgress(page, ola);
  const openings = Object.values(mine?.chestsOpened ?? {});
  expect(openings).toHaveLength(1);
  expect(openings[0]?.stickers).toEqual(ids);

  // ▶ → the album, on the first page (in map order) with a new sticker; the new ones owned and ringed.
  await page.getByTestId('next').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/album\\?new=`));
  const albumPage = page.getByTestId('album-page');
  const firstSet = ['colours', 'numbers', 'fruit', 'pets-farm'].find((set) => ids.some((i) => i.startsWith(`${set}.`))) as string;
  await expect(albumPage).toHaveAttribute('data-set', firstSet);
  for (const id of ids.filter((i) => i.startsWith(`${firstSet}.`))) {
    const slot = albumPage.locator(`[data-sticker-id="${id}"]`);
    await expect(slot).toHaveAttribute('data-owned', 'true');
    await expect(slot.locator('.is-new')).toHaveCount(1);
  }
  // A tap on an owned sticker says its word.
  const onPage = ids.find((i) => i.startsWith(`${firstSet}.`)) as string;
  const sticker = albumPage.locator(`[data-sticker-id="${onPage}"] button`);
  const before = (await english(page)).length;
  await sticker.click();
  await expect.poll(() => english(page).then((e) => e.slice(before))).toEqual([await sticker.getAttribute('aria-label')]);

  // Back on the map, no chest waits: the meter still has its 4.
  await holdHome(page);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  await expect(page.getByTestId('chest')).toHaveCount(0);
  await expect(page.getByTestId('meter')).toHaveAttribute('data-value', '4');
  // The address of the chest leads back to the map when none waits.
  await page.goto(`/#/child/${ola}/chest`);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
});

test('leaving before the lid opens keeps the chest waiting', async ({ page }) => {
  const ola = await firstRun(page);
  await seedStars(page, ola, 15);
  await page.reload();
  await page.getByTestId('chest').click();
  await page.getByTestId('chest-open').click();
  await page.getByTestId('chest-open').click();
  await holdHome(page);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  await expect(page.getByTestId('chest')).toHaveAttribute('data-unopened', '1');
  expect(Object.keys((await ownProgress(page, ola))?.chestsOpened ?? {})).toHaveLength(0);
});

for (const reduce of [false, true]) {
  test(`the chest animation ${reduce ? 'respects' : 'plays without'} prefers-reduced-motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
    const ola = await firstRun(page);
    await seedStars(page, ola, 15);
    await page.reload();
    expect((await animationOf(page, '.map-chest-bob')).name).toBe(reduce ? 'none' : 'bob');
    await page.getByTestId('chest').click();
    const target = page.getByTestId('chest-open');

    await target.click();
    expect((await animationOf(page, '.chest-body.is-rattling')).name).toBe(reduce ? 'none' : 'rattle');
    await target.click();
    const lock = await animationOf(page, '.chest-lock.is-popped');
    expect(lock.name).toBe(reduce ? 'none' : 'lock-pop');
    await target.click();
    await expect(page.getByTestId('chest-stickers')).toBeVisible();
    const lid = await animationOf(page, '.chest-lid.is-open');
    const glow = await animationOf(page, '.chest-glow.is-on');
    const flying = await animationOf(page, '.chest-sticker');
    expect(lid.name).toBe(reduce ? 'none' : 'lid-open');
    expect(glow.name).toBe(reduce ? 'none' : 'chest-glow');
    expect(flying.name).toBe(reduce ? 'none' : 'sticker-fly');
    if (reduce) {
      // The meaning stays: the lid is open, the lock gone, the glow on, the stickers there.
      expect(lid.transform).not.toBe('none');
      expect(Number((await animationOf(page, '.chest-lock')).opacity)).toBe(0);
      expect(Number(glow.opacity)).toBe(1);
      expect(Number(flying.opacity)).toBe(1);
    }
  });
}

test('the album is open from the first day: empty slots, pages by topic', async ({ page }) => {
  const ola = await firstRun(page);
  await page.getByTestId('album').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/album$`));
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Zbieraj gwiazdki, a znajdziesz skrzynię z naklejkami!');
  const tabs = page.getByTestId('album-tabs').locator('[data-set]');
  // The four first topics and the body parts (STATE.md decision 83).
  await expect(tabs).toHaveCount(5);
  const albumPage = page.getByTestId('album-page');
  await expect(albumPage).toHaveAttribute('data-set', 'colours');
  await expect(albumPage.locator('[data-sticker-id]')).toHaveCount(11);
  await expect(albumPage.locator('[data-owned="true"]')).toHaveCount(0);

  await albumPage.locator('[data-sticker-id="colours.blue"] button').click();
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Tej naklejki jeszcze nie masz.');

  await page.locator('[data-set="fruit"]').first().click();
  await expect(albumPage).toHaveAttribute('data-set', 'fruit');
  await expect(albumPage.locator('[data-sticker-id]')).toHaveCount(12);
  await expect(page.locator('[data-set="fruit"][aria-pressed="true"]')).toHaveCount(1);
});
