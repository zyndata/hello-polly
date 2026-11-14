import { expect, test } from './fixtures';
import { firstRun } from './family';
import { gotoParent } from './gate';
import { playLesson } from './lesson';
import { ownProgress, readFamily, seedLearned, writeFamily, SEED_DEVICE } from './progress';
import { fakeSpeech, spoken } from './speech';
import { localDay } from '../src/lib/domain/time';

/**
 * Lessons the parent plans ahead (STATE.md decision 105) and *Powtórka*, the review of words
 * met before, trouble words first (decision 106).
 */

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

/** In the open lesson draft: opens the topic and picks the word. */
async function pickWord(page: Parameters<typeof firstRun>[0], topic: string, word: string): Promise<void> {
  const details = page.locator(`[data-draft-topic="${topic}"]`);
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click();
  await page.locator(`[data-pick-word="${word}"]`).click();
  await expect(page.locator(`[data-pick-word="${word}"]`)).toHaveAttribute('aria-pressed', 'true');
}

test('the parent plans two lessons; the child plays them in order, then the usual ones', async ({ page }) => {
  test.setTimeout(150_000);
  const ola = await firstRun(page);
  await gotoParent(page, `/parent/child/${ola}`);
  await expect(page.getByTestId('no-planned')).toBeVisible();

  // Lesson 1: a nose and an apple. Lesson 2: a cat and a verb, planned first and then moved down.
  await page.getByTestId('lesson-add').click();
  await pickWord(page, 'pets-farm', 'pets-farm.cat');
  await pickWord(page, 'actions', 'actions.cook');
  await page.getByTestId('lesson-save').click();
  await page.getByTestId('lesson-add').click();
  await pickWord(page, 'body', 'body.nose');
  await pickWord(page, 'fruit', 'fruit.apple');
  for (const word of ['fruit.banana', 'fruit.pear']) await pickWord(page, 'fruit', word);
  // Four words at most: the fifth cannot be picked.
  await expect(page.locator('[data-pick-word="fruit.lemon"]')).toBeDisabled();
  await page.getByRole('button', { name: 'Usuń z lekcji: banan' }).click();
  await page.getByRole('button', { name: 'Usuń z lekcji: gruszka' }).click();
  await page.getByTestId('lesson-save').click();
  const planned = page.getByTestId('planned-lessons').locator('[data-planned-lesson]');
  await expect(planned).toHaveCount(2);
  await page.getByRole('button', { name: 'Wcześniej: Wyspa 2.' }).click();
  await expect(planned.first().locator('[data-word]')).toHaveCount(2);
  await expect(planned.first().locator('[data-word="body.nose"]')).toBeVisible();
  const stored = (await readFamily(page)).plans[ola]?.v.lessons ?? [];
  expect(stored.map((l) => l.words)).toEqual([['body.nose', 'fruit.apple'], ['pets-farm.cat', 'actions.cook']]);

  // The child: the first planned lesson, then the second.
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('sail').click();
  const first = await playLesson(page);
  expect(first.introduced).toEqual(['body.nose', 'fruit.apple']);
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 15_000 });
  const records = Object.values((await ownProgress(page, ola))?.lessons ?? {});
  expect(records.map((r) => r.planned)).toEqual([stored[0]?.id]);

  await page.getByTestId('sail').click();
  const second = await playLesson(page);
  expect(second.introduced).toEqual(['pets-farm.cat', 'actions.cook']);
  // Words met in the first lesson come back for practice.
  expect(second.picks.some((p) => p.target === 'body.nose' || p.target === 'fruit.apple')).toBe(true);
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 15_000 });

  // Both done: the parent's list is empty, and the next lesson comes from the topics again.
  await gotoParent(page, `/parent/child/${ola}`);
  await expect(page.getByTestId('no-planned')).toBeVisible();
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('sail').click();
  await expect(page.getByTestId('lesson-word')).toHaveAttribute('data-word', 'colours.red');
});

test('Powtórka asks the trouble word first and twice, gives stars, and plants no flag', async ({ page }) => {
  test.setTimeout(120_000);
  const ola = await firstRun(page);
  // No button before any word is met.
  await expect(page.getByTestId('review')).toHaveCount(0);

  await seedLearned(page, ola, { 'fruit.apple': 2, 'fruit.banana': 2, 'fruit.pear': 2, 'fruit.lemon': 2, 'colours.red': 2 });
  // The lemon was missed twice yesterday on the other device: a trouble word.
  const yesterday = localDay(new Date(Date.now() - 86_400_000));
  const file = await readFamily(page);
  const seeded = file.progress[ola]?.[SEED_DEVICE];
  if (!seeded) throw new Error('no seeded progress');
  seeded.attempts['fruit.lemon'] = { ...seeded.attempts['fruit.lemon'], [yesterday]: { c: 1, w: 2, first: 0 } };
  seeded.seq += 1;
  await writeFamily(page, file);

  // The map reads the family once: load it again.
  await page.reload();
  await page.getByTestId('review').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/lesson\\?review$`));
  await expect.poll(async () => (await spoken(page)).some((s) => s.text.startsWith('Powtórka') || s.text.startsWith('Czas na powtórkę') || s.text.startsWith('Powtarzamy'))).toBe(true);
  const review = await playLesson(page);
  expect(review.introduced).toEqual([]);
  expect(review.picks.filter((p) => p.target === 'fruit.lemon')).toHaveLength(2);
  expect(new Set(review.picks.map((p) => p.target))).toEqual(new Set(['fruit.apple', 'fruit.banana', 'fruit.pear', 'fruit.lemon', 'colours.red']));
  await expect(page.getByTestId('lesson-finished').locator('.finish-island')).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`), { timeout: 15_000 });

  const progress = await ownProgress(page, ola);
  expect(Object.keys(progress?.lessons ?? {})).toHaveLength(0);
  expect(progress?.stars).toBeGreaterThanOrEqual(review.picks.length);
  // Two clean answers today paid for yesterday's miss: the lemon is no longer a trouble word.
  await gotoParent(page, `/parent/child/${ola}`);
  await expect(page.getByTestId('dashboard')).toBeVisible();
  await expect(page.locator('[data-testid="needs-practice"] [data-word="fruit.lemon"]')).toHaveCount(0);
});
