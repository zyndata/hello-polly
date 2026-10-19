import { expect, type Page } from '@playwright/test';
import { MAX_NUMBER, MIN_NUMBER, polishNumber } from '../src/lib/gate/gate';

/** The number the gate shows, read back from its Polish words. */
export async function gateNumber(page: Page): Promise<number> {
  const words = ((await page.getByTestId('gate-number').textContent()) ?? '').trim();
  for (let n = MIN_NUMBER; n <= MAX_NUMBER; n++) if (polishNumber(n) === words) return n;
  throw new Error(`Not a gate number: "${words}"`);
}

/** Types the gate's number, as a parent would. */
export async function passGate(page: Page): Promise<void> {
  const n = await gateNumber(page);
  await page.locator(`[data-key="${Math.floor(n / 10)}"]`).click();
  await page.locator(`[data-key="${n % 10}"]`).click();
  await expect(page.getByTestId('gate')).toHaveCount(0);
}

/** Opens a `/parent…` screen and passes its gate. */
export async function gotoParent(page: Page, path: string): Promise<void> {
  await page.goto(`/#${path}`);
  await passGate(page);
}
