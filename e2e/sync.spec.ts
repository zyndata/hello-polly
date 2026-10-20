import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { firstRun, openPanel } from './family';
import {
  DRIVE_FILE_SCOPE,
  FakeDrive,
  cspViolations,
  driveConfigured,
  googlePrompts,
  googleScopes,
  installFakeGoogle,
  openDevice,
  setGoogleSession
} from './fake-google';
import { passGate } from './gate';
import { readFamily } from './progress';
import { fakeSpeech } from './speech';
import { canonicalJson } from '../src/lib/domain/lww';
import type { FamilyFile } from '../src/lib/types';

/**
 * PLAN.md Phase 7: Drive sync for one account on many devices. The app runs its real GIS
 * client, Drive client and sync engine; only Google is faked (e2e/fake-google.ts). Two browser
 * contexts over one `FakeDrive` are two devices signed in to the same account.
 */

let drive: FakeDrive;

test.beforeEach(async ({ page }) => {
  drive = new FakeDrive();
  await installFakeGoogle(page.context(), drive);
  await fakeSpeech(page);
});

/** From the child's map, through the gate, to *Rodzina*. */
async function openFamily(page: Page): Promise<void> {
  await openPanel(page);
  await page.getByRole('link', { name: 'Rodzina' }).click();
  await expect(page.getByTestId('drive')).toBeVisible();
  test.skip(!(await driveConfigured(page)), 'this build has no VITE_GOOGLE_CLIENT_ID (decision 72)');
}

async function connectFromFamily(page: Page): Promise<void> {
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sync-status')).toHaveText('Połączono');
}

/** The first run, then *Rodzina* → connect, then back to the child's map. Returns the child's id. */
async function connectedDevice(page: Page): Promise<string> {
  const child = await firstRun(page);
  await openFamily(page);
  await connectFromFamily(page);
  await page.goto(`/#/child/${child}`);
  await expect(page.getByTestId('map')).toBeVisible();
  return child;
}

/** A second device of the same account: the first run's „Mam już rodzinę na Dysku Google”. */
async function joinFromSetup(page: Page): Promise<string> {
  await page.goto('/#/setup');
  await page.getByRole('button', { name: 'Dalej' }).click();
  test.skip(!(await page.getByTestId('setup-drive').isVisible()), 'this build has no VITE_GOOGLE_CLIENT_ID (decision 72)');
  await page.getByTestId('setup-drive').click();
  await expect(page).toHaveURL(/#\/child\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('map')).toBeVisible();
  return page.url().split('/child/')[1] as string;
}

/** The child plays: opens the next island and taps the first big picture (written at once). */
async function childMeetsAWord(page: Page, child: string): Promise<string> {
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
async function focus(page: Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}

async function ownDevice(page: Page): Promise<string> {
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

const devicesOnDrive = (child: string) => Object.keys(drive.only<FamilyFile>().progress[child] ?? {}).sort();

test('a device that never connected makes no Google request at all', async ({ page }) => {
  const child = await firstRun(page);
  await childMeetsAWord(page, child);
  await openPanel(page);
  await page.getByRole('link', { name: 'Rodzina' }).click();
  await expect(page.getByTestId('drive')).toBeVisible();
  await page.reload();
  await passGate(page);
  await page.waitForTimeout(1000);

  expect(drive.identityLoads, 'the GIS script was fetched').toBe(0);
  expect(drive.requests, 'Drive requests').toEqual([]);
});

test('connecting asks for drive.file and creates the family file with the child', async ({ page }) => {
  const child = await firstRun(page, 'Ola');
  await openFamily(page);
  await connectFromFamily(page);

  await expect(page.getByTestId('sync-account')).toHaveText('rodzic@example.com');
  expect(await googlePrompts(page)).toEqual(['consent']);
  expect(await googleScopes(page)).toEqual([DRIVE_FILE_SCOPE]);
  const onDrive = drive.only<FamilyFile>();
  expect(onDrive.children[child]?.v.name).toBe('Ola');
  expect(canonicalJson(onDrive)).toBe(canonicalJson(await readFamily(page)));
  expect(drive.liveFolders()).toEqual([['HelloPolly']]);
  expect(await cspViolations(page)).toEqual([]);
});

test('a closed consent window changes nothing', async ({ page }) => {
  await firstRun(page);
  await openFamily(page);
  await setGoogleSession(page, { dismissPopup: true });
  await page.getByTestId('connect').click();
  await expect(page.getByTestId('sync-failure')).toBeVisible();
  await expect(page.getByTestId('connect')).toBeVisible();
  expect(drive.live()).toEqual([]);
});

test('two devices playing at the same time converge, and nothing is lost', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const child = await connectedDevice(page);
  const tablet = await openDevice(browser, drive, baseURL as string);
  expect(await joinFromSetup(tablet)).toBe(child);

  // The same child on both, at once, neither waiting for the other.
  await childMeetsAWord(page, child);
  await childMeetsAWord(tablet, child);
  const [phoneId, tabletId] = [await ownDevice(page), await ownDevice(tablet)];

  // The debounce after a change uploads on its own (≈ 5 s); focus brings the other side in.
  await expect.poll(() => devicesOnDrive(child), { timeout: 20_000 }).toEqual([phoneId, tabletId].sort());
  await focus(page);
  await focus(tablet);
  await expect
    .poll(async () => canonicalJson(await readFamily(page)) === canonicalJson(await readFamily(tablet)), { timeout: 15_000 })
    .toBe(true);
  expect(canonicalJson(drive.only())).toBe(canonicalJson(await readFamily(page)));

  // Derived state follows: each device sees both devices' words as met.
  const file = await readFamily(page);
  for (const id of [phoneId, tabletId]) expect(Object.keys(file.progress[child]?.[id]?.introduced ?? {})).toHaveLength(1);
  expect(await cspViolations(tablet)).toEqual([]);
  await tablet.context().close();
});

test('an interleaved upload race: the overwritten delta comes back on the next cycle', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const child = await connectedDevice(page);
  const tablet = await openDevice(browser, drive, baseURL as string);
  await joinFromSetup(tablet);
  // Let both settle so each holds the file's latest version as its baseline.
  await focus(page);
  await focus(tablet);
  await page.waitForTimeout(1500);
  const [phoneId, tabletId] = [await ownDevice(page), await ownDevice(tablet)];

  // The phone's upload is parked after its guard passed; the tablet's whole cycle lands; then
  // the phone's stale upload overwrites it. The race PLAN.md accepts.
  const held = drive.holdNextUpload();
  await childMeetsAWord(page, child);
  await focus(page);
  await held.arrived;
  await childMeetsAWord(tablet, child);
  await focus(tablet);
  await expect.poll(() => devicesOnDrive(child).includes(tabletId), { timeout: 15_000 }).toBe(true);
  held.release();
  await expect.poll(() => devicesOnDrive(child).includes(tabletId), { timeout: 15_000 }).toBe(false);
  expect(devicesOnDrive(child)).toContain(phoneId);

  // The tablet still has its delta, sees the file moved, merges and re-adds it.
  await focus(tablet);
  await expect.poll(() => devicesOnDrive(child), { timeout: 15_000 }).toEqual([phoneId, tabletId].sort());
  await focus(page);
  await expect
    .poll(async () => canonicalJson(await readFamily(page)) === canonicalJson(await readFamily(tablet)), { timeout: 15_000 })
    .toBe(true);
  expect(canonicalJson(drive.only())).toBe(canonicalJson(await readFamily(page)));
  await tablet.context().close();
});

test('an expired token never shows anything on a child screen; the gate renews it', async ({ page }) => {
  test.setTimeout(90_000);
  const child = await connectedDevice(page);
  const promptsBefore = (await googlePrompts(page)).length;

  // Google stops accepting the token while the child plays.
  const phoneId = await ownDevice(page);
  drive.revokeToken('e2e-token-1');
  drive.requests.length = 0;
  const word = await childMeetsAWord(page, child);
  await focus(page);
  await expect.poll(() => drive.requests.some((r) => r.url.startsWith('/drive/v3/files/')), { timeout: 10_000 }).toBe(true);
  await page.waitForTimeout(1000);

  // Nothing on the child's screen: no popup, no dialog, no text, still the map. Only the
  // gear's small dot says that progress is waiting (decision 67).
  await expect(page).toHaveURL(new RegExp(`#/child/${child}$`));
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect((await googlePrompts(page)).length, 'a Google window was asked for').toBe(promptsBefore);
  await expect(page.getByTestId('gear-dot')).toBeVisible();
  expect(await page.getByTestId('gear-dot').textContent()).toBe('');

  // More play makes no Google request at all now: the token is gone and nobody asks for one.
  const count = drive.requests.length;
  await childMeetsAWord(page, child);
  await focus(page);
  await page.waitForTimeout(1500);
  expect(drive.requests.length).toBe(count);

  // A parent passes the gate: that tap renews silently, and the waiting progress lands.
  await setGoogleSession(page, { token: 'e2e-token-2' });
  drive.validTokens.add('e2e-token-2');
  await openPanel(page);
  await expect.poll(() => googlePrompts(page)).toContain('');
  await expect.poll(() => Object.keys(drive.only<FamilyFile>().progress[child]?.[phoneId]?.introduced ?? {}), { timeout: 15_000 }).toContain(word);
  await page.getByRole('link', { name: 'Rodzina' }).click();
  await expect(page.getByTestId('sync-status')).toHaveText('Połączono');
});

test('a token that ran out is not renewed on reload, and nothing is asked of Google', async ({ page }) => {
  const child = await connectedDevice(page);
  const loads = drive.identityLoads;
  await page.evaluate(() => {
    const raw = sessionStorage.getItem('hp.driveToken');
    if (raw) sessionStorage.setItem('hp.driveToken', JSON.stringify({ ...JSON.parse(raw), expiresAt: Date.now() - 1000 }));
  });
  drive.requests.length = 0;
  await page.reload();
  await expect(page.getByTestId('map')).toBeVisible();
  await childMeetsAWord(page, child);
  await focus(page);
  await page.waitForTimeout(1500);

  expect(drive.requests).toEqual([]);
  expect(drive.identityLoads).toBe(loads);
  await expect(page.getByTestId('gear-dot')).toBeVisible();
});

test('a reload keeps the session without loading Google Identity Services', async ({ page }) => {
  const child = await connectedDevice(page);
  const loads = drive.identityLoads;
  await page.reload();
  await expect(page.getByTestId('map')).toBeVisible();
  await childMeetsAWord(page, child);
  await focus(page);
  await expect.poll(() => Object.keys(drive.only<FamilyFile>().progress[child] ?? {}).length, { timeout: 15_000 }).toBe(1);
  expect(drive.identityLoads).toBe(loads);
  await expect(page.getByTestId('gear-dot')).toHaveCount(0);
});

test('disconnecting keeps every child and stops all Google traffic', async ({ page }) => {
  const child = await connectedDevice(page);
  await openFamily(page);
  await page.getByTestId('disconnect').click();
  await page.getByTestId('disconnect-confirm').click();
  await expect(page.getByTestId('connect')).toBeVisible();
  drive.requests.length = 0;

  await page.goto(`/#/child/${child}`);
  await childMeetsAWord(page, child);
  await focus(page);
  await page.waitForTimeout(1500);
  expect(drive.requests).toEqual([]);
  expect(Object.keys((await readFamily(page)).children)).toEqual([child]);
  await expect(page.getByTestId('gear-dot')).toHaveCount(0);
});
