import { describe, expect, it } from 'vitest';
import { MEMORY_PAIRS, flip, hideOpen, memoryBoard, memoryDone, startMemory } from './memory';

const POOL = ['fruit.apple', 'fruit.pear', 'fruit.banana', 'fruit.lemon', 'fruit.mango'];

describe('Memory', () => {
  it('lays out each of three words twice, fixed by the seed', () => {
    const board = memoryBoard(POOL, 's');
    expect(board).toHaveLength(MEMORY_PAIRS * 2);
    for (const w of new Set(board)) expect(board.filter((x) => x === w)).toHaveLength(2);
    expect(memoryBoard(POOL, 's')).toEqual(board);
    expect(memoryBoard(POOL, 's', 2)).toHaveLength(4);
  });

  it('keeps a pair open and turns two different cards back', () => {
    const board = ['a', 'b', 'a', 'b'];
    let r = flip(board, startMemory(), 0);
    expect(r.outcome).toBe('first');
    expect(flip(board, r.state, 0).outcome).toBe('ignored');
    r = flip(board, r.state, 1);
    expect(r.outcome).toBe('nopair');
    expect(r.state.open).toEqual([0, 1]);
    expect(flip(board, r.state, 2).outcome).toBe('ignored');
    let s = hideOpen(r.state);
    s = flip(board, s, 0).state;
    r = flip(board, s, 2);
    expect(r.outcome).toBe('pair');
    expect(r.state).toEqual({ open: [], matched: ['a'] });
    expect(flip(board, r.state, 0).outcome).toBe('ignored');
    expect(memoryDone(board, r.state)).toBe(false);
    s = flip(board, flip(board, r.state, 1).state, 3).state;
    expect(memoryDone(board, s)).toBe(true);
  });
});
