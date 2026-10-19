/**
 * Polish prompts with an English word inside („Gdzie jest {word}?”): the template is split into
 * segments, so the Polish voice says the Polish parts and the English voice says the word.
 * `{plAcc}` is the word's Polish form after „Dotknij…”, spoken by the Polish voice.
 */

import type { Word } from '../types';

export interface Segment {
  lang: 'pl' | 'en';
  text: string;
}

/** What the speech engine reads for a word: its `say` override, or the word itself. */
export const spokenForm = (word: Pick<Word, 'en' | 'say'>): string => word.say ?? word.en;

const hasLetters = (text: string) => /[\p{L}\p{N}]/u.test(text);

/**
 * Segments of a prompt template. Polish segments with nothing to say (a lone „?”) are dropped,
 * and so is `{word}` when no word is given.
 */
export function promptSegments(template: string, word?: Pick<Word, 'en' | 'say' | 'pl' | 'plAcc'>): Segment[] {
  const withPolish = template.replace(/\{plAcc\}/g, word ? (word.plAcc ?? word.pl) : '');
  const segments: Segment[] = [];
  for (const [i, part] of withPolish.split('{word}').entries()) {
    if (i > 0 && word) segments.push({ lang: 'en', text: spokenForm(word) });
    const text = part.trim();
    if (hasLetters(text)) segments.push({ lang: 'pl', text });
  }
  return segments;
}
