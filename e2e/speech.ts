import type { Page } from '@playwright/test';
import { installSpeechFake, type SpeechFakeOptions, type SpokenRecord } from '../src/lib/speech/fake';

declare global {
  interface Window {
    __speech?: { spoken: SpokenRecord[]; cancels: number };
  }
}

/** Replaces the page's Web Speech API with the recording fake, before any script runs. */
export async function fakeSpeech(page: Page, options: SpeechFakeOptions = {}): Promise<void> {
  await page.addInitScript(installSpeechFake, options);
}

/** Everything spoken so far, without the unlock's silent utterance. */
export async function spoken(page: Page): Promise<SpokenRecord[]> {
  return page.evaluate(() => (window.__speech?.spoken ?? []).filter((r) => r.text !== ''));
}

/** Every call to `speechSynthesis.speak` and `cancel`, the silent unlock included. */
export async function speechCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window.__speech ? window.__speech.spoken.length + window.__speech.cancels : 0));
}

/** The last thing spoken, as `[text, lang, rate]`. */
export async function lastSpoken(page: Page): Promise<[string, string, number] | undefined> {
  const last = (await spoken(page)).at(-1);
  return last && [last.text, last.lang, last.rate];
}
