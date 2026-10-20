import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun } from './family';
import { ownProgress, seedLearned, seedStars } from './progress';
import { fakeSpeech, spoken } from './speech';
import storiesJson from '../content/stories.json' with { type: 'json' };
import type { Story } from '../src/lib/types';

const picnic = (storiesJson as Story[]).find((s) => s.id === 'polly-picnic') as Story;
/** Four of the picnic's five pictured words: 80 %, so it opens (STATE.md decision 84). */
const FOUR_FRUIT = { 'fruit.apple': 1, 'fruit.banana': 1, 'fruit.orange': 2, 'fruit.pear': 2 };

const texts = (page: Page) => spoken(page).then((s) => s.map((r) => r.text));
const english = (page: Page) => spoken(page).then((s) => s.filter((r) => r.lang === 'en-GB').map((r) => r.text));

async function holdHome(page: Page) {
  await page.getByTestId('home').hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
}

async function toStoryShelf(page: Page, learned: Record<string, number> = {}): Promise<string> {
  const ola = await firstRun(page);
  if (Object.keys(learned).length > 0) await seedLearned(page, ola, learned);
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('stories').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/stories$`));
  await expect(page.getByTestId('story-shelf')).toBeVisible();
  return ola;
}

test('with nothing learned every story is locked, and its address leads back to the shelf', async ({ page }) => {
  await fakeSpeech(page);
  const ola = await toStoryShelf(page);
  const tiles = page.getByTestId('story-shelf').locator('[data-story]');
  await expect(tiles).toHaveCount((storiesJson as Story[]).length);
  for (const tile of await tiles.all()) {
    await expect(tile).toHaveAttribute('data-open', 'false');
    await expect(tile.getByTestId('locked')).toBeVisible();
  }
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Tę bajkę otworzymy, gdy poznasz więcej słówek!');
  await page.locator('[data-story="polly-picnic"]').click();
  await expect(page.locator('[data-story="polly-picnic"]')).toHaveClass(/is-nudged/);
  await page.goto(`/#/child/${ola}/stories/polly-picnic`);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/stories$`));
  await page.goto(`/#/child/${ola}/stories/no-such-story`);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/stories$`));
});

test('a story opens at 80 % of its words learned, plays page by page to the end, and is recorded', async ({ page }) => {
  test.setTimeout(120_000);
  await fakeSpeech(page);
  const ola = await firstRun(page);
  // Three of five: still locked.
  await seedLearned(page, ola, { 'fruit.apple': 1, 'fruit.banana': 1, 'fruit.orange': 1 });
  await page.goto(`/#/child/${ola}`);
  await expect(page.getByTestId('stories')).toHaveAttribute('data-new', 'false');
  await page.getByTestId('stories').click();
  await expect(page.locator('[data-story="polly-picnic"]')).toHaveAttribute('data-open', 'false');

  await seedLearned(page, ola, FOUR_FRUIT);
  await page.goto(`/#/child/${ola}`);
  // A story nobody has heard yet: the map's 📖 glows.
  await expect(page.getByTestId('stories')).toHaveAttribute('data-new', 'true');
  await page.getByTestId('stories').click();
  const tile = page.locator('[data-story="polly-picnic"]');
  await expect(tile).toHaveAttribute('data-open', 'true');
  await expect(tile).toHaveAttribute('data-new', 'true');
  await expect(page.locator('[data-story="polly-flags"]')).toHaveAttribute('data-open', 'false');
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Którą bajkę posłuchamy? Dotknij obrazka!');

  const before = (await texts(page)).length;
  await tile.click();
  const story = page.getByTestId('story');
  await expect(story).toHaveAttribute('data-story', 'polly-picnic');
  await expect.poll(() => texts(page).then((t) => t.slice(before))).toContain('Posłuchaj bajki o owocach!');

  for (let p = 1; p < picnic.pages.length; p++) await expect(story).toHaveAttribute('data-page', String(p), { timeout: 15_000 });
  await expect(page.getByTestId('story-end')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Koniec bajki! Brawo!');
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/stories$`), { timeout: 15_000 });

  // Every sentence was spoken in English, in order.
  const heard = (await english(page)).filter((t) => picnic.pages.some((p) => p.text === t));
  expect(heard).toEqual(picnic.pages.map((p) => p.text));
  const progress = await ownProgress(page, ola);
  expect(progress?.storiesHeard).toEqual({ 'polly-picnic': 1 });
  expect(progress?.stars).toBe(0);
  await expect(page.locator('[data-story="polly-picnic"]')).toHaveAttribute('data-new', 'false');
  await holdHome(page);
  await expect(page.getByTestId('stories')).toHaveAttribute('data-new', 'false');
});

test('the spoken word is marked and its picture bounces; 🔊 and a tap on a picture read the page again; the long press leaves', async ({ page }) => {
  test.setTimeout(60_000);
  // Slow speech, so the tap lands in the middle of the sentence.
  await fakeSpeech(page, { msPerChar: 150 });
  const ola = await toStoryShelf(page, FOUR_FRUIT);
  await page.locator('[data-story="polly-picnic"]').click();
  const story = page.getByTestId('story');
  await expect(story).toHaveAttribute('data-page', '1', { timeout: 30_000 });
  const sentence = 'Look! A red apple.';
  await expect.poll(() => english(page).then((e) => e.at(-1))).toBe(sentence);
  // The word being spoken is marked; while it is "apple", the apple bounces.
  const marked = page.getByTestId('sentence').locator('[data-spoken]');
  await expect(marked).toHaveText('red', { timeout: 10_000 });
  const apple = page.locator('[data-scene-item][data-word-id="fruit.apple"]');
  await expect(apple).not.toHaveAttribute('data-bouncing');
  await expect(marked).toHaveText('apple', { timeout: 10_000 });
  await expect(apple).toHaveAttribute('data-bouncing', '');
  await expect(page.locator('[data-scene-item][data-bouncing]')).toHaveCount(1);
  // Read again from the start after the tap below.
  await expect(marked).toHaveCount(0, { timeout: 10_000 });
  await expect.poll(() => english(page).then((e) => e.filter((t) => t === sentence).length)).toBe(1);
  await page.waitForTimeout(300);
  await page.getByTestId('repeat').click();
  await expect.poll(() => english(page).then((e) => e.filter((t) => t === sentence).length), { timeout: 15_000 }).toBe(2);
  await expect(marked).toHaveText('Look', { timeout: 10_000 });
  await apple.click();
  await expect.poll(() => english(page).then((e) => e.at(-1))).toBe('apple');
  // The tap cut the sentence; after the word, the page reads it again.
  await expect.poll(() => english(page).then((e) => e.filter((t) => t === sentence).length), { timeout: 15_000 }).toBe(3);
  await expect(story).toHaveAttribute('data-page', '1');

  await page.getByTestId('home').click();
  await expect(story).toBeVisible();
  await holdHome(page);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/stories$`));
  // Left before the end: not heard.
  expect((await ownProgress(page, ola))?.storiesHeard ?? {}).toEqual({});
});

test('after a chest, Polly announces a story nobody has heard yet', async ({ page }) => {
  test.setTimeout(60_000);
  await fakeSpeech(page);
  const ola = await firstRun(page);
  await seedLearned(page, ola, FOUR_FRUIT);
  await seedStars(page, ola, 15);
  await page.goto(`/#/child/${ola}`);
  await page.reload();
  await page.getByTestId('chest').click();
  for (let i = 0; i < 3; i++) await page.getByTestId('chest-open').click();
  await expect(page.getByTestId('next')).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Polly ma dla ciebie nową bajkę!');
});
