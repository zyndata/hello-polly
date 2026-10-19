import { expect, test } from './fixtures';
import { notFound, screens } from '../src/lib/screens';

/** A concrete URL for a route pattern: every `:param` gets a sample value. */
function sample(path: string): string {
  return path.replace(/:[A-Za-z]+/g, 'x1');
}

/** Built child screens need a real child: with the sample id they lead back to `/` (children.spec). */
const needsChild = (s: (typeof screens)[number]) => s.path.startsWith('/child/:id') && s.built === true;

test.describe('every screen renders, under its Polish title', () => {
  for (const screen of screens.filter((s) => !needsChild(s))) {
    test(`${screen.path} → ${screen.title}`, async ({ page }) => {
      await page.goto(`/#${sample(screen.path)}`);
      await expect(page.getByRole('heading', { level: 1, name: screen.title })).toBeVisible();
      await expect(page).toHaveTitle('Hello Polly');
    });
  }

  test('an unknown path renders the not-found placeholder', async ({ page }) => {
    await page.goto('/#/nie-ma-mnie');
    await expect(page.getByRole('heading', { level: 1, name: notFound.title })).toBeVisible();
  });
});

test('the self-hosted font is the one in use', async ({ page }) => {
  await page.goto('/#/parent');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('700 16px Nunito');
  });
  expect(loaded).toBe(true);
});
