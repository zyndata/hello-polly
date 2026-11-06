import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun } from './family';
import { fakeSpeech, spoken } from './speech';

/**
 * A finger resting on a picture is still a tap (STATE.md decision 103). A phone browser turns
 * a long touch into a long press and sends the pointer events but no `click` (Chrome on
 * Android); the specs replay exactly that, since no desktop engine reproduces the gesture.
 */

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

const texts = (page: Page) => spoken(page).then((s) => s.map((r) => r.text));

async function centre(target: Locator): Promise<{ x: number; y: number }> {
  const box = await target.boundingBox();
  if (!box) throw new Error('not on screen');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** A touch held for `ms` that the browser ends without a click, as a long press does. */
async function holdTouch(target: Locator, ms: number): Promise<void> {
  const { x, y } = await centre(target);
  const send = (type: string) =>
    target.evaluate(
      (el, { type, x, y }) =>
        el.dispatchEvent(
          new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y, bubbles: true, cancelable: true, composed: true })
        ),
      { type, x, y }
    );
  await send('pointerdown');
  await target.page().waitForTimeout(ms);
  await send('pointerup');
}

/** A mouse button held for `ms` over the target. */
async function holdMouse(target: Locator, ms: number): Promise<void> {
  const { x, y } = await centre(target);
  const page = target.page();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function toFirstPick(page: Page): Promise<Locator> {
  const pick = page.getByTestId('pick');
  for (let i = 0; i < 6 && !(await pick.isVisible()); i++) {
    const picture = page.getByTestId('lesson-word').locator('button');
    await expect(picture.or(pick)).toBeVisible();
    if (await pick.isVisible()) break;
    await picture.click();
    await page.getByTestId('next').click();
  }
  await expect(pick).toBeVisible();
  return pick;
}

test('a picture held down for a second still says its word, and still answers a pick', async ({ page }) => {
  test.setTimeout(60_000);
  await firstRun(page);
  await page.getByTestId('sail').click();

  // Look and listen: nothing moves on until the picture is tapped; a held finger counts.
  const picture = page.getByTestId('lesson-word').locator('button');
  await expect(page.getByTestId('next')).toHaveCount(0);
  const word = (await picture.getAttribute('aria-label')) as string;
  await holdTouch(picture, 1200);
  await expect(page.getByTestId('next')).toBeVisible();
  await expect.poll(() => texts(page).then((t) => t.at(-1))).toBe(word);

  // A pick: a picture held down is answered, and counted once.
  const pick = await toFirstPick(page);
  const target = (await pick.getAttribute('data-target')) as string;
  const wrong = pick.locator(`[data-word-id]:not([data-word-id="${target}"])`).first();
  await holdTouch(wrong, 1200);
  await expect(pick).toHaveAttribute('data-misses', '1');
  await page.waitForTimeout(1200);
  await expect(pick).toHaveAttribute('data-misses', '1');
});

test('a held mouse press is still one tap, never two', async ({ page }) => {
  test.setTimeout(60_000);
  await firstRun(page);
  await page.getByTestId('sail').click();
  const pick = await toFirstPick(page);
  const target = (await pick.getAttribute('data-target')) as string;
  const wrong = pick.locator(`[data-word-id]:not([data-word-id="${target}"])`).first();
  await holdMouse(wrong, 1200);
  await expect(pick).toHaveAttribute('data-misses', '1');
  await page.waitForTimeout(1200);
  await expect(pick).toHaveAttribute('data-misses', '1');
});
