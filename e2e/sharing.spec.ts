import type { Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { childMeetsAWord, connectFromFamily, focus, openFamily, ownDevice } from './drive';
import { firstRun, openPanel } from './family';
import { FakeDrive, cspViolations, installFakeGoogle, openDevice, pickerBuilds } from './fake-google';
import { passGate } from './gate';
import { readFamily } from './progress';
import { fakeSpeech } from './speech';
import { canonicalJson } from '../src/lib/domain/lww';
import type { FamilyFile } from '../src/lib/types';

/**
 * PLAN.md Phase 8: inviting the second parent. Two browser contexts over one `FakeDrive` on
 * *different* Google accounts (told apart by their token): Anna (the default account) owns the
 * family; Bartek is invited, opens the link, signs in, and picks the file in the (fake) Google
 * Picker, served at its real URLs so the shipped CSP is what allows it.
 */

const BARTEK = { permissionId: 'perm-bartek', emailAddress: 'bartek@example.com', displayName: 'Bartek' };
const OBCY = { permissionId: 'perm-obcy', emailAddress: 'obcy@example.com', displayName: 'Ktoś inny' };

let drive: FakeDrive;

test.beforeEach(async ({ page }) => {
  drive = new FakeDrive();
  drive.addAccount('token-bartek', BARTEK);
  drive.addAccount('token-obcy', OBCY);
  await installFakeGoogle(page.context(), drive);
  await fakeSpeech(page);
});

/** The link Drive's invitation e-mail to `email` carries. */
function invitationLink(email: string): string {
  const message = drive.invitations.find((i) => i.email === email)?.message ?? '';
  const link = message.match(/https?:\/\/\S+#\/join\/\S+/)?.[0];
  if (link === undefined) throw new Error(`No join link in the invitation to ${email}: ${message}`);
  return link;
}

/**
 * Anna: the first run with Ola, the American accent, *Rodzina* → connect → invite Bartek.
 * Ends on *Rodzina*; returns the child's and the file's ids.
 */
async function annaInvites(page: Page, email = BARTEK.emailAddress): Promise<{ child: string; fileId: string }> {
  const child = await firstRun(page, 'Ola', 'fox');
  await openPanel(page);
  await page.getByRole('link', { name: 'Mowa i głosy' }).click();
  await page.getByLabel('Amerykański (en-US)').check();
  await page.goto('/#/parent/family');
  await expect(page.getByTestId('drive')).toBeVisible();
  await openFamilyIfConfigured(page);
  await connectFromFamily(page);
  await expect(page.getByTestId('members')).toContainText(drive.account.emailAddress);
  await page.getByLabel('Adres e-mail drugiego rodzica').fill(email);
  await page.getByTestId('invite').click();
  await expect(page.getByTestId('invite-sent')).toContainText(email);
  await expect(page.locator(`[data-member="${email}"]`)).toContainText('może zmieniać');
  return { child, fileId: drive.onlyId() };
}

/** `openFamily`'s skip, for a page already on *Rodzina*. */
async function openFamilyIfConfigured(page: Page): Promise<void> {
  test.skip((await page.getByTestId('drive').getAttribute('data-status')) === 'unconfigured', 'this build has no VITE_GOOGLE_CLIENT_ID (decision 72)');
}

/** Bartek's phone, on the link, signed in: the Picker is open. */
async function bartekOpensTheLink(browser: Browser, baseURL: string, link: string, token = 'token-bartek', nextToken: string | null = null): Promise<Page> {
  const phone = await openDevice(browser, drive, baseURL, { token, nextToken });
  await phone.goto(link);
  await expect(phone.getByTestId('join')).toBeVisible();
  test.skip((await phone.getByTestId('join').getAttribute('data-step')) === 'unavailable', 'this build has no Picker key (VITE_GOOGLE_API_KEY, VITE_GOOGLE_APP_ID)');
  await phone.getByTestId('join-sign-in').click();
  return phone;
}

const picker = (page: Page) => page.frameLocator('iframe[title="Google Picker"]');

/** Picks the family file in the Picker: two taps. */
async function pickTheFile(page: Page): Promise<number> {
  await picker(page).getByTestId('picker-file').click();
  await picker(page).getByRole('button', { name: 'Wybierz' }).click();
  return 2;
}

/** Anna invites, Bartek joins with no children of his own. */
async function sharedFamily(page: Page, browser: Browser, baseURL: string) {
  const { child, fileId } = await annaInvites(page);
  const phone = await bartekOpensTheLink(browser, baseURL, invitationLink(BARTEK.emailAddress));
  await pickTheFile(phone);
  await expect(phone.getByTestId('join-done')).toBeVisible();
  return { child, fileId, phone };
}

test('the second parent, on another Google account, joins in ≤ 3 taps after sign-in and sees the children and settings', async ({
  page,
  browser,
  baseURL
}) => {
  test.setTimeout(120_000);
  const { child, fileId } = await annaInvites(page);
  const link = invitationLink(BARTEK.emailAddress);
  expect(link).toBe(`${baseURL}/#/join/${fileId}`);
  expect(drive.membersOf(fileId)).toEqual({ [drive.account.emailAddress]: 'owner', [BARTEK.emailAddress]: 'writer' });

  const phone = await bartekOpensTheLink(browser, baseURL as string, link);
  // After the sign-in: the file, „Wybierz”. Nothing else to tap before the family is there.
  const taps = await pickTheFile(phone);
  await expect(phone.getByTestId('join-done')).toBeVisible();
  expect(taps).toBeLessThanOrEqual(3);

  await expect(phone.getByTestId('join-children').locator(`[data-child="${child}"]`)).toContainText('Ola');
  const onPhone = await readFamily(phone);
  expect(onPhone.children[child]?.v.name).toBe('Ola');
  expect(onPhone.settings.accent.v).toBe('en-US');
  expect(canonicalJson(onPhone)).toBe(canonicalJson(drive.only()));
  // The Picker was shown for that one file, with this build's key and app id, for this origin.
  const [built] = await pickerBuilds(phone);
  expect(built?.fileIds).toBe(fileId);
  expect(built?.origin).toBe(baseURL);
  expect(built?.developerKey).not.toBe('');
  expect(built?.appId).not.toBe('');
  expect(drive.live()).toHaveLength(1);

  // Into the app: the child's map, and the parent panel's settings say American.
  await phone.getByTestId('join-continue').click();
  await phone.goto('/#/parent/speech');
  await passGate(phone);
  await expect(phone.getByLabel('Amerykański (en-US)')).toBeChecked();
  await phone.goto('/#/parent/family');
  await expect(phone.getByTestId('sync-account')).toHaveText(BARTEK.emailAddress);
  await expect(phone.locator(`[data-member="${BARTEK.emailAddress}"]`)).toContainText('to ty');
  await expect(phone.getByTestId('remove-member')).toHaveCount(0);
  expect(await cspViolations(phone)).toEqual([]);
  await phone.context().close();
});

test("progress made on the second parent's phone appears on the first parent's after a focus", async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const { child, phone } = await sharedFamily(page, browser, baseURL as string);
  await phone.goto(`/#/child/${child}`);
  await expect(phone.getByTestId('map')).toBeVisible();
  const word = await childMeetsAWord(phone, child);
  const bartekDevice = await ownDevice(phone);

  // Bartek's phone uploads after the debounce; Anna's phone takes it on its next focus.
  await expect
    .poll(() => Object.keys(drive.only<FamilyFile>().progress[child]?.[bartekDevice]?.introduced ?? {}), { timeout: 20_000 })
    .toContain(word);
  await focus(page);
  await expect
    .poll(async () => Object.keys((await readFamily(page)).progress[child]?.[bartekDevice]?.introduced ?? {}), { timeout: 15_000 })
    .toContain(word);
  await focus(phone);
  await expect.poll(async () => canonicalJson(await readFamily(page)) === canonicalJson(await readFamily(phone)), { timeout: 15_000 }).toBe(true);
  await phone.context().close();
});

test("removing the second parent stops their sync with a clear message, and the first parent's data is untouched", async ({
  page,
  browser,
  baseURL
}) => {
  test.setTimeout(120_000);
  const { child, fileId, phone } = await sharedFamily(page, browser, baseURL as string);

  // Anna, still on *Rodzina*: „Usuń”, „Na pewno usunąć?”.
  const row = page.locator(`[data-member="${BARTEK.emailAddress}"]`);
  await row.getByTestId('remove-member').click();
  await row.getByTestId('remove-member').click();
  await expect(row).toHaveCount(0);
  expect(drive.membersOf(fileId)).toEqual({ [drive.account.emailAddress]: 'owner' });
  const annasFile = canonicalJson(await readFamily(page));
  const onDrive = canonicalJson(drive.only());

  // Bartek's child plays on. The cycle finds the file out of reach: sync stops, quietly.
  await phone.goto(`/#/child/${child}`);
  await childMeetsAWord(phone, child);
  await focus(phone);
  await expect(phone.getByTestId('gear-dot')).toBeVisible();
  await expect(phone.getByRole('alert')).toHaveCount(0);
  await expect(phone.getByTestId('map')).toBeVisible();

  // The parent panel says what happened.
  await openPanel(phone);
  await phone.getByRole('link', { name: 'Rodzina' }).click();
  await expect(phone.getByTestId('sync-status')).toHaveText('Dostęp cofnięty');
  await expect(phone.getByTestId('sync-message')).toContainText('Dostęp do wspólnej rodziny został cofnięty');
  await expect(phone.getByTestId('second-parent')).toContainText('nie jest już wspólna');

  // Nothing of Bartek's reached the file, nothing was re-created, Anna's copy is as it was.
  expect(drive.live()).toHaveLength(1);
  expect(canonicalJson(drive.only())).toBe(onDrive);
  await focus(page);
  await page.waitForTimeout(1000);
  expect(canonicalJson(await readFamily(page))).toBe(annasFile);
  // Bartek keeps everything locally, and a reload asks Drive nothing at all.
  expect((await readFamily(phone)).children[child]?.v.name).toBe('Ola');
  drive.requests.length = 0;
  await phone.reload();
  await passGate(phone);
  await expect(phone.getByTestId('sync-status')).toHaveText('Dostęp cofnięty');
  await focus(phone);
  await phone.waitForTimeout(1000);
  expect(drive.requests.filter((r) => r.account === BARTEK.emailAddress)).toEqual([]);
  await phone.context().close();
});

test('signed in with an account that was not invited: a message naming it, then „Zmień konto”', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  const { child } = await annaInvites(page);
  const phone = await bartekOpensTheLink(browser, baseURL as string, invitationLink(BARTEK.emailAddress), 'token-obcy', 'token-bartek');

  // That account has no access: the Picker lists nothing, and the parent closes it.
  await expect(picker(phone).getByTestId('picker-empty')).toBeVisible();
  await picker(phone).getByRole('button', { name: 'Anuluj' }).click();
  await expect(phone.getByTestId('join-not-found')).toBeVisible();
  await expect(phone.getByTestId('join-account')).toHaveText(OBCY.emailAddress);
  await expect(phone.locator('iframe[title="Google Picker"]')).toHaveCount(0);

  // Nothing changed: no file of that account's own, no family on the phone.
  expect(drive.live()).toHaveLength(1);
  expect(Object.keys((await readFamily(phone).catch(() => ({ children: {} }) as unknown as FamilyFile)).children)).toEqual([]);

  // The right account, through Google's account chooser.
  await phone.getByTestId('join-switch').click();
  await pickTheFile(phone);
  await expect(phone.getByTestId('join-done')).toBeVisible();
  expect((await readFamily(phone)).children[child]?.v.name).toBe('Ola');
  await phone.context().close();
});

test('a closed Picker changes nothing, and „Spróbuj jeszcze raz” opens it again', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000);
  await annaInvites(page);
  const phone = await bartekOpensTheLink(browser, baseURL as string, invitationLink(BARTEK.emailAddress));
  await picker(phone).getByRole('button', { name: 'Anuluj' }).click();
  await expect(phone.getByTestId('join-account')).toHaveText(BARTEK.emailAddress);
  expect(drive.live()).toHaveLength(1);

  await phone.getByTestId('join-retry').click();
  await pickTheFile(phone);
  await expect(phone.getByTestId('join-done')).toBeVisible();
  await phone.context().close();
});

test('a phone with children of its own: „Dołącz” is the third tap and brings them into the shared family', async ({
  page,
  browser,
  baseURL
}) => {
  test.setTimeout(120_000);
  const { child } = await annaInvites(page);
  const phone = await openDevice(browser, drive, baseURL as string, { token: 'token-bartek' });
  const own = await firstRun(phone, 'Staś', 'lion');
  await phone.goto(invitationLink(BARTEK.emailAddress));
  test.skip((await phone.getByTestId('join').getAttribute('data-step')) === 'unavailable', 'this build has no Picker key');
  await phone.getByTestId('join-sign-in').click();

  let taps = await pickTheFile(phone);
  await expect(phone.getByTestId('join-local')).toContainText('Staś');
  await phone.getByTestId('join-merge').click();
  taps += 1;
  await expect(phone.getByTestId('join-done')).toBeVisible();
  expect(taps).toBeLessThanOrEqual(3);
  await expect(phone.getByTestId('join-children')).toContainText('Ola');
  await expect(phone.getByTestId('join-children')).toContainText('Staś');

  await focus(page);
  await expect.poll(async () => Object.keys((await readFamily(page)).children).sort(), { timeout: 15_000 }).toEqual([child, own].sort());
  await phone.context().close();
});

test('„Mam zaproszenie” in the first run takes a pasted link to the join screen', async ({ page }) => {
  const id = '1AbC-dEf_GhIjKlMnOpQrStUvWxYz0123';
  await page.goto('/#/setup');
  await page.getByRole('button', { name: 'Dalej' }).click();
  await page.getByRole('button', { name: 'Mam zaproszenie' }).click();
  await page.getByLabel('Link z zaproszenia').fill('to nie jest link');
  await page.getByTestId('invite-paste').getByRole('button', { name: 'Dalej' }).click();
  await expect(page.getByTestId('invite-paste')).toContainText('nie wygląda na link');
  await page.getByLabel('Link z zaproszenia').fill(`Otwórz: https://hellopolly.gorny.dev/#/join/${id} (przycisk)`);
  await page.getByTestId('invite-paste').getByRole('button', { name: 'Dalej' }).click();
  await expect(page).toHaveURL(new RegExp(`#/join/${id}$`));
  await expect(page.getByTestId('join')).toBeVisible();
  // Nothing has asked Google for anything yet.
  expect(drive.identityLoads).toBe(0);
  expect(drive.pickerLoads).toBe(0);
});

test('*Rodzina* before connecting offers no invitation; opening it never loads the Picker', async ({ page }) => {
  await firstRun(page);
  await openFamily(page);
  await expect(page.getByTestId('second-parent')).toContainText('Najpierw zapisz rodzinę na Dysku Google');
  await expect(page.getByTestId('invite-form')).toHaveCount(0);
  await connectFromFamily(page);
  await expect(page.getByTestId('invite-form')).toBeVisible();
  await expect(page.getByTestId('invite-link')).toHaveText(new RegExp(`#/join/${drive.onlyId()}$`));
  expect(drive.pickerLoads).toBe(0);
});

test('„Udostępnij” hands the invitation link to the system share sheet', async ({ page }) => {
  await page.addInitScript(() => {
    const shared: ShareData[] = [];
    (window as unknown as { __shared: ShareData[] }).__shared = shared;
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (data: ShareData) => void shared.push(data) });
  });
  await firstRun(page);
  await openFamily(page);
  await connectFromFamily(page);
  await page.getByTestId('invite-share').click();
  const shared = await page.evaluate(() => (window as unknown as { __shared: ShareData[] }).__shared);
  expect(shared).toHaveLength(1);
  expect(shared[0]?.url).toMatch(new RegExp(`#/join/${drive.onlyId()}$`));
  expect(shared[0]?.text).toContain('Hello Polly');
});
