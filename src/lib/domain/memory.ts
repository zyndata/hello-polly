/**
 * E3 *Memory*: face-down cards in pairs. Each flip says its word; a pair stays open, two
 * different cards turn back (the screen calls `hideOpen` after a pause). No attempt is
 * recorded: it matches pictures to pictures (STATE.md decision 44).
 */

import type { WordId } from '../types';
import { seededShuffle } from './random';

export const MEMORY_PAIRS = 3;

/** The cards in screen order: each of `pairs` words twice. */
export function memoryBoard(pool: readonly WordId[], seed: string, pairs = MEMORY_PAIRS): WordId[] {
  const chosen = seededShuffle([...new Set(pool)], `${seed}/words`).slice(0, pairs);
  return seededShuffle([...chosen, ...chosen], `${seed}/cards`);
}

export interface MemoryState {
  /** Indexes of face-up cards not matched yet (0, 1 or 2). */
  open: number[];
  matched: WordId[];
}

export const startMemory = (): MemoryState => ({ open: [], matched: [] });

export type FlipOutcome = 'ignored' | 'first' | 'pair' | 'nopair';

export function flip(board: readonly WordId[], state: MemoryState, index: number): { state: MemoryState; outcome: FlipOutcome } {
  const word = board[index];
  const ignored = { state, outcome: 'ignored' as const };
  if (word === undefined || state.open.length >= 2 || state.open.includes(index) || state.matched.includes(word)) return ignored;
  const [first] = state.open;
  if (first === undefined) return { state: { ...state, open: [index] }, outcome: 'first' };
  if (board[first] === word) return { state: { open: [], matched: [...state.matched, word] }, outcome: 'pair' };
  return { state: { ...state, open: [first, index] }, outcome: 'nopair' };
}

export const hideOpen = (state: MemoryState): MemoryState => ({ ...state, open: [] });

export const memoryDone = (board: readonly WordId[], state: MemoryState): boolean =>
  board.length > 0 && state.matched.length * 2 === board.length;
