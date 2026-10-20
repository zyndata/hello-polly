import { describe, expect, it } from 'vitest';
import { topic, word, words } from '../content';
import { planPicks } from './exercise';
import { PAINT, PAINT_POTS, choosePot, paintPicture, paintRounds, startPaint } from './paint';
import { SIMON_COMMANDS, simonCommands } from './simon';
import { SORT_PER_BASKET, dropIn, sortBoard, sortDone, startSort } from './sort';
import { SPY_ROUNDS, spyBoard } from './spy';

const FRUIT = ['fruit.apple', 'fruit.banana', 'fruit.orange', 'fruit.pear', 'fruit.grapes'];
const PETS = ['pets-farm.cat', 'pets-farm.dog', 'pets-farm.cow'];
const COLOURS = ['colours.red', 'colours.blue', 'colours.orange', 'colours.green'];
const seeds = Array.from({ length: 60 }, (_, i) => `seed-${i}`);
const spoken = (id: string) => (word(id)?.say ?? word(id)?.en ?? '').toLowerCase();

describe('E4/E5 rounds', () => {
  it('ask learned words only, each before any repeats, with distinct pictures that do not sound alike', () => {
    for (const seed of seeds) {
      const rounds = planPicks(FRUIT, { words }, seed, 5, 3);
      expect(new Set(rounds.map((r) => r.word)).size).toBe(5);
      for (const r of rounds) {
        if (r.kind !== 'pick') throw new Error('a pick');
        expect(r.choices).toContain(r.word);
        expect(r.choices).toHaveLength(3);
        for (const c of r.choices) expect(FRUIT).toContain(c);
        expect(new Set(r.choices.map(spoken)).size).toBe(3);
      }
    }
    expect(planPicks([], { words }, 'x')).toEqual([]);
  });
});

describe('E6 Gdzie jest…?', () => {
  it('lays out 5–8 learned things inside the scene, apart, and asks for five of them', () => {
    const learned = [...FRUIT, ...PETS, 'colours.red', 'colours.orange'];
    for (const seed of seeds) {
      const board = spyBoard(learned, words, seed);
      expect(board.items.length).toBeGreaterThanOrEqual(5);
      expect(board.items.length).toBeLessThanOrEqual(8);
      expect(board.targets).toHaveLength(SPY_ROUNDS);
      expect(new Set(board.targets).size).toBe(SPY_ROUNDS);
      const ids = board.items.map((i) => i.word as string);
      for (const t of board.targets) expect(ids).toContain(t);
      for (const id of ids) expect(learned).toContain(id);
      expect(new Set(ids.map(spoken)).size).toBe(ids.length);
      for (const [n, a] of board.items.entries()) {
        const cy = (a.y * 75) / 100;
        expect(a.x - a.size / 2).toBeGreaterThanOrEqual(0);
        expect(a.x + a.size / 2).toBeLessThanOrEqual(100);
        expect(cy - a.size / 2).toBeGreaterThanOrEqual(0);
        expect(cy + a.size / 2).toBeLessThanOrEqual(75);
        for (const b of board.items.slice(n + 1)) {
          const apart = Math.abs(a.x - b.x) >= a.size || Math.abs(cy - (b.y * 75) / 100) >= a.size;
          expect(apart, `${a.word} / ${b.word}`).toBe(true);
        }
      }
      expect(spyBoard(learned, words, seed)).toEqual(board);
    }
  });

  it('with exactly five learned things, shows and asks for all five', () => {
    const board = spyBoard(FRUIT, words, 'five');
    expect(board.items.map((i) => i.word).sort()).toEqual([...FRUIT].sort());
    expect([...board.targets].sort()).toEqual([...FRUIT].sort());
  });
});

describe('E7 Polly mówi', () => {
  it('asks for every learned body part before repeating, never twice in a row', () => {
    const body = topic('body')?.words.slice(0, 4) ?? [];
    for (const seed of seeds) {
      const commands = simonCommands(body, seed);
      expect(commands).toHaveLength(SIMON_COMMANDS);
      expect(new Set(commands.slice(0, 4)).size).toBe(4);
      for (let i = 1; i < commands.length; i++) expect(commands[i]).not.toBe(commands[i - 1]);
    }
    expect(simonCommands([], 's')).toEqual([]);
  });
});

describe('E8 Pokoloruj', () => {
  it('has a paint for every colour word', () => {
    expect(Object.keys(PAINT).sort()).toEqual([...(topic('colours')?.words ?? [])].sort());
  });

  it('asks for learned colours on learned things, three pots that do not sound alike, never orange on an orange', () => {
    for (const seed of seeds) {
      const rounds = paintRounds(COLOURS, ['fruit.orange', 'fruit.apple'], words, seed);
      expect(rounds).toHaveLength(5);
      for (const r of rounds) {
        expect(r.pots).toContain(r.colour);
        expect(r.pots).toHaveLength(PAINT_POTS);
        for (const p of r.pots) expect(COLOURS).toContain(p);
        expect(new Set(r.pots.map(spoken)).size).toBe(PAINT_POTS);
        if (r.thing === 'fruit.orange') expect(r.pots).not.toContain('colours.orange');
      }
    }
  });

  it('paints only with the right pot; a wrong pot is put back, and the second miss is a hint', () => {
    const round = { thing: 'fruit.apple', colour: 'colours.red', pots: ['colours.blue', 'colours.red', 'colours.green'] };
    let state = startPaint();
    expect(paintPicture(round, state).outcome).toEqual({ kind: 'no-pot' });
    state = choosePot(state, 'colours.blue');
    let step = paintPicture(round, state);
    expect(step.outcome).toEqual({ kind: 'retry', misses: 1 });
    expect(step.state).toEqual({ pot: null, misses: 1, painted: false });
    step = paintPicture(round, choosePot(step.state, 'colours.green'));
    expect(step.outcome).toEqual({ kind: 'hint', misses: 2 });
    step = paintPicture(round, choosePot(step.state, 'colours.red'));
    expect(step.outcome).toEqual({ kind: 'correct', misses: 2 });
    expect(step.state.painted).toBe(true);
    // Painted is final.
    expect(choosePot(step.state, 'colours.blue')).toBe(step.state);
    expect(paintPicture(round, step.state).outcome).toEqual({ kind: 'no-pot' });
  });
});

describe('E9 Kosze', () => {
  it('picks two topics with three learned words each, and six pictures that belong to them', () => {
    const learned = [...FRUIT, ...PETS, 'colours.red', 'colours.blue'];
    for (const seed of seeds) {
      const board = sortBoard(learned, words, seed);
      if (!board) throw new Error('a board');
      expect(new Set(board.baskets)).toEqual(new Set(['fruit', 'pets-farm']));
      expect(board.items).toHaveLength(2 * SORT_PER_BASKET);
      for (const id of board.items) {
        expect(learned).toContain(id);
        expect(board.home[id]).toBe(word(id)?.topic);
      }
    }
    expect(sortBoard([...FRUIT, 'pets-farm.cat'], words, 'x')).toBeUndefined();
  });

  it('drops a picture only into its own basket; the second miss is a hint', () => {
    const board = sortBoard([...FRUIT, ...PETS], words, 'drop');
    if (!board) throw new Error('a board');
    let state = startSort();
    const first = board.items[0] as string;
    const wrong = board.baskets.find((b) => b !== board.home[first]) as string;
    let step = dropIn(board, state, wrong);
    expect(step.outcome).toEqual({ kind: 'retry', misses: 1 });
    step = dropIn(board, step.state, wrong);
    expect(step.outcome).toEqual({ kind: 'hint', misses: 2 });
    expect(step.state.index).toBe(0);
    step = dropIn(board, step.state, board.home[first] as string);
    expect(step.outcome).toEqual({ kind: 'correct', misses: 2 });
    state = step.state;
    for (const id of board.items.slice(1)) state = dropIn(board, state, board.home[id] as string).state;
    expect(sortDone(board, state)).toBe(true);
  });
});
