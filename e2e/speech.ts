import type { Page } from '@playwright/test';
import { installSpeechFake, type SpeechFakeOptions, type SpokenRecord } from '../src/lib/speech/fake';
import prompts from '../content/prompts.json' with { type: 'json' };

declare global {
  interface Window {
    __speech?: { spoken: SpokenRecord[]; cancels: number };
  }
}

/** Replaces the page's Web Speech API with the recording fake, before any script runs. */
export async function fakeSpeech(page: Page, options: SpeechFakeOptions = {}): Promise<void> {
  await page.addInitScript(installSpeechFake, options);
}

/** The Polish parts of a prompt line, as the speaker splits it around `{word}`. */
const parts = (line: string) => line.split('{word}').map((part) => part.trim());

/**
 * Each Polish part of a prompt variant → the same part of the prompt's `pl` (STATE.md decision
 * 102). Polly picks a variant at random; the specs assert the `pl` line, whichever she said.
 */
const primaryPart = new Map<string, string>();
for (const p of prompts as { pl: string; variants?: string[] }[]) {
  const primary = parts(p.pl);
  for (const variant of p.variants ?? []) {
    for (const [i, part] of parts(variant).entries()) {
      // A lone „!” is never spoken.
      if (!/[\p{L}\p{N}]/u.test(part)) continue;
      const to = primary[i] ?? '';
      if (primaryPart.has(part) && primaryPart.get(part) !== to) throw new Error(`prompt variant part "${part}" is ambiguous`);
      primaryPart.set(part, to);
    }
  }
}

/** Everything spoken so far, without the unlock's silent utterance, with variants as their `pl`. */
export async function spoken(page: Page): Promise<SpokenRecord[]> {
  const records = await page.evaluate(() => window.__speech?.spoken ?? []);
  return records
    .map((r) => (r.lang.startsWith('pl') && primaryPart.has(r.text) ? { ...r, text: primaryPart.get(r.text) as string } : r))
    .filter((r) => r.text !== '');
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
