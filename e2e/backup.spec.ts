import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { FakeDrive, cspViolations, openDevice } from './fake-google';
import { firstRun, openPanel } from './family';
import { gotoParent } from './gate';
import { playLesson } from './lesson';
import { readFamily, seedLearned, seedMinutes, seedStars } from './progress';
import { fakeSpeech } from './speech';
import { canonicalJson } from '../src/lib/domain/lww';
import { localDay } from '../src/lib/domain/time';
import type { FamilyFile } from '../src/lib/types';

/**
 * PLAN.md Phase 10 task 4: export and import of the family as JSON (STATE.md decision 97).
 * "Export → import into a fresh profile reproduces derived state exactly."
 */

test.beforeEach(async ({ page }) => {
  await fakeSpeech(page);
});

/** A child with a played lesson, learned words, a chest opened elsewhere, and minutes. */
async function familyWithHistory(page: Page): Promise<string> {
  const child = await firstRun(page, 'Ola', 'fox');
  await seedLearned(page, child, { 'fruit.apple': 2, 'fruit.banana': 1, 'fruit.pear': 1, 'colours.red': 3 });
  await seedStars(page, child, 40, { 'chest-e2e': { at: new Date().toISOString(), stickers: ['fruit.apple', 'colours.red'] } });
  await seedMinutes(page, child, 12, localDay(new Date(Date.now() - 2 * 86_400_000)));
  await page.goto(`/#/child/${child}`);
  await page.getByTestId('sail').click();
  await playLesson(page);
  await expect(page.getByTestId('map')).toBeVisible({ timeout: 15_000 });
  return child;
}

/** Everything the parent and the child see that is derived: the dashboard, the map. */
async function derivedOnScreen(page: Page, child: string): Promise<Record<string, string | null>> {
  // A child screen first: it closes a gate passed earlier, so the parent screen asks again.
  await page.goto(`/#/child/${child}`);
  await expect(page.getByTestId('map')).toBeVisible();
  await gotoParent(page, `/parent/child/${child}`);
  const dashboard = (await page.getByTestId('dashboard').innerText()).trim();
  const plan = (await page.getByTestId('plan-editor').innerText()).trim();
  await page.goto(`/#/child/${child}`);
  const map = page.getByTestId('map');
  await expect(map).toBeVisible();
  return {
    dashboard,
    plan,
    done: await map.getAttribute('data-done'),
    meter: await page.getByTestId('meter').getAttribute('data-value'),
    chests: (await page.getByTestId('chest').count()) > 0 ? await page.getByTestId('chest').getAttribute('data-unopened') : '0'
  };
}

/** „Pobierz kopię” in the panel; returns where the download was saved. */
async function exportFrom(page: Page): Promise<string> {
  await openPanel(page);
  const download = page.waitForEvent('download');
  await page.getByTestId('backup-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`hello-polly-rodzina-${localDay(new Date())}.json`);
  return file.path();
}

/** The text of the file chosen in the import's file input, read by the page. */
const chosenText = (page: Page) =>
  page.getByTestId('backup-file').evaluate((input) => (input as HTMLInputElement).files?.[0]?.text() ?? '');

/** Chooses a file with this text in the import's input, made in the page (no Node in e2e/). */
async function chooseText(page: Page, name: string, text: string): Promise<void> {
  await page.getByTestId('backup-file').evaluate(
    (input, [name, text]) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([text as string], name as string, { type: 'application/json' }));
      (input as HTMLInputElement).files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    [name, text]
  );
}

test('export → import into a fresh profile reproduces the family and every derived state', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const child = await familyWithHistory(page);
  const path = await exportFrom(page);
  const original = await readFamily(page);

  // A fresh profile: the first run's „Mam kopię zapasową”.
  const fresh = await openDevice(browser, new FakeDrive(), baseURL as string);
  await fresh.goto('/#/setup');
  await fresh.getByRole('button', { name: 'Dalej' }).click();
  await fresh.getByTestId('setup-backup').click();
  await fresh.getByTestId('backup-file').setInputFiles(path);
  // The file is the family file as stored, and nothing local-only is in it.
  const text = await chosenText(fresh);
  expect(canonicalJson(JSON.parse(text) as FamilyFile)).toBe(canonicalJson(original));
  expect(text).not.toMatch(/deviceId|access_token|driveFileId|voices/);
  await expect(fresh.getByTestId('backup-children')).toHaveText('Ola');
  await fresh.getByTestId('backup-load').click();
  await expect(fresh.getByTestId('start')).toBeVisible();
  await fresh.getByTestId('start').click();
  await expect(fresh).toHaveURL(new RegExp(`#/child/${child}$`));

  expect(canonicalJson(await readFamily(fresh))).toBe(canonicalJson(original));
  const [before, after] = [await derivedOnScreen(page, child), await derivedOnScreen(fresh, child)];
  expect(after).toEqual(before);
  expect(before.done).toBe('1');
  expect(before.dashboard).toContain('Zebrane: 2 z');
  expect(await cspViolations(fresh)).toEqual([]);
  await fresh.context().close();
});

test('an import into a device with its own child merges the two; a bad file is refused', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const ola = await familyWithHistory(page);
  const path = await exportFrom(page);

  const tablet = await openDevice(browser, new FakeDrive(), baseURL as string);
  const stas = await firstRun(tablet, 'Staś', 'lion');
  const own = await readFamily(tablet);
  await openPanel(tablet);
  await tablet.getByRole('button', { name: 'Wczytaj kopię' }).click();

  // Not a backup: a clear message, and nothing changes.
  await chooseText(tablet, 'not-a-backup.json', JSON.stringify({ hello: 'world' }));
  await expect(tablet.getByTestId('backup-error')).toContainText('To nie jest kopia zapasowa Hello Polly');
  await expect(tablet.getByTestId('backup-load')).toHaveCount(0);
  await chooseText(tablet, 'newer.json', JSON.stringify({ ...(await readFamily(page)), schema: 99 }));
  await expect(tablet.getByTestId('backup-error')).toContainText('nowsza wersja');
  expect(canonicalJson(await readFamily(tablet))).toBe(canonicalJson(own));

  await tablet.getByTestId('backup-file').setInputFiles(path);
  await tablet.getByTestId('backup-load').click();
  await expect(tablet.getByTestId('backup-done')).toBeVisible();
  await expect(tablet.getByTestId('children').locator('[data-child-id]')).toHaveCount(2);
  const merged = await readFamily(tablet);
  expect(merged.familyId).toBe(own.familyId);
  expect(Object.keys(merged.children).sort()).toEqual([ola, stas].sort());
  // Staś's own progress and Ola's from the backup are both there.
  expect(canonicalJson(merged.progress[ola])).toBe(canonicalJson((await readFamily(page)).progress[ola]));
  await tablet.context().close();
});
