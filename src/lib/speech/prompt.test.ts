import { describe, expect, it } from 'vitest';
import prompts from '../../../content/prompts.json';
import { promptSegments, spokenForm } from './prompt';

const banana = { en: 'banana', pl: 'banan', plAcc: 'banana' };

describe('promptSegments', () => {
  it('splits Polish around the English word and drops a lone punctuation mark', () => {
    expect(promptSegments('Gdzie jest {word}?', banana)).toEqual([
      { lang: 'pl', text: 'Gdzie jest' },
      { lang: 'en', text: 'banana' }
    ]);
  });

  it('puts {plAcc} into the Polish text, falling back to `pl`', () => {
    expect(promptSegments('Dotknij {plAcc}!', banana)).toEqual([{ lang: 'pl', text: 'Dotknij banana!' }]);
    expect(promptSegments('Dotknij {plAcc}!', { en: 'cat', pl: 'kot' })).toEqual([{ lang: 'pl', text: 'Dotknij kot!' }]);
  });

  it('speaks the `say` override', () => {
    expect(promptSegments('{word}', { en: 'orange', say: 'an orange', pl: 'pomarańcza' })).toEqual([
      { lang: 'en', text: 'an orange' }
    ]);
    expect(spokenForm({ en: 'cat' })).toBe('cat');
  });

  it('keeps Polish on both sides of the word', () => {
    expect(promptSegments('To {word}, brawo!', banana).map((s) => s.lang)).toEqual(['pl', 'en', 'pl']);
  });

  it('drops {word} when no word is given', () => {
    expect(promptSegments('Gdzie jest {word}?')).toEqual([{ lang: 'pl', text: 'Gdzie jest' }]);
  });

  it('every catalog prompt yields something to say', () => {
    for (const p of prompts) expect(promptSegments(p.pl, banana).length, p.id).toBeGreaterThan(0);
  });
});
