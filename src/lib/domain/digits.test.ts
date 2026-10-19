import { describe, expect, it } from 'vitest';
import { DIGITS, digitsBoard, digitsDone, selectDigit, startDigits, tapPicture, type Digit, type DigitsBoard } from './digits';

const POOL = ['fruit.apple', 'fruit.pear', 'fruit.banana', 'fruit.lemon', 'fruit.mango'];
const board = digitsBoard(POOL, 'seed') as DigitsBoard;
const wrongFor = (d: Digit) => board.pictures.find((w) => w !== board.pairs[d]) as string;

describe('Cyferki', () => {
  it('maps four digits to four distinct words, all of them on the board', () => {
    for (let i = 0; i < 100; i++) {
      const b = digitsBoard(POOL, `s${i}`) as DigitsBoard;
      const mapped = DIGITS.map((d) => b.pairs[d]);
      expect(new Set(mapped).size).toBe(4);
      expect([...b.pictures].sort()).toEqual([...mapped].sort());
      for (const w of mapped) expect(POOL).toContain(w);
    }
    expect(digitsBoard(POOL, 'seed')).toEqual(board);
    expect(digitsBoard(POOL.slice(0, 3), 'seed')).toBeUndefined();
    expect(digitsBoard(['a', 'a', 'b', 'c'], 'seed')).toBeUndefined();
  });

  it('a correct match takes the pair off the board', () => {
    let s = selectDigit(startDigits(), 3);
    const { state, outcome } = tapPicture(board, s, board.pairs[3]);
    expect(outcome).toEqual({ kind: 'correct', digit: 3, misses: 0 });
    expect(state.matched).toEqual([3]);
    expect(state.selected).toBeNull();
    s = selectDigit(state, 3);
    expect(s.selected).toBeNull();
    // The matched picture is gone: tapping it does nothing more.
    expect(tapPicture(board, selectDigit(s, 1), board.pairs[3]).outcome).toEqual({ kind: 'none' });
  });

  it('a wrong one never takes anything off, and the second miss glows', () => {
    let s = selectDigit(startDigits(), 2);
    for (let miss = 1; miss <= 4; miss++) {
      const r = tapPicture(board, s, wrongFor(2));
      expect(r.outcome).toEqual({ kind: miss === 1 ? 'retry' : 'hint', digit: 2, misses: miss });
      expect(r.state.matched).toEqual([]);
      expect(r.state.selected).toBe(2);
      s = r.state;
    }
    const done = tapPicture(board, s, board.pairs[2]);
    expect(done.outcome).toEqual({ kind: 'correct', digit: 2, misses: 4 });
  });

  it('without a digit picked, a picture tap is only a tap', () => {
    const s = startDigits();
    expect(tapPicture(board, s, board.pictures[0] as string)).toEqual({ state: s, outcome: { kind: 'none' } });
  });

  it('is done when all four pairs are matched', () => {
    let s = startDigits();
    for (const d of DIGITS) {
      expect(digitsDone(s)).toBe(false);
      s = tapPicture(board, selectDigit(s, d), board.pairs[d]).state;
    }
    expect(digitsDone(s)).toBe(true);
  });
});
