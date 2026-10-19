import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun } from './family';
import { ownProgress, seedLearned } from './progress';
import { fakeSpeech, spoken } from './speech';
import { localDay } from '../src/lib/domain/time';

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

const FRUIT = { 'fruit.apple': 1, 'fruit.banana': 1, 'fruit.pear': 2, 'fruit.lemon': 2, 'fruit.mango': 1 };

const english = (page: Page) => spoken(page).then((s) => s.filter((r) => r.lang === 'en-GB').map((r) => r.text));
const texts = (page: Page) => spoken(page).then((s) => s.map((r) => r.text));

/** A child with five learned fruit, on the game shelf. */
async function toShelf(page: Page, learned: Record<string, number> = FRUIT): Promise<string> {
  const ola = await firstRun(page);
  await seedLearned(page, ola, learned);
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('games').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`));
  return ola;
}

test('with fewer than four learned words the shelf is locked', async ({ page }) => {
  const ola = await firstRun(page);
  await page.getByTestId('games').click();
  const tiles = page.getByTestId('shelf').locator('[data-game]');
  await expect(tiles).toHaveCount(3);
  for (const tile of await tiles.all()) {
    await expect(tile).toHaveAttribute('data-open', 'false');
    await expect(tile.getByTestId('locked')).toBeVisible();
  }
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Najpierw poznajmy więcej słówek!');
  await page.locator('[data-game="memory"]').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`));
  // A game opened by its address goes back to the shelf.
  await page.goto(`/#/child/${ola}/play/memory`);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`));
  await expect(page.getByTestId('shelf')).toBeVisible();
});

test('Cyferki opens only with four learned words outside the numbers', async ({ page }) => {
  await toShelf(page, { 'fruit.apple': 1, 'fruit.banana': 1, 'fruit.pear': 1, 'numbers.one': 1 });
  await expect(page.locator('[data-game="listen"]')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('[data-game="memory"]')).toHaveAttribute('data-open', 'true');
  await expect(page.locator('[data-game="digits"]')).toHaveAttribute('data-open', 'false');
});

test('Cyferki: four digits, four words; a right match removes the pair, a wrong one never does', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await expect(page.locator('[data-game="digits"]')).toHaveAttribute('data-open', 'true');
  await page.locator('[data-game="digits"]').click();
  await expect(page.getByTestId('game')).toHaveAttribute('data-game', 'digits');
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Dotknij cyferki!');

  const pictures = page.getByTestId('digit-pictures').locator('[data-word-id]');
  await expect(pictures).toHaveCount(4);
  const byWord = new Map<string, string>();
  for (const p of await pictures.all()) byWord.set((await p.getAttribute('aria-label')) as string, (await p.getAttribute('data-word-id')) as string);

  const mapped: string[] = [];
  for (const digit of [1, 2, 3, 4]) {
    const tile = page.locator(`[data-digit="${digit}"]`);
    const before = (await english(page)).length;
    await tile.click();
    await expect(tile).toHaveAttribute('aria-pressed', 'true');
    // The digit says its word.
    await expect.poll(() => english(page).then((e) => e.length)).toBeGreaterThan(before);
    const word = (await english(page)).at(before) as string;
    expect(byWord.has(word)).toBe(true);
    const id = byWord.get(word) as string;
    mapped.push(id);

    if (digit === 1) {
      // Two wrong pictures: nothing leaves the board, and the right one glows.
      const wrong = page.getByTestId('digit-pictures').locator(`[data-word-id]:not([data-word-id="${id}"])`).first();
      await wrong.click();
      await expect(wrong).toHaveClass(/is-wiggling/);
      await expect.poll(() => texts(page).then((t) => t.at(-2))).toBe('Spróbuj jeszcze raz.');
      await wrong.click();
      await expect(page.locator(`[data-word-id="${id}"]`)).toHaveAttribute('data-glow', '');
      await expect(page.locator('[data-matched]')).toHaveCount(0);
      await expect(tile).toHaveAttribute('aria-pressed', 'true');
    }

    await page.locator(`[data-word-id="${id}"]`).click();
    // The last match ends the game, so the board is checked for the first three.
    if (digit === 4) break;
    await expect(page.locator(`[data-word-id="${id}"]`)).toHaveAttribute('data-matched', '');
    await expect(tile).toHaveAttribute('data-matched', '');
    await expect(page.locator(`[data-word-id="${id}"]`)).toBeHidden();
    await expect(tile).toBeHidden();
    await expect(page.getByTestId('digit-pictures').locator('[data-matched]')).toHaveCount(digit);
  }
  expect(new Set(mapped).size).toBe(4);

  // Four matches, plus a bonus for the three first tries in a row.
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '5');
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`), { timeout: 15_000 });
  const progress = await ownProgress(page, ola);
  expect(progress?.stars).toBe(5);
  const today = localDay(new Date());
  expect(progress?.attempts[mapped[0] as string]?.[today]).toEqual({ c: 1, w: 2, first: 0 });
  for (const id of mapped.slice(1)) expect(progress?.attempts[id]?.[today]).toEqual({ c: 1, w: 0, first: 1 });
});

test('Posłuchaj i dotknij in free play: five picks over learned words', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await page.locator('[data-game="listen"]').click();
  const targets: string[] = [];
  for (let i = 0; i < 5; i++) {
    const pick = page.getByTestId('pick');
    await expect(pick).toBeVisible();
    const target = (await pick.getAttribute('data-target')) as string;
    targets.push(target);
    expect(Object.keys(FRUIT)).toContain(target);
    for (const c of await pick.locator('[data-word-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word-id')))) {
      expect(Object.keys(FRUIT)).toContain(c);
    }
    await pick.locator(`[data-word-id="${target}"]`).click();
    if (i < 4) await expect(page.locator(`[data-testid="dots"] li:nth-child(${i + 2})`)).toHaveClass(/is-now/, { timeout: 10_000 });
  }
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '6');
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`), { timeout: 15_000 });
  const progress = await ownProgress(page, ola);
  const today = localDay(new Date());
  expect(Object.values(progress?.attempts ?? {}).reduce((n, d) => n + (d[today]?.c ?? 0), 0)).toBe(5);
});

test('Memory: each flip speaks, a pair stays open, two different cards turn back', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await page.locator('[data-game="memory"]').click();
  const cards = page.getByTestId('memory').locator('[data-card]');
  await expect(cards).toHaveCount(6);
  const words = await cards.evaluateAll((els) => els.map((e) => e.getAttribute('data-word') as string));
  const a = 0;
  const b = words.findIndex((w) => w !== words[0]);

  await cards.nth(a).click();
  await expect(cards.nth(a)).toHaveAttribute('data-open', 'true');
  await expect.poll(() => english(page).then((e) => e.length)).toBeGreaterThan(0);
  await cards.nth(b).click();
  await expect(cards.nth(b)).toHaveAttribute('data-open', 'true');
  // Two different cards turn back by themselves.
  await expect(cards.nth(a)).toHaveAttribute('data-open', 'false', { timeout: 5000 });
  await expect(cards.nth(b)).toHaveAttribute('data-open', 'false');

  for (const word of new Set(words)) {
    const [x, y] = words.flatMap((w, i) => (w === word ? [i] : []));
    await cards.nth(x as number).click();
    await cards.nth(y as number).click();
    await expect(cards.nth(x as number)).toHaveClass(/is-matched/);
    await expect(cards.nth(y as number)).toHaveAttribute('data-open', 'true');
  }
  await expect.poll(() => texts(page)).toEqual(expect.arrayContaining(['Jest para!']));
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '3');
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`), { timeout: 15_000 });
  const progress = await ownProgress(page, ola);
  expect(progress?.stars).toBe(3);
  expect(progress?.attempts).toEqual({});
});

test('the game shelf and the games exit only on a long press', async ({ page }) => {
  const ola = await toShelf(page);
  await page.locator('[data-game="memory"]').click();
  await page.getByTestId('home').click();
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Przytrzymaj dłużej, żeby wyjść.');
  await expect(page.getByTestId('memory')).toBeVisible();
  for (const where of [`#/child/${ola}/play$`, `#/child/${ola}$`]) {
    await page.getByTestId('home').hover();
    await page.mouse.down();
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await expect(page).toHaveURL(new RegExp(where));
  }
});
