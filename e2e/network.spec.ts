import type { Request } from '@playwright/test';
import { expect, test } from './fixtures';

const AUDIO_FILE = /\.(mp3|wav|ogg|oga|m4a|aac|opus|flac|weba|webm)(\?|$)/i;

/**
 * PLAN.md Phase 3: "No network request and no audio file appear in the network log at any
 * point." Runs on the browser's real speech (no fake), through a whole session that unlocks,
 * speaks words at both speeds, prompts, the voice check and every sound effect.
 */
test('speech and sound make no request, and nothing audio is ever fetched', async ({ page, baseURL }) => {
  // A whole session in one test; WebKit on a loaded runner needs the room.
  test.setTimeout(90_000);
  const requests: Request[] = [];
  page.on('request', (r) => requests.push(r));
  const origin = new URL(baseURL as string).origin;

  await page.goto('/');
  await page.getByTestId('start').click();
  await expect(page).toHaveURL(/#\/setup$/);
  await page.goto('/#/parent/speech');
  await expect(page.locator('[data-word-id="fruit.banana"]')).toBeVisible();
  // Everything the screen needs (its pictures) has loaded; from here on, only speech and sound.
  await expect
    .poll(() => page.evaluate(() => [...document.images].every((img) => img.complete)), { timeout: 30_000 })
    .toBe(true);
  await page.waitForTimeout(300);
  const before = requests.length;

  for (const at of ['slow', 'normal'] as const) {
    await page.locator(`[data-speed="${at}"]`).click();
    for (const id of ['fruit.banana', 'colours.red', 'numbers.seven', 'pets-farm.duck']) {
      await page.locator(`[data-word-id="${id}"]`).click();
    }
  }
  for (const name of [/„banana” wolno/, /„banana” normalnie/, /^Polski:/]) {
    await page.getByRole('button', { name }).click();
  }
  for (const effect of ['tap', 'correct', 'sparkle', 'wiggle', 'chest-creak', 'pop']) {
    await page.locator(`[data-effect="${effect}"]`).click();
  }
  await page.waitForTimeout(1500);

  expect(requests.slice(before).map((r) => r.url()), 'requests while speaking').toEqual([]);
  expect(requests.filter((r) => new URL(r.url()).origin !== origin).map((r) => r.url()), 'other origins').toEqual([]);
  const audio = requests.filter((r) => r.resourceType() === 'media' || AUDIO_FILE.test(r.url()));
  expect(audio.map((r) => r.url()), 'audio requests').toEqual([]);
  for (const r of requests) {
    const type = (await r.response())?.headers()['content-type'] ?? '';
    expect(type, r.url()).not.toMatch(/^audio\//);
  }
});
