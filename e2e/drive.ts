import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { driveConfigured } from './fake-google';
import { firstRun, openPanel } from './family';

/** Drive steps a parent and a child take, shared by the sync and sharing specs. */

/** From the child's map, through the gate, to *Rodzina*. */
export async function openFamily(page: Page): Promise<void> {
  await openPanel(page);
  await page.getByRole('link', { name: 'Rodzina' }).click();
  await expect(page.getByTestId('drive')).toBeVisible();
  test.skip(!(await driveConfigured(page)), 'this build has no VITE_GOOGLE_CLIENT_ID (decision 72)');
}

export async function connectFromFamily(page: Page): Promise<void> {
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sync-status')).toHaveText('Połączono');
}

/** The first run, then *Rodzina* → connect, then back to the child's map. Returns the child's id. */
export async function connectedDevice(page: Page): Promise<string> {
  const child = await firstRun(page);
  await openFamily(page);
  await connectFromFamily(page);
  await page.goto(`/#/child/${child}`);
  await expect(page.getByTestId('map')).toBeVisible();
  return child;
}

/** A second device of the same account: the first run's „Mam już rodzinę na Dysku Google”. */
export async function joinFromSetup(page: Page): Promise<string> {
  await page.goto('/#/setup');
  await page.getByRole('button', { name: 'Dalej' }).click();
  test.skip(!(await page.getByTestId('setup-drive').isVisible()), 'this build has no VITE_GOOGLE_CLIENT_ID (decision 72)');
  await page.getByTestId('setup-drive').click();
  await expect(page).toHaveURL(/#\/child\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('map')).toBeVisible();
  return page.url().split('/child/')[1] as string;
}

/** The child plays: opens the next island and taps the first big picture (written at once). */
export async function childMeetsAWord(page: Page, child: string): Promise<string> {
  await page.getByTestId('sail').click();
  const picture = page.getByTestId('lesson-word');
  const word = (await picture.getAttribute('data-word')) as string;
  await picture.locator('button').click();
  await expect(page.getByTestId('next')).toBeVisible();
  await page.goto(`/#/child/${child}`);
  await expect(page.getByTestId('map')).toBeVisible();
  return word;
}

/** A focus event: one of PLAN.md's triggers, and faster than the 5 s debounce. */
export async function focus(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

export async function ownDevice(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('hello-polly');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('meta').objectStore('meta').get('deviceId');
          get.onsuccess = () => {
            open.result.close();
            resolve((get.result as { value: string }).value);
          };
        };
      })
  );
}
