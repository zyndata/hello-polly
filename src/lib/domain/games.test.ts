import { describe, expect, it } from 'vitest';
import { topic, words } from '../content';
import { addChild } from './children';
import { DIGITS } from './digits';
import { emptyFamily, defaultPlan } from './family';
import { DIGIT_TOPIC, digitImage, gameOpen, gamePool, isGameId, learnedWords } from './games';
import { recordAttempt } from './progress';

const T = '2026-10-19T08:00:00.000Z';

/** A family whose child has learned `ids` (three first tries over two days each). */
function learnedFamily(ids: string[], paused: string[] = []) {
  let file = addChild(emptyFamily('f'), 'c1', { name: 'Ola', avatar: 'fox' }, T, 'dev-a');
  for (const id of ids) {
    file = recordAttempt(file, 'c1', 'dev-a', id, '2026-10-17', 0);
    file = recordAttempt(file, 'c1', 'dev-a', id, '2026-10-17', 0);
    file = recordAttempt(file, 'c1', 'dev-a', id, '2026-10-18', 0);
  }
  file = recordAttempt(file, 'c1', 'dev-a', 'fruit.mango', '2026-10-18', 0);
  return { ...file, plans: { c1: { v: { ...defaultPlan(), paused }, t: T, d: 'dev-a' } } };
}

describe('the game shelf', () => {
  it('counts learned words only, never paused ones', () => {
    const file = learnedFamily(['fruit.apple', 'numbers.one', 'fruit.pear'], ['fruit.pear']);
    expect(learnedWords(file, 'c1', words)).toEqual(['numbers.one', 'fruit.apple']);
  });

  it('opens a game at four learned words, Cyferki at four outside the numbers', () => {
    const three = ['fruit.apple', 'fruit.pear', 'fruit.banana'];
    const learned = learnedWords(learnedFamily([...three, 'numbers.one']), 'c1', words);
    expect(gameOpen('listen', learned, words)).toBe(true);
    expect(gameOpen('memory', learned, words)).toBe(true);
    expect(gameOpen('digits', learned, words)).toBe(false);
    expect(gamePool('digits', learned, words)).toEqual(['fruit.apple', 'fruit.banana', 'fruit.pear']);
    const more = learnedWords(learnedFamily([...three, 'fruit.lemon']), 'c1', words);
    expect(gameOpen('digits', more, words)).toBe(true);
    expect(gameOpen('listen', learned.slice(0, 3), words)).toBe(false);
  });

  it('draws the digit tiles with the numbers topic pictures', () => {
    const numbers = topic(DIGIT_TOPIC)?.words ?? [];
    for (const d of DIGITS) expect(words.find((w) => w.id === numbers[d - 1])?.image).toBe(digitImage(d));
  });

  it('knows its game ids', () => {
    expect(isGameId('digits')).toBe(true);
    expect(isGameId('bubbles')).toBe(false);
  });
});
