import { describe, expect, it } from 'vitest';
import { topic, words } from '../content';
import { addChild } from './children';
import { DIGITS } from './digits';
import { emptyFamily, defaultPlan } from './family';
import { DIGIT_TOPIC, GAME_IDS, basketTopics, digitImage, gameOpen, gamePool, isGameId, learnedWords, paintPools, shelfGames } from './games';
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
    expect(GAME_IDS).toEqual(['listen', 'digits', 'memory', 'bubbles', 'feed', 'spy', 'simon', 'paint', 'sort']);
    expect(isGameId('digits')).toBe(true);
    expect(isGameId('bubbles')).toBe(true);
    expect(isGameId('chess')).toBe(false);
  });

  it('opens Gdzie jest…? at five learned words, and Bańki and Nakarm Polly at four', () => {
    const four = ['fruit.apple', 'fruit.pear', 'fruit.banana', 'pets-farm.cat'];
    expect(gameOpen('bubbles', four, words)).toBe(true);
    expect(gameOpen('feed', four, words)).toBe(true);
    expect(gameOpen('spy', four, words)).toBe(false);
    expect(gameOpen('spy', [...four, 'numbers.one'], words)).toBe(true);
  });

  it('opens Polly mówi at four learned body parts, and plays only those', () => {
    const body = ['body.eyes', 'body.nose', 'body.hand'];
    const learned = [...body, 'fruit.apple', 'fruit.pear'];
    expect(gameOpen('simon', learned, words)).toBe(false);
    expect(gamePool('simon', [...learned, 'body.foot'], words)).toEqual([...body, 'body.foot']);
    expect(gameOpen('simon', [...learned, 'body.foot'], words)).toBe(true);
  });

  it('opens Pokoloruj with three learned colours and one thing to paint (not a colour or a number)', () => {
    const colours = ['colours.red', 'colours.blue', 'colours.yellow'];
    expect(paintPools([...colours, 'numbers.one', 'fruit.apple'], words)).toEqual({ colours, things: ['fruit.apple'] });
    expect(gameOpen('paint', [...colours, 'numbers.one', 'numbers.two'], words)).toBe(false);
    expect(gameOpen('paint', [...colours.slice(0, 2), 'fruit.apple', 'fruit.pear'], words)).toBe(false);
    expect(gameOpen('paint', [...colours, 'fruit.apple'], words)).toBe(true);
  });

  it('opens Kosze with two topics of three learned words each', () => {
    const fruit = ['fruit.apple', 'fruit.pear', 'fruit.banana'];
    const pets = ['pets-farm.cat', 'pets-farm.dog'];
    expect(basketTopics([...fruit, ...pets], words)).toEqual(['fruit']);
    expect(gameOpen('sort', [...fruit, ...pets], words)).toBe(false);
    expect(gameOpen('sort', [...fruit, ...pets, 'pets-farm.cow'], words)).toBe(true);
  });

  it('puts Kosze on the shelf only when the parent switched it on', () => {
    expect(shelfGames(defaultPlan())).not.toContain('sort');
    expect(shelfGames({ ...defaultPlan(), sortGame: false })).not.toContain('sort');
    expect(shelfGames({ ...defaultPlan(), sortGame: true })).toEqual(GAME_IDS);
  });
});
