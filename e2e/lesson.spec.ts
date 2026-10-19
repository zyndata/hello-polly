import { expect, test } from './fixtures';
import { firstRun, openPanel } from './family';
import { playLesson } from './lesson';
import { ownProgress, readFamily, seedLearned } from './progress';
import { fakeSpeech, spoken } from './speech';
import praise from '../content/praise.json' with { type: 'json' };
import { localDay } from '../src/lib/domain/time';

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

const texts = (page: Parameters<typeof spoken>[0]) => spoken(page).then((s) => s.map((r) => r.text));

test('a full lesson runs end to end and updates attempts, stars and states', async ({ page }) => {
  test.setTimeout(90_000);
  const ola = await firstRun(page);
  await page.getByTestId('sail').click();
  const today = localDay(new Date());

  const lesson = await playLesson(page, async ({ target, choices }, n) => {
    if (n !== 0) return;
    const pick = page.getByTestId('pick');
    const right = pick.locator(`[data-word-id="${target}"]`);
    const wrong = pick.locator(`[data-word-id="${choices.find((c) => c !== target)}"]`);
    const wrongWord = (await wrong.getAttribute('aria-label')) as string;
    const targetWord = (await right.getAttribute('aria-label')) as string;
    // Polly asks in Polish, with the English word in it.
    await expect.poll(() => texts(page)).toEqual(expect.arrayContaining(['Gdzie jest', targetWord]));

    // First miss: a wiggle, the tapped word, and the question again. Nothing is removed.
    await wrong.click();
    await expect(pick).toHaveAttribute('data-misses', '1');
    await expect(wrong).toHaveClass(/is-wiggling/);
    await expect(right).not.toHaveAttribute('data-glow');
    await expect.poll(() => texts(page).then((t) => t.slice(-3))).toEqual([wrongWord, 'Spróbuj jeszcze raz.', targetWord]);
    await expect(page.getByTestId('polly')).toHaveAttribute('data-mood', 'think');

    // Second miss: the right picture glows.
    await wrong.click();
    await expect(right).toHaveAttribute('data-glow', '');
    await expect.poll(() => texts(page).then((t) => t.slice(-3))).toEqual([wrongWord, 'Popatrz, to ten!', targetWord]);
    await expect(pick.locator('[data-word-id]')).toHaveCount(2);

    // 🔊 asks again.
    await page.getByTestId('repeat').click();
    await expect.poll(() => texts(page).then((t) => t.slice(-2))).toEqual(['Gdzie jest', targetWord]);
  });

  // Look and listen for the three new words, then two 2-choice picks each.
  expect(lesson.introduced).toEqual(['colours.red', 'colours.blue', 'colours.yellow']);
  expect(lesson.picks).toHaveLength(6);
  for (const pick of lesson.picks) {
    expect(pick.choices).toHaveLength(2);
    expect(pick.choices).toContain(pick.target);
  }
  // A right answer is praised in English.
  expect((await texts(page)).some((t) => praise.includes(t))).toBe(true);

  // 9 steps, plus one bonus star for the five first tries in a row after the misses.
  await expect(page.getByTestId('stars')).toHaveAttribute('data-stars', '10');
  await expect(page.getByTestId('stars').locator('li')).toHaveCount(10);
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe('Brawo! Wyspa zdobyta!');
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`), { timeout: 15_000 });

  // Attempts per word and day, stars and the lesson, on this device.
  const progress = await ownProgress(page, ola);
  expect(progress?.stars).toBe(10);
  expect(Object.keys(progress?.lessons ?? {})).toHaveLength(1);
  expect(Object.keys(progress?.introduced ?? {}).sort()).toEqual(['colours.blue', 'colours.red', 'colours.yellow']);
  const first = lesson.picks[0]?.target as string;
  for (const word of lesson.introduced) {
    expect(progress?.attempts[word]?.[today]).toEqual(word === first ? { c: 2, w: 2, first: 1 } : { c: 2, w: 0, first: 2 });
  }

  // The states follow: each word practising, shown so in the parent's word list.
  await openPanel(page);
  await page.locator(`[data-child-id="${ola}"]`).click();
  await page.locator('[data-topic="colours"] summary').click();
  for (const word of lesson.introduced) {
    await expect(page.locator(`[data-plan-word="${word}"] [data-testid="status"]`)).toHaveText('ćwiczy');
  }
});

test('new words appear only in 2-choice steps within their first lesson', async ({ page }) => {
  test.setTimeout(120_000);
  const ola = await firstRun(page);
  // Four fruit learned long ago, high in the boxes and due today: 4-picture reviews.
  await seedLearned(page, ola, { 'fruit.apple': 5, 'fruit.banana': 5, 'fruit.pear': 6, 'fruit.lemon': 3 });
  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('sail').click();

  const lesson = await playLesson(page);
  // Four reviews due: two new words (decision 17).
  expect(lesson.introduced).toEqual(['colours.red', 'colours.blue']);
  const fresh = new Set(lesson.introduced);
  const reviews = lesson.picks.filter((p) => !fresh.has(p.target));
  expect(reviews.map((p) => p.target).sort()).toEqual(['fruit.apple', 'fruit.banana', 'fruit.lemon', 'fruit.pear']);
  expect(reviews.map((p) => p.choices.length).sort()).toEqual([3, 4, 4, 4]);
  for (const pick of lesson.picks) {
    if (pick.choices.some((c) => fresh.has(c))) expect(pick.choices).toHaveLength(2);
  }
  expect(lesson.picks.filter((p) => fresh.has(p.target))).toHaveLength(4);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`), { timeout: 15_000 });

  // The next lesson brings the next new words; red and blue are no longer new there.
  await page.getByTestId('sail').click();
  const next = await playLesson(page);
  expect(next.introduced).toEqual(['colours.yellow', 'colours.green', 'colours.orange']);
  for (const pick of next.picks) {
    if (pick.choices.some((c) => next.introduced.includes(c))) expect(pick.choices).toHaveLength(2);
  }
  const file = await readFamily(page);
  expect(Object.values(file.progress[ola] ?? {}).reduce((n, d) => n + Object.keys(d.lessons).length, 0)).toBe(2);
});

test('a lesson left halfway keeps the answers, but gives no stars', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await firstRun(page);
  await page.getByTestId('sail').click();
  let answered = 0;
  for (;;) {
    const step = page.getByTestId('step');
    await expect(step).toBeVisible();
    if ((await step.getAttribute('data-kind')) === 'pick') {
      if (answered === 2) break;
      const index = await step.getAttribute('data-index');
      const target = await page.getByTestId('pick').getAttribute('data-target');
      await page.locator(`[data-word-id="${target}"]`).click();
      await expect(step).not.toHaveAttribute('data-index', index as string, { timeout: 10_000 });
      answered++;
    } else {
      await page.getByTestId('lesson-word').locator('button').click();
      await page.getByTestId('next').click();
    }
  }
  await page.getByTestId('home').hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  const progress = await ownProgress(page, ola);
  expect(progress?.stars).toBe(0);
  expect(Object.keys(progress?.lessons ?? {})).toHaveLength(0);
  const solved = Object.values(progress?.attempts ?? {}).flatMap((d) => Object.values(d)).reduce((n, a) => n + a.c, 0);
  expect(solved).toBe(2);
});
