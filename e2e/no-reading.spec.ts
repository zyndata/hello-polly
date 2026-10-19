import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { fillChild, firstRun, openPanel } from './family';
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
  test.setTimeout(60_000);
  await fakeSpeech(page);

  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
  await expectNoReading(page, 'start');

  await firstRun(page);
  await expectNoReading(page, 'map');

  await page.getByTestId('sail').click();
  await expect(page.getByTestId('lesson-word')).toBeVisible();
  await expectNoReading(page, 'lesson');
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('lesson-word').locator('button').click();
    await expect(page.getByTestId('next')).toBeVisible();
    if (i === 0) await expectNoReading(page, 'lesson, after the tap');
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('lesson-finished')).toBeVisible();
  await expectNoReading(page, 'lesson finished');
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 15_000 });
  await expectNoReading(page, 'map with a flag');

  await openPanel(page);
  await page.getByRole('button', { name: 'Dodaj dziecko' }).click();
  await fillChild(page, 'Staś', 'owl');
  await page.getByRole('button', { name: 'Dodaj dziecko' }).click();
  await page.getByTestId('to-child').click();
  await expect(page.getByTestId('picker')).toBeVisible();
  // Only the names under the avatars, which are marked as the parent's.
  await expectNoReading(page, 'picker');
  await page.getByRole('button', { name: 'Staś' }).click();
  await expect(page.getByTestId('home')).toBeVisible();
  await expectNoReading(page, 'map with home');
});
