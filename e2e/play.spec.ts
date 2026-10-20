import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun, openPanel } from './family';
import { ownProgress, seedLearned } from './progress';
import { fakeSpeech, spoken } from './speech';
import { localDay } from '../src/lib/domain/time';

/**
 * Games E4–E9 (PLAN.md Phase 9, STATE.md decision 88): each one is played to the end, shows
 * learned words only, and records what it should.
 */

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

const FRUIT = ['fruit.apple', 'fruit.banana', 'fruit.orange', 'fruit.pear', 'fruit.grapes'];
const PETS = ['pets-farm.cat', 'pets-farm.dog', 'pets-farm.cow'];
const COLOURS = ['colours.red', 'colours.blue', 'colours.yellow'];
const BODY = ['body.eyes', 'body.nose', 'body.hand', 'body.foot'];
const LEARNED = [...FRUIT, ...PETS, ...COLOURS, ...BODY];

const texts = (page: Page) => spoken(page).then((s) => s.map((r) => r.text));
const learned = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [id, 1 + (i % 4)]));

async function toShelf(page: Page, ids: string[] = LEARNED): Promise<string> {
  const ola = await firstRun(page);
  await seedLearned(page, ola, learned(ids));
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('games').click();
  await expect(page.getByTestId('shelf')).toBeVisible();
  return ola;
}

async function play(page: Page, game: string) {
  await page.locator(`[data-game="${game}"]`).click();
  await expect(page.getByTestId('game')).toHaveAttribute('data-game', game);
}

/** The words shown in `within` (its `data-word-id`s), all of them learned. */
async function shownWords(within: Locator, allowed: string[] = LEARNED): Promise<string[]> {
  const ids = await within.locator('[data-word-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word-id') as string));
  for (const id of ids) expect(allowed, `${id} is learned`).toContain(id);
  return ids;
}

async function finished(page: Page, ola: string, stars: number) {
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', String(stars));
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`), { timeout: 15_000 });
  expect((await ownProgress(page, ola))?.stars).toBe(stars);
}

test('the shelf holds E1–E8, each locked until it has its learned words; Kosze is not there', async ({ page }) => {
  await toShelf(page, FRUIT.slice(0, 4));
  const tiles = page.getByTestId('shelf').locator('[data-game]');
  await expect(tiles).toHaveCount(8);
  await expect(page.locator('[data-game="sort"]')).toHaveCount(0);
  for (const game of ['listen', 'digits', 'memory', 'bubbles', 'feed']) await expect(page.locator(`[data-game="${game}"]`)).toHaveAttribute('data-open', 'true');
  // Five things for the scene, four body parts, three colours.
  for (const game of ['spy', 'simon', 'paint']) await expect(page.locator(`[data-game="${game}"]`)).toHaveAttribute('data-open', 'false');
  await page.locator('[data-game="simon"]').click();
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Najpierw poznajmy więcej słówek!');
  const ola = page.url().split('/child/')[1]?.split('/')[0] as string;
  for (const game of ['spy', 'simon', 'paint', 'sort']) {
    await page.goto(`/#/child/${ola}/play/${game}`);
    await expect(page).toHaveURL(new RegExp(`#/child/${ola}/play$`));
  }
});

test('Bańki: five bubbles popped, learned words only; a miss wiggles, the second glows', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await play(page, 'bubbles');
  await expect.poll(() => texts(page).then((t) => t.at(0) !== undefined && t.includes('Przebij bańkę:'))).toBe(true);
  const targets: string[] = [];
  for (let round = 0; round < 5; round++) {
    const field = page.getByTestId('bubbles');
    await expect(field).toHaveAttribute('data-round', String(round));
    const target = (await field.getAttribute('data-target')) as string;
    targets.push(target);
    const ids = await shownWords(field);
    expect(ids).toContain(target);
    expect(ids).toHaveLength(4);
    if (round === 0) {
      const wrong = field.locator(`[data-word-id]:not([data-word-id="${target}"])`).first();
      // The bubbles move, so the taps are dispatched rather than aimed.
      await wrong.dispatchEvent('click');
      await expect(wrong).toHaveClass(/is-wiggling/);
      await expect.poll(() => texts(page).then((t) => t.at(-2))).toBe('Spróbuj jeszcze raz.');
      await wrong.dispatchEvent('click');
      await expect(field.locator(`[data-word-id="${target}"]`)).toHaveAttribute('data-glow', '');
    }
    await field.locator(`[data-word-id="${target}"]`).dispatchEvent('click');
  }
  expect(new Set(targets).size).toBe(5);
  // Five bubbles, and a bonus for the four first tries in a row.
  await finished(page, ola, 6);
  const today = localDay(new Date());
  const progress = await ownProgress(page, ola);
  expect(progress?.attempts[targets[0] as string]?.[today]).toEqual({ c: 1, w: 2, first: 0 });
  for (const id of targets.slice(1)) expect(progress?.attempts[id]?.[today]).toEqual({ c: 1, w: 0, first: 1 });
});

test('Bańki with reduced motion: the bubbles stand still and can be tapped like any button', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const ola = await toShelf(page);
  await play(page, 'bubbles');
  const lane = page.locator('.bubble-lane').first();
  await expect(lane).toHaveCSS('animation-name', 'none');
  for (let round = 0; round < 5; round++) {
    const field = page.getByTestId('bubbles');
    await expect(field).toHaveAttribute('data-round', String(round));
    await field.locator(`[data-word-id="${await field.getAttribute('data-target')}"]`).click();
  }
  await finished(page, ola, 6);
});

test('Nakarm Polly: dragged onto Polly or tapped, the right food is eaten; dropped elsewhere nothing happens', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await play(page, 'feed');
  await expect.poll(() => texts(page).then((t) => t.includes('Daj Polly:'))).toBe(true);
  const mouth = page.getByTestId('polly-mouth');
  const targets: string[] = [];
  for (let round = 0; round < 5; round++) {
    const feed = page.getByTestId('feed');
    await expect(feed).toHaveAttribute('data-round', String(round));
    const target = (await feed.getAttribute('data-target')) as string;
    targets.push(target);
    expect(await shownWords(feed)).toContain(target);
    const food = feed.locator(`[data-word-id="${target}"]`);
    if (round === 0) {
      // Dragged and dropped beside Polly: back in its place, no miss.
      const box = (await food.boundingBox()) as { x: number; y: number; width: number; height: number };
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 5 });
      await expect(food).toHaveClass(/is-dragging/);
      await page.mouse.up();
      await expect(food).not.toHaveClass(/is-dragging/);
      await expect(feed).toHaveAttribute('data-misses', '0');
      // A wrong one dragged onto Polly: a miss, and it goes back.
      const wrong = feed.locator(`[data-word-id]:not([data-word-id="${target}"])`).first();
      await wrong.dragTo(mouth);
      await expect(feed).toHaveAttribute('data-misses', '1');
      await expect(wrong).toHaveClass(/is-wiggling/);
      // The right one, dragged onto Polly.
      await food.dragTo(mouth);
    } else {
      await food.click();
    }
  }
  await finished(page, ola, 6);
  const today = localDay(new Date());
  const progress = await ownProgress(page, ola);
  expect(progress?.attempts[targets[0] as string]?.[today]).toEqual({ c: 1, w: 1, first: 0 });
  for (const id of targets.slice(1)) expect(progress?.attempts[id]?.[today]).toEqual({ c: 1, w: 0, first: 1 });
});

test('Gdzie jest…?: one scene of learned things, five of them found', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await play(page, 'spy');
  const spy = page.getByTestId('spy');
  const scene = await shownWords(spy);
  expect(scene.length).toBeGreaterThanOrEqual(5);
  expect(scene.length).toBeLessThanOrEqual(8);
  const targets: string[] = [];
  for (let round = 0; round < 5; round++) {
    await expect(spy).toHaveAttribute('data-round', String(round));
    const target = (await spy.getAttribute('data-target')) as string;
    targets.push(target);
    await expect.poll(() => texts(page).then((t) => t.slice(-2))).toEqual(['Gdzie jest', expect.any(String)]);
    // The scene stays the same between questions.
    expect(await shownWords(spy)).toEqual(scene);
    if (round === 0) {
      const wrong = spy.locator(`[data-scene-item]:not([data-word-id="${target}"])`).first();
      await wrong.click();
      await expect(spy).toHaveAttribute('data-misses', '1');
    }
    await spy.locator(`[data-scene-item][data-word-id="${target}"]`).click();
  }
  expect(new Set(targets).size).toBe(5);
  await finished(page, ola, 6);
  const progress = await ownProgress(page, ola);
  const today = localDay(new Date());
  expect(progress?.attempts[targets[0] as string]?.[today]).toEqual({ c: 1, w: 1, first: 0 });
});

test('Polly mówi: five learned body parts, each done with ✅; ungraded', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await play(page, 'simon');
  await expect.poll(() => texts(page).then((t) => t.includes('Rób to, co mówi Polly, a potem dotknij zielonego przycisku!'))).toBe(true);
  for (let round = 0; round < 5; round++) {
    const simon = page.getByTestId('simon');
    await expect(simon).toHaveAttribute('data-round', String(round));
    const part = (await simon.getAttribute('data-word')) as string;
    expect(BODY).toContain(part);
    expect(await shownWords(simon, BODY)).toEqual([part]);
    await expect.poll(() => texts(page).then((t) => t.slice(-2))).toEqual(['Polly mówi: pokaż', expect.any(String)]);
    await page.getByTestId('done').click();
  }
  await finished(page, ola, 5);
  expect((await ownProgress(page, ola))?.attempts).toEqual({});
});

test('Pokoloruj: a pot, then the picture; only the right pot paints, the second miss glows', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await toShelf(page);
  await play(page, 'paint');
  const colours: string[] = [];
  for (let round = 0; round < 5; round++) {
    const paint = page.getByTestId('paint');
    await expect(paint).toHaveAttribute('data-round', String(round));
    const colour = (await paint.getAttribute('data-colour')) as string;
    const thing = (await paint.getAttribute('data-thing')) as string;
    colours.push(colour);
    expect([...FRUIT, ...PETS, ...BODY]).toContain(thing);
    const pots = page.getByTestId('pots');
    const potIds = await shownWords(pots, COLOURS);
    expect(potIds).toHaveLength(3);
    expect(potIds).toContain(colour);
    const picture = page.getByTestId('paint-picture');
    if (round === 0) {
      // No pot yet: Polly asks for one.
      await picture.click();
      await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Najpierw dotknij farbki!');
      const wrong = pots.locator(`[data-word-id]:not([data-word-id="${colour}"])`).first();
      for (let miss = 1; miss <= 2; miss++) {
        await wrong.click();
        await expect(wrong).toHaveAttribute('aria-pressed', 'true');
        await picture.click();
        await expect(paint).toHaveAttribute('data-misses', String(miss));
        await expect(picture).not.toHaveAttribute('data-painted');
      }
      await expect(pots.locator(`[data-word-id="${colour}"]`)).toHaveAttribute('data-glow', '');
    }
    await pots.locator(`[data-word-id="${colour}"]`).click();
    await picture.click();
    await expect(picture).toHaveAttribute('data-painted', colour);
  }
  await finished(page, ola, 6);
  const today = localDay(new Date());
  const progress = await ownProgress(page, ola);
  // Each round is an attempt for its colour (a colour can come back in a later round).
  const total = (id: string) => progress?.attempts[id]?.[today];
  expect(Object.keys(progress?.attempts ?? {}).every((id) => COLOURS.includes(id))).toBe(true);
  expect(colours.reduce((n, c) => n + (c === colours[0] ? 1 : 0), 0)).toBe(total(colours[0] as string)?.c);
  expect(total(colours[0] as string)?.w).toBe(2);
});

test('Kosze appears once the parent switches it on, and sorts six learned pictures into two baskets', async ({ page }) => {
  test.setTimeout(90_000);
  const ola = await toShelf(page);
  await expect(page.locator('[data-game="sort"]')).toHaveCount(0);
  await page.goto(`/#/child/${ola}`);
  await openPanel(page);
  await page.goto(`/#/parent/child/${ola}`);
  await page.getByTestId('sort-game').check();
  await expect(page.getByTestId('sort-game')).toBeChecked();
  await page.goto(`/#/child/${ola}/play`);
  await expect(page.locator('[data-game="sort"]')).toHaveAttribute('data-open', 'true');
  await play(page, 'sort');

  const baskets = page.getByTestId('baskets');
  const topics = await baskets.locator('[data-basket]').evaluateAll((els) => els.map((e) => e.getAttribute('data-basket') as string));
  expect(topics).toHaveLength(2);
  for (let round = 0; round < 6; round++) {
    await expect(baskets).toHaveAttribute('data-round', String(round));
    const item = page.getByTestId('sort-item');
    const id = (await item.getAttribute('data-word-id')) as string;
    const home = (await item.getAttribute('data-home')) as string;
    expect(LEARNED).toContain(id);
    expect(topics).toContain(home);
    expect(id.startsWith(`${home}.`)).toBe(true);
    if (round === 0) {
      const wrong = baskets.locator(`[data-basket]:not([data-basket="${home}"])`);
      await wrong.click();
      await expect(wrong).toHaveClass(/is-wiggling/);
      await wrong.click();
      await expect(baskets.locator(`[data-basket="${home}"]`)).toHaveAttribute('data-glow', '');
      await expect(baskets).toHaveAttribute('data-round', '0');
    }
    await baskets.locator(`[data-basket="${home}"]`).click();
  }
  // Six pictures, plus a bonus for the five first tries in a row.
  await finished(page, ola, 7);
  expect((await ownProgress(page, ola))?.attempts).toEqual({});
});
