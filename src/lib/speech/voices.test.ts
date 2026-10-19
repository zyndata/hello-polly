import { describe, expect, it } from 'vitest';
import type { EngineVoice } from './engine';
import { baseLang, chooseVoice, normaliseLang } from './voices';

const v = (name: string, lang: string, local = true, isDefault = false): EngineVoice => ({ id: name, name, lang, local, isDefault });

describe('normaliseLang', () => {
  it.each([
    ['en_GB', 'en-GB'],
    ['EN-gb', 'en-GB'],
    ['pl-PL', 'pl-PL'],
    ['pl', 'pl'],
    ['zh-Hant-TW', 'zh-Hant-TW']
  ])('%s → %s', (input, output) => expect(normaliseLang(input)).toBe(output));

  it('baseLang takes the language part', () => expect(baseLang('en_US')).toBe('en'));
});

describe('chooseVoice', () => {
  const voices = [
    v('Google UK English Female', 'en-GB', false),
    v('Daniel', 'en-GB'),
    v('Samantha', 'en-US', true, true),
    v('Zosia', 'pl-PL'),
    v('Paulina', 'pl_PL', false)
  ];

  it.each<[string, string, string | undefined, string | undefined]>([
    ['exact language, local first', 'en-GB', undefined, 'Daniel'],
    ['the preferred voice wins', 'en-GB', 'Google UK English Female', 'Google UK English Female'],
    ['a preferred voice of the same base language is allowed', 'en-GB', 'Samantha', 'Samantha'],
    ['a preferred voice of another language is ignored', 'en-GB', 'Zosia', 'Daniel'],
    ['a preferred voice that disappeared is ignored', 'en-GB', 'Gone', 'Daniel'],
    ['exact match for American', 'en-US', undefined, 'Samantha'],
    ['Polish, local first', 'pl-PL', undefined, 'Zosia'],
    ['no exact match: same base language, the local default first', 'en-AU', undefined, 'Samantha'],
    ['nothing for the language', 'de-DE', undefined, undefined]
  ])('%s', (_name, tag, preferred, expected) => {
    expect(chooseVoice(voices, tag, preferred)?.name).toBe(expected);
  });

  it('falls back to American when there is no British voice', () => {
    expect(chooseVoice([v('Samantha', 'en-US'), v('Zosia', 'pl-PL')], 'en-GB')?.name).toBe('Samantha');
  });

  it('prefers the platform default among equally local voices, then the name', () => {
    expect(chooseVoice([v('B', 'en-GB'), v('C', 'en-GB', true, true), v('A', 'en-GB')], 'en-GB')?.name).toBe('C');
    expect(chooseVoice([v('B', 'en-GB'), v('A', 'en-GB')], 'en-GB')?.name).toBe('A');
  });

  it('takes a network voice when it is the only one', () => {
    expect(chooseVoice([v('Paulina', 'pl-PL', false)], 'pl-PL')?.name).toBe('Paulina');
  });
});
