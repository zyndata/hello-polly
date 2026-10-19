import { expect, type Page } from '@playwright/test';
import { passGate } from './gate';

/** Fills the child form: a nickname and an avatar picture by id. */
export async function fillChild(page: Page, name: string, avatar: string): Promise<void> {
  await page.getByLabel('Imię lub przezwisko').fill(name);
  await page.locator('label.avatar-option').filter({ has: page.locator(`input[value="${avatar}"]`) }).click();
}

/**
 * The first run, as a parent does it: the voice check, „Zaczynamy”, the child, the words
 * (`words` may queue some), the gate sentence, and the hand-over. Ends on the child's map;
 * returns the child's id.
 */
export async function firstRun(
  page: Page,
  name = 'Ola',
  avatar = 'fox',
  words: (page: Page) => Promise<void> = async () => {}
): Promise<string> {
  await page.goto('/#/setup');
  await expect(page.getByTestId('setup-step')).toHaveText('Krok 1 z 5');
  await page.getByRole('button', { name: 'Dalej' }).click();
  await page.getByRole('button', { name: 'Zaczynamy' }).click();
  await fillChild(page, name, avatar);
  await page.getByRole('button', { name: 'Dalej' }).click();
  await expect(page.getByTestId('plan-editor')).toBeVisible();
  await words(page);
  await page.getByRole('button', { name: 'Dalej' }).click();
  await page.getByTestId('handover').click();
  await expect(page).toHaveURL(/#\/child\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('map')).toBeVisible();
  return page.url().split('/child/')[1] as string;
}

/** From a child screen with the gear, through the gate, to the parent panel. */
export async function openPanel(page: Page): Promise<void> {
  await page.getByTestId('gear').click();
  await expect(page).toHaveURL(/#\/parent$/);
  await passGate(page);
  await expect(page.getByTestId('children')).toBeVisible();
}

/** Queues a word in the plan editor on screen (opening its topic first). */
export async function queueWord(page: Page, topic: string, word: string): Promise<void> {
  const details = page.locator(`[data-topic="${topic}"]`);
  if (!(await details.evaluate((d) => (d as HTMLDetailsElement).open))) await details.locator('summary').click();
  await page.locator(`[data-plan-word="${word}"]`).getByRole('button', { name: 'Do kolejki' }).click();
  await expect(page.locator(`[data-queue-word="${word}"]`)).toBeVisible();
}
