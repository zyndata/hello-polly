import { expect, test } from './fixtures';
import { gotoParent, passGate } from './gate';
import { fakeSpeech, lastSpoken, speechCalls, spoken } from './speech';
import words from '../content/words.json' with { type: 'json' };

/** Each word as the speech engine must receive it. */
const spokenForm = (w: { en: string; say?: string }) => w.say ?? w.en;

test.describe('start screen', () => {
  test('nothing speaks before the tap; the tap greets in Polish and English, then moves on', async ({ page }) => {
    await fakeSpeech(page);
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeVisible();
    await page.waitForTimeout(500);
    expect(await speechCalls(page)).toBe(0);

    await page.getByTestId('start').click();
    await expect.poll(() => spoken(page).then((s) => s.map((r) => [r.text, r.lang]))).toEqual([
      ['Cześć! Jestem Polly.', 'pl-PL'],
      ['Hello!', 'en-GB']
    ]);
    await expect(page).toHaveURL(/#\/setup$/);
  });
});

test.describe('/parent/speech', () => {
  test.beforeEach(async ({ page }) => {
    await fakeSpeech(page);
    await gotoParent(page, '/parent/speech');
    await expect(page.getByTestId('voice-en')).toContainText('Fake English (UK)');
  });

  test('tapping a picture speaks its `say ?? en`, for every word', async ({ page }) => {
    // 45 taps, each checked; WebKit under a loaded CI runner needs the room.
    test.setTimeout(90_000);
    for (const w of words) {
      await page.locator(`[data-word-id="${w.id}"]`).click();
      await expect.poll(() => lastSpoken(page).then((s) => s?.[0]), { message: w.id, intervals: [25] }).toBe(spokenForm(w));
    }
  });

  test('the 🐢/🐇 toggle changes the rate', async ({ page }) => {
    const banana = page.locator('[data-word-id="fruit.banana"]');
    const slow = page.locator('[data-speed="slow"]');
    const normal = page.locator('[data-speed="normal"]');
    await expect(slow).toHaveAttribute('aria-pressed', 'true');

    await banana.click();
    await expect.poll(() => lastSpoken(page)).toEqual(['banana', 'en-GB', 0.6]);

    await normal.click();
    await expect(normal).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => lastSpoken(page)).toEqual(['Normalnie.', 'pl-PL', 1]);
    await banana.click();
    await expect.poll(() => lastSpoken(page)).toEqual(['banana', 'en-GB', 0.9]);

    await slow.click();
    await expect.poll(() => lastSpoken(page)).toEqual(['Powoli.', 'pl-PL', 1]);
    await banana.click();
    await expect.poll(() => lastSpoken(page)).toEqual(['banana', 'en-GB', 0.6]);
  });

  test('the voice check names both voices and lists every voice', async ({ page }) => {
    await expect(page.getByTestId('voice-pl')).toContainText('Fake Polski');
    await expect(page.getByTestId('install-help')).toHaveCount(0);
    await page.getByText('Wszystkie głosy (3)').click();
    await expect(page.getByTestId('all-voices').locator('li')).toHaveCount(3);

    await page.getByRole('button', { name: /„banana” wolno/ }).click();
    await expect.poll(() => lastSpoken(page)).toEqual(['banana', 'en-GB', 0.6]);
    await page.getByRole('button', { name: /„banana” normalnie/ }).click();
    await expect.poll(() => lastSpoken(page)).toEqual(['banana', 'en-GB', 0.9]);
    await page.getByRole('button', { name: /^Polski:/ }).click();
    await expect.poll(() => lastSpoken(page)).toEqual(['Cześć! Jestem Polly.', 'pl-PL', 1]);
  });

  test('accent and rates are family settings that survive a reload', async ({ page }) => {
    await page.getByLabel('Amerykański (en-US)').check();
    await page.getByTestId('slow-rate-input').fill('0.5');
    await expect(page.getByTestId('slow-rate')).toHaveText('0,50');
    await page.getByLabel('Powtarzaj wolno dwa razy').check();

    await page.locator('[data-word-id="fruit.pear"]').click();
    await expect
      .poll(() => spoken(page).then((s) => s.map((r) => [r.text, r.lang, r.rate, r.voice])))
      .toEqual([
        ['pear', 'en-US', 0.5, 'Fake English (US)'],
        ['pear', 'en-US', 0.5, 'Fake English (US)']
      ]);

    await page.reload();
    await passGate(page);
    await expect(page.getByLabel('Amerykański (en-US)')).toBeChecked();
    await expect(page.getByTestId('slow-rate')).toHaveText('0,50');
    await expect(page.getByLabel('Powtarzaj wolno dwa razy')).toBeChecked();
  });

  test('the default speed starts the toggle', async ({ page }) => {
    await page.getByRole('radio', { name: '🐇 normalnie' }).check();
    await page.reload();
    await passGate(page);
    await expect(page.locator('[data-speed="normal"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-word-id="colours.red"]').click();
    await expect.poll(() => lastSpoken(page)).toEqual(['red', 'en-GB', 0.9]);
  });

  test('a voice chosen on this device is used', async ({ page }) => {
    await page.getByTestId('voice-en-select').selectOption({ label: 'Fake English (US) (en-US, na urządzeniu)' });
    await expect(page.getByTestId('voice-en')).toContainText('Fake English (US)');
    await page.locator('[data-word-id="fruit.apple"]').click();
    await expect.poll(() => spoken(page).then((s) => s.at(-1)?.voice)).toBe('Fake English (US)');
    await page.reload();
    await passGate(page);
    await expect(page.getByTestId('voice-en')).toContainText('Fake English (US)');
  });
});

test('a new tap cuts off the word being spoken', async ({ page }) => {
  // A fake so slow (about 30 s a word) that the first word is still going at the second tap.
  await fakeSpeech(page, { msPerChar: 2000 });
  await gotoParent(page, '/parent/speech');
  await page.locator('[data-word-id="fruit.watermelon"]').click();
  await expect.poll(() => page.evaluate(() => window.__speech?.spoken.at(-1)?.outcome)).toBe('speaking');
  await page.locator('[data-word-id="fruit.pear"]').click();
  await expect
    .poll(() => page.evaluate(() => window.__speech?.spoken.filter((r) => r.text).map((r) => [r.text, r.outcome])))
    .toEqual([
      ['watermelon', 'cancelled'],
      ['pear', 'speaking']
    ]);
});

test('without a Polish voice, the check says so and prompts drop their Polish', async ({ page }) => {
  await fakeSpeech(page, { voices: [{ name: 'Only English', lang: 'en-GB' }] });
  await gotoParent(page, '/parent/speech');
  await expect(page.getByTestId('voice-en')).toContainText('Only English');
  await expect(page.getByTestId('voice-pl')).toContainText('nie ma polskiego głosu');
  await expect(page.getByTestId('install-help')).toBeVisible();
  await page.locator('[data-speed="normal"]').click();
  await page.locator('[data-word-id="pets-farm.cat"]').click();
  await expect.poll(() => spoken(page).then((s) => s.map((r) => r.text))).toEqual(['cat']);
});

test('without a British voice, the check names the American one in use', async ({ page }) => {
  await fakeSpeech(page, { voices: [{ name: 'Samantha', lang: 'en-US' }, { name: 'Zosia', lang: 'pl-PL' }] });
  await gotoParent(page, '/parent/speech');
  await expect(page.getByTestId('voice-en')).toContainText('Nie ma głosu w akcencie brytyjskim');
  await expect(page.getByTestId('voice-en')).toContainText('Samantha');
});

test('without any speech, the check says so plainly', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
  });
  await gotoParent(page, '/parent/speech');
  await expect(page.getByTestId('no-speech')).toBeVisible();
});
