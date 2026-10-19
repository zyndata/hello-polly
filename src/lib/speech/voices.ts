/** Choosing a voice for a language (STATE.md decision 22). Pure, so it is table-tested. */

import type { EngineVoice } from './engine';

/** `en_gb` / `EN-gb` → `en-GB`. Older Android reports underscores. */
export function normaliseLang(tag: string): string {
  const [language = '', ...rest] = tag.trim().replace(/_/g, '-').split('-');
  return [language.toLowerCase(), ...rest.map((part) => (part.length === 2 ? part.toUpperCase() : part))].join('-');
}

/** `en-GB` → `en`. */
export const baseLang = (tag: string): string => normaliseLang(tag).split('-')[0] ?? '';

/** Local voices first, then the platform default, then by name. */
function rank(a: EngineVoice, b: EngineVoice): number {
  return Number(b.local) - Number(a.local) || Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name);
}

/**
 * The voice to speak `tag` with: the device's preferred voice if it still exists and speaks
 * that base language; else an exact language match; else any voice of the same base language
 * (an American voice when there is no British one). `undefined` when there is none.
 */
export function chooseVoice(
  voices: readonly EngineVoice[],
  tag: string,
  preferredId?: string
): EngineVoice | undefined {
  const wanted = normaliseLang(tag);
  const base = baseLang(wanted);
  const preferred = preferredId === undefined ? undefined : voices.find((v) => v.id === preferredId);
  if (preferred && baseLang(preferred.lang) === base) return preferred;
  const exact = voices.filter((v) => normaliseLang(v.lang) === wanted).sort(rank);
  if (exact[0]) return exact[0];
  return voices.filter((v) => baseLang(v.lang) === base).sort(rank)[0];
}
