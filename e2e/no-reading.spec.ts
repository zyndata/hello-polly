import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { fillChild, firstRun, openPanel } from './family';
import { playLesson } from './lesson';
import { seedLearned, seedMinutes, seedStars } from './progress';
import { fakeSpeech } from './speech';

/**
 * PLAN.md Phase 4: "Every child screen is operable with no reading." Text a child might have
 * to read is any visible text node on a child screen, except the names under the picker's
 * avatars, which are for the parent (`data-for-parent`). Screen-reader-only text does not
 * count. And every control is a picture.
 */
async function visibleText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent) continue;
      if (parent.closest('.sr-only, [data-for-parent]')) continue;
      if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      found.push(text);
    }
    return found;
  });
}

/** Buttons that show no picture (no image, no drawn SVG). */
async function buttonsWithoutPicture(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('main button')].filter((b) => !b.querySelector('img, svg')).map((b) => b.outerHTML.slice(0, 80))
  );
}

async function expectNoReading(page: Page, what: string) {
  expect(await visibleText(page), `${what}: visible text`).toEqual([]);
  expect(await buttonsWithoutPicture(page), `${what}: buttons without a picture`).toEqual([]);
}

test('the child screens need no reading', async ({ page }) => {
  test.setTimeout(90_000);
  await fakeSpeech(page);

  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
  await expectNoReading(page, 'start');

  await firstRun(page);
  await expectNoReading(page, 'map');

  await page.getByTestId('sail').click();
  await expect(page.getByTestId('lesson-word')).toBeVisible();
  await expectNoReading(page, 'lesson');
  let checkedTap = false;
  await page.getByTestId('lesson-word').locator('button').click();
  await expect(page.getByTestId('next')).toBeVisible();
  await expectNoReading(page, 'lesson, after the tap');
  await page.getByTestId('next').click();
  await playLesson(page, async ({ target, choices }) => {
    if (checkedTap) return;
    checkedTap = true;
    await expectNoReading(page, 'a pick');
    // Two misses: the wiggle and then the glow, still nothing to read.
    const wrong = choices.find((c) => c !== target) as string;
    await page.locator(`[data-word-id="${wrong}"]`).click();
    await page.locator(`[data-word-id="${wrong}"]`).click();
    await expect(page.locator(`[data-word-id="${target}"]`)).toHaveAttribute('data-glow', '');
    await expectNoReading(page, 'a pick, glowing');
  });
  await expect(page.getByTestId('lesson-finished')).toBeVisible();
  await expectNoReading(page, 'lesson finished');
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 15_000 });
  await expectNoReading(page, 'map with a flag');

  await openPanel(page);
  await page.getByRole('button', { name: 'Dodaj dziecko' }).click();
  await fillChild(page, 'Staś', 'hippopotamus');
  await page.getByRole('button', { name: 'Dodaj dziecko' }).click();
  await page.getByTestId('to-child').click();
  await expect(page.getByTestId('picker')).toBeVisible();
  // Only the names under the avatars, which are marked as the parent's.
  await expectNoReading(page, 'picker');
  await page.getByRole('button', { name: 'Staś' }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expectNoReading(page, 'map with home');
});

test('the game shelf and the games need no reading', async ({ page }) => {
  test.setTimeout(60_000);
  await fakeSpeech(page);
  const ola = await firstRun(page);
  await page.getByTestId('games').click();
  await expect(page.getByTestId('shelf')).toBeVisible();
  await expectNoReading(page, 'shelf, locked');

  await seedLearned(page, ola, { 'fruit.apple': 1, 'fruit.banana': 1, 'fruit.pear': 3, 'fruit.lemon': 5 });
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('games').click();
  await expect(page.locator('[data-game="digits"]')).toHaveAttribute('data-open', 'true');
  await expectNoReading(page, 'shelf, open');

  for (const game of ['listen', 'digits', 'memory']) {
    await page.goto(`/#/child/${ola}/play/${game}`);
    await expect(page.getByTestId('game')).toHaveAttribute('data-game', game);
    await expectNoReading(page, game);
  }
  // A face-up card and the finish screen, through a whole Memory board.
  const cards = page.getByTestId('memory').locator('[data-card]');
  const words = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-word') as string));
  await cards.nth(0).click();
  await expectNoReading(page, 'memory, a card up');
  for (const word of new Set(words)) {
    for (const [i, w] of words.entries()) if (w === word) await cards.nth(i).click();
  }
  await expect(page.getByTestId('game-finished')).toBeVisible();
  await expectNoReading(page, 'game finished');
});

test('the chest and the album need no reading', async ({ page }) => {
  test.setTimeout(60_000);
  await fakeSpeech(page);
  const ola = await firstRun(page);
  await page.getByTestId('album').click();
  await expect(page.getByTestId('album-page')).toBeVisible();
  await expectNoReading(page, 'album, empty');

  await seedLearned(page, ola, { 'fruit.apple': 1, 'fruit.pear': 1 });
  await seedStars(page, ola, 15);
  await page.goto(`/#/child/${ola}`);
  await page.reload();
  await expect(page.getByTestId('chest')).toBeVisible();
  await expectNoReading(page, 'map with a chest');
  await page.getByTestId('chest').click();
  await expect(page.getByTestId('chest-scene')).toBeVisible();
  await expectNoReading(page, 'chest, shut');
  for (let i = 0; i < 3; i++) await page.getByTestId('chest-open').click();
  await expect(page.getByTestId('next')).toBeVisible({ timeout: 20_000 });
  await expectNoReading(page, 'chest, open');
  await page.getByTestId('next').click();
  await expect(page.locator('[data-owned="true"]').first()).toBeVisible();
  await expectNoReading(page, 'album, with new stickers');
});

test('the stories and games E4–E9 need no reading (the sentence is the parent’s)', async ({ page }) => {
  test.setTimeout(90_000);
  await fakeSpeech(page);
  const ola = await firstRun(page);
  await page.getByTestId('stories').click();
  await expect(page.getByTestId('story-shelf')).toBeVisible();
  await expectNoReading(page, 'story shelf, locked');

  const learned = [
    'fruit.apple', 'fruit.banana', 'fruit.orange', 'fruit.pear', 'fruit.grapes',
    'pets-farm.cat', 'pets-farm.dog', 'pets-farm.cow',
    'colours.red', 'colours.blue', 'colours.yellow',
    'body.eyes', 'body.nose', 'body.hand', 'body.foot'
  ];
  await seedLearned(page, ola, Object.fromEntries(learned.map((id) => [id, 2])));
  await page.goto(`/#/child/${ola}`);
  await page.reload();
  await expect(page.getByTestId('stories')).toHaveAttribute('data-new', 'true');
  await expectNoReading(page, 'map with a new story');
  await page.getByTestId('stories').click();
  await expect(page.locator('[data-story="polly-picnic"]')).toHaveAttribute('data-open', 'true');
  await expectNoReading(page, 'story shelf, open');
  await page.locator('[data-story="polly-picnic"]').click();
  await expect(page.getByTestId('story')).toHaveAttribute('data-page', '1', { timeout: 15_000 });
  await expectNoReading(page, 'a story page');
  // The sentence is shown, for the parent reading along.
  await expect(page.getByTestId('sentence')).toHaveAttribute('data-for-parent', '');

  for (const game of ['bubbles', 'feed', 'spy', 'simon', 'paint']) {
    await page.goto(`/#/child/${ola}/play/${game}`);
    await expect(page.getByTestId('game')).toHaveAttribute('data-game', game);
    await expectNoReading(page, game);
  }
  // A pot dipped and the picture painted.
  const colour = (await page.getByTestId('paint').getAttribute('data-colour')) as string;
  await page.getByTestId('pots').locator(`[data-word-id="${colour}"]`).click();
  await page.getByTestId('paint-picture').click();
  await expect(page.getByTestId('paint-picture')).toHaveAttribute('data-painted', colour);
  await expectNoReading(page, 'paint, painted');

  // Kosze, once the parent switched it on.
  await page.goto(`/#/child/${ola}`);
  await openPanel(page);
  await page.goto(`/#/parent/child/${ola}`);
  await page.getByTestId('sort-game').check();
  await expect(page.getByTestId('sort-game')).toBeChecked();
  await page.goto(`/#/child/${ola}/play/sort`);
  await expect(page.getByTestId('game')).toHaveAttribute('data-game', 'sort');
  await expectNoReading(page, 'sort');
});

test('the lock (Polly asleep) needs no reading', async ({ page }) => {
  await fakeSpeech(page);
  const ola = await firstRun(page);
  // The day's 15 minutes were played on another device.
  await seedMinutes(page, ola, 15);
  await page.goto(`/#/child/${ola}/play`);
  await expect(page.getByTestId('sleep')).toBeVisible();
  await expectNoReading(page, 'the lock');
});
