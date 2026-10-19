import { expect, test } from './fixtures';
import { fillChild, firstRun, openPanel, queueWord } from './family';
import { playLesson } from './lesson';
import { fakeSpeech, spoken } from './speech';

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

const lastText = (page: Parameters<typeof spoken>[0]) => spoken(page).then((s) => s.at(-1)?.text);

/** Holds the home button down long enough to leave. */
async function holdHome(page: Parameters<typeof spoken>[0]) {
  await page.getByTestId('home').hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
}

test('with one child the picker never appears; a second makes it appear; removing it makes it go', async ({ page }) => {
  test.setTimeout(60_000);
  const ola = await firstRun(page, 'Ola', 'fox');

  // One child: the start screen goes straight to her map.
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  await expect(page.getByTestId('picker')).toHaveCount(0);
  // With one child the map is home: there is no way out of it.
  await expect(page.getByTestId('home')).toHaveCount(0);

  // A second child, added in the parent panel.
  await openPanel(page);
  await page.getByRole('button', { name: 'Dodaj dziecko' }).click();
  await fillChild(page, 'Staś', 'hippopotamus');
  await page.getByRole('button', { name: 'Dodaj dziecko' }).click();
  await expect(page.getByTestId('children').locator('li')).toHaveCount(2);
  await page.getByTestId('to-child').click();
  await expect(page.getByTestId('picker')).toBeVisible();
  await expect(page.getByTestId('picker').locator('[data-child-id]')).toHaveCount(2);
  await expect.poll(() => lastText(page)).toBe('Kto dziś płynie z Polly? Dotknij swojego zwierzątka!');

  // Staś's map has the long-press home, back to the picker; a short press only says so.
  await page.getByRole('button', { name: 'Staś' }).click();
  await expect(page.getByTestId('map')).toBeVisible();
  const stas = page.url().split('/child/')[1] as string;
  await page.getByTestId('home').click();
  await expect.poll(() => lastText(page)).toBe('Przytrzymaj dłużej, żeby wyjść.');
  await expect(page).toHaveURL(new RegExp(`#/child/${stas}$`));
  await holdHome(page);
  await expect(page.getByTestId('picker')).toBeVisible();

  // Removing Staś: the picker disappears again.
  await page.getByRole('button', { name: 'Staś' }).click();
  await openPanel(page);
  await page.locator(`[data-child-id="${stas}"]`).click();
  await page.getByTestId('delete').click();
  await page.getByTestId('delete-confirm').click();
  await expect(page).toHaveURL(/#\/parent$/);
  await expect(page.getByTestId('children').locator('li')).toHaveCount(1);
  await page.getByTestId('to-child').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  await expect(page.getByTestId('picker')).toHaveCount(0);

  // And after a reload, from the tap.
  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  await expect(page.getByTestId('picker')).toHaveCount(0);
});

test('a queued word is the next word introduced, ahead of topic order', async ({ page }) => {
  test.setTimeout(90_000);
  // Queued during the first run: mango comes before the colours.
  const ola = await firstRun(page, 'Ola', 'fox', (p) => queueWord(p, 'fruit', 'fruit.mango'));
  await expect(page.getByTestId('map')).toHaveAttribute('data-done', '0');

  await page.getByTestId('sail').click();
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}/lesson$`));
  // Polly introduces the first picture before the child taps it.
  await expect
    .poll(() => spoken(page).then((s) => s.map((r) => [r.text, r.lang])))
    .toEqual(expect.arrayContaining([
      ['Płyniemy na nową wyspę!', 'pl-PL'],
      ['Popatrz i posłuchaj.', 'pl-PL'],
      ['mango', 'en-GB']
    ]));

  const { introduced } = await playLesson(page);
  expect(introduced).toEqual(['fruit.mango', 'colours.red', 'colours.blue']);
  await expect(page.getByTestId('lesson-finished')).toBeVisible();
  await expect.poll(() => lastText(page)).toBe('Brawo! Wyspa zdobyta!');
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`), { timeout: 15_000 });
  await expect(page.getByTestId('map')).toHaveAttribute('data-done', '1');
  await expect(page.locator('[data-island="done"] [data-flag]')).toHaveCount(1);

  // Queued later, in the parent panel: the duck jumps ahead of the colours.
  await openPanel(page);
  await page.locator(`[data-child-id="${ola}"]`).click();
  const upcoming = page.getByTestId('upcoming').locator('li');
  await expect(upcoming.first()).toHaveAttribute('data-word', 'colours.yellow');
  await queueWord(page, 'pets-farm', 'pets-farm.duck');
  await expect(upcoming.first()).toHaveAttribute('data-word', 'pets-farm.duck');
  await page.locator('[data-topic="fruit"] summary').click();
  // Met and answered in the lesson's picks: practising now.
  await expect(page.locator('[data-plan-word="fruit.mango"] [data-testid="status"]')).toHaveText('ćwiczy');

  await page.goto(`/#/child/${ola}`);
  await page.getByTestId('sail').click();
  await expect(page.getByTestId('lesson-word')).toHaveAttribute('data-word', 'pets-farm.duck');
});

test('known and paused words are skipped, and the queue reorders', async ({ page }) => {
  test.setTimeout(90_000);
  const ola = await firstRun(page, 'Ola', 'fox', async (p) => {
    await queueWord(p, 'fruit', 'fruit.mango');
    await queueWord(p, 'fruit', 'fruit.lemon');
    await p.getByRole('button', { name: 'Wyżej: cytryna' }).click();
    await expect(p.locator('[data-queue-word]').first()).toHaveAttribute('data-queue-word', 'fruit.lemon');
    await p.locator('[data-topic="colours"] summary').click();
    await p.locator('[data-plan-word="colours.red"]').getByRole('button', { name: 'Zna już' }).click();
    await p.locator('[data-plan-word="colours.blue"]').getByRole('button', { name: 'Wstrzymaj' }).click();
  });
  await page.getByTestId('sail').click();
  const { introduced } = await playLesson(page);
  expect(introduced).toEqual(['fruit.lemon', 'fruit.mango', 'colours.yellow']);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`), { timeout: 15_000 });
});

test('the lesson exits only on a long press of home', async ({ page }) => {
  const ola = await firstRun(page);
  await page.getByTestId('sail').click();
  await expect(page.getByTestId('lesson-word')).toBeVisible();
  await page.getByTestId('home').click();
  await expect.poll(() => lastText(page)).toBe('Przytrzymaj dłużej, żeby wyjść.');
  await expect(page.getByTestId('lesson-word')).toBeVisible();
  await holdHome(page);
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
  await expect(page.getByTestId('map')).toHaveAttribute('data-done', '0');
});

test('first run: the invitation path explains the link and leads back', async ({ page }) => {
  await page.goto('/#/setup');
  await page.getByRole('button', { name: 'Dalej' }).click();
  await page.getByRole('button', { name: 'Mam zaproszenie' }).click();
  await expect(page.getByRole('heading', { name: 'Mam zaproszenie' })).toBeVisible();
  await page.getByRole('button', { name: 'Wróć' }).click();
  await expect(page.getByRole('button', { name: 'Zaczynamy' })).toBeVisible();
});

test('/setup sends a family that already has a child to the start', async ({ page }) => {
  const ola = await firstRun(page);
  await page.goto('/#/setup');
  // Speech is unlocked in this session, so `/` goes on to the only child's map.
  await expect(page).toHaveURL(new RegExp(`#/child/${ola}$`));
});

test('an unknown child id leads back to the start', async ({ page }) => {
  await page.goto('/#/child/nobody');
  await expect(page.getByTestId('start')).toBeVisible();
  await page.goto('/#/child/nobody/lesson');
  await expect(page.getByTestId('start')).toBeVisible();
});
