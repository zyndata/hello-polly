import { expect, type Page } from '@playwright/test';

export interface PlayedPick {
  target: string;
  choices: string[];
}

export interface PlayedLesson {
  /** The words met in look-and-listen, in order. */
  introduced: string[];
  picks: PlayedPick[];
}

/** The current step's index, or `finished`, at this instant. */
const stepNow = (page: Page) =>
  page.evaluate(() =>
    document.querySelector('[data-testid="lesson-finished"]')
      ? 'finished'
      : (document.querySelector('[data-testid="step"]')?.getAttribute('data-index') ?? 'none')
  );

/**
 * Plays the open lesson to its finish screen, always tapping the right picture. `onPick` may
 * act first (tap wrong pictures, check things); the walker then taps the target.
 */
export async function playLesson(page: Page, onPick?: (pick: PlayedPick, n: number) => Promise<void>): Promise<PlayedLesson> {
  const played: PlayedLesson = { introduced: [], picks: [] };
  const step = page.getByTestId('step');
  const finished = page.getByTestId('lesson-finished');
  for (;;) {
    await expect(step.or(finished)).toBeVisible();
    if (await finished.isVisible()) return played;
    const index = await step.getAttribute('data-index');
    if ((await step.getAttribute('data-kind')) === 'introduce') {
      const picture = page.getByTestId('lesson-word');
      played.introduced.push((await picture.getAttribute('data-word')) as string);
      // Nothing moves on until the picture is tapped.
      await expect(page.getByTestId('next')).toHaveCount(0);
      await picture.locator('button').click();
      await page.getByTestId('next').click();
    } else {
      const pick = page.getByTestId('pick');
      const target = (await pick.getAttribute('data-target')) as string;
      const choices = await pick.locator('[data-word-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-word-id') as string));
      const entry = { target, choices };
      played.picks.push(entry);
      await onPick?.(entry, played.picks.length - 1);
      await pick.locator(`[data-word-id="${target}"]`).click();
    }
    // Read in one go: a locator would wait forever for a step the finish screen replaced.
    await expect.poll(() => stepNow(page), { timeout: 20_000 }).not.toBe(index);
  }
}
